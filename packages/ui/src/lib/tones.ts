// One shared context: browsers cap how many can exist, and a keypress needs to start instantly
let context: AudioContext | null = null;

function sharedContext(): AudioContext | null {
	try {
		const AudioContextClass = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextClass) return null;
		context ??= new AudioContextClass({ latencyHint: 'interactive' });
		return context;
	} catch {
		return null;
	}
}

/**
 * Lets later sounds play without a tap of their own: browsers start an AudioContext suspended until
 * a user gesture, so the wall panels call this on every touch, and the entry delay's beeps, which
 * start with nobody at the panel, can sound.
 */
export function unlockAudio(): void {
	const ctx = sharedContext();
	if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
}

export interface ChimeNote {
	frequency: number;
	/** When the note strikes, from the chime's start. */
	atMs?: number;
	gain?: number;
}

/** A short chime: one or more soft notes, each struck and left to ring out. */
export interface Chime {
	notes: ChimeNote[];
	/** How fast each note fades: the time to fall to about a third. */
	decayMs: number;
	lengthMs: number;
}

// Each note's timbre: a sine with a soft octave and a faint twelfth, a glassy tone that small
// speakers still carry (the overtones sit where they're loudest)
const CHIME_PARTIALS = [
	{ ratio: 1, gain: 1 },
	{ ratio: 2, gain: 0.28 },
	{ ratio: 3, gain: 0.06 },
];
// Fast enough to sound struck, slow enough not to click
const CHIME_ATTACK_S = 0.003;
// The tail fades to silence over this much of the end, so a chime never stops on a click
const CHIME_TAIL_S = 0.03;

/**
 * A chime as samples, peaking at 1: every note a struck sine (the octave fading faster than the
 * fundamental, as in a real bell), summed. Rendered once per chime, so every one in a countdown is the
 * same sound, sample for sample.
 */
export function renderChime(sampleRate: number, chime: Chime): Float32Array {
	const length = Math.round((sampleRate * chime.lengthMs) / 1000);
	const samples = new Float32Array(length);
	const decay = chime.decayMs / 1000;
	const tail = Math.max(1, Math.round(sampleRate * CHIME_TAIL_S));
	for (const note of chime.notes) {
		const offset = Math.round((sampleRate * (note.atMs ?? 0)) / 1000);
		for (let i = offset; i < length; i++) {
			const t = (i - offset) / sampleRate;
			const attack = Math.min(1, t / CHIME_ATTACK_S);
			let value = 0;
			for (const partial of CHIME_PARTIALS) {
				if (note.frequency * partial.ratio >= sampleRate / 2) continue;
				value +=
					partial.gain *
					Math.exp((-t * partial.ratio) / decay) *
					Math.sin(2 * Math.PI * note.frequency * partial.ratio * t);
			}
			samples[i] = (samples[i] ?? 0) + (note.gain ?? 1) * attack * value;
		}
	}
	let peak = 0;
	for (const v of samples) peak = Math.max(peak, Math.abs(v));
	for (let i = 0; i < length; i++) {
		const fadeOut = Math.min(1, (length - 1 - i) / tail);
		samples[i] = peak > 0 ? ((samples[i] ?? 0) / peak) * fadeOut : 0;
	}
	return samples;
}

const chimes = new Map<string, AudioBuffer>();

function chimeBuffer(ctx: AudioContext, chime: Chime): AudioBuffer {
	const key = JSON.stringify(chime);
	let buffer = chimes.get(key);
	if (!buffer) {
		const samples = renderChime(ctx.sampleRate, chime);
		buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
		buffer.getChannelData(0).set(samples);
		chimes.set(key, buffer);
	}
	return buffer;
}

/**
 * A chime for touch feedback (the keypad's keys), as soon as the audio can play it: the whole chime
 * from its first sample, never one scheduled at a time already past, which played cut short or
 * silent while the context was still starting (the first key pressed). Silently does nothing when Web
 * Audio is unavailable or not allowed yet.
 */
export function playChime(chime: Chime, volume = 0.15): void {
	const ctx = sharedContext();
	if (!ctx) return;
	const play = () => {
		try {
			const source = ctx.createBufferSource();
			const gain = ctx.createGain();
			source.buffer = chimeBuffer(ctx, chime);
			gain.gain.value = volume;
			source.connect(gain).connect(ctx.destination);
			source.start();
		} catch {}
	};
	if (ctx.state === 'running') play();
	else
		ctx
			.resume()
			.then(() => {
				if (ctx.state === 'running') play();
			})
			.catch(() => {});
}

// Inaudible (about -80 dBFS) but not digital silence, so the device keeps its audio output open
const AWAKE_LEVEL = 0.0001;
let awake: { source: ConstantSourceNode; users: number } | null = null;

/**
 * Keeps the audio output running while something needs instant sound (the PIN pad is open): the
 * context starts now, on the tap that opened it, and an inaudible signal stops the device putting its
 * speaker to sleep between taps, which made a key's sound late. Returns the release; counted, so two
 * users share one.
 */
export function keepAudioAwake(...warm: Chime[]): () => void {
	const ctx = sharedContext();
	if (!ctx) return () => {};
	if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
	try {
		for (const chime of warm) chimeBuffer(ctx, chime);
		if (!awake) {
			const source = ctx.createConstantSource();
			const gain = ctx.createGain();
			source.offset.value = AWAKE_LEVEL;
			source.connect(gain).connect(ctx.destination);
			source.start();
			awake = { source, users: 0 };
		}
		awake.users++;
	} catch {
		return () => {};
	}
	let released = false;
	return () => {
		if (released || !awake) return;
		released = true;
		if (--awake.users > 0) return;
		try {
			awake.source.stop();
		} catch {}
		awake = null;
	};
}

export interface Beep {
	chime: Chime;
	/** From this one's start to the next one's. */
	nextInMs: number;
}

// Beeps are queued this far ahead on the audio clock, from a timer this often: a stalled main thread
// (a busy wall panel) can't push one late, and a beep is never started in the audio thread's past,
// which cut the front off it (Android's WebView renders audio in large chunks)
const BEEP_LOOKAHEAD_S = 0.4;
const BEEP_PUMP_MS = 100;
const BEEP_LEAD_S = 0.06;

/**
 * Plays a rhythm of identical chimes on the shared context's own clock, so each is the same length
 * and the gaps are even. `next(atMs)` says the beep due at that wall-clock time (and the gap after
 * it), or null to end. Waits quietly while audio isn't allowed yet. Returns the stop, which also
 * silences beeps already queued.
 */
export function playBeeps(next: (atMs: number) => Beep | null, volume = 1): () => void {
	const ctx = sharedContext();
	if (!ctx) return () => {};
	const queued = new Set<AudioBufferSourceNode>();
	let at: number | undefined;
	let timer: ReturnType<typeof setInterval> | undefined;

	const stop = () => {
		clearInterval(timer);
		for (const source of queued) {
			try {
				source.stop();
			} catch {}
		}
		queued.clear();
	};

	const pump = () => {
		if (ctx.state === 'suspended') void ctx.resume();
		if (ctx.state !== 'running') {
			at = undefined;
			return;
		}
		const now = ctx.currentTime;
		// First beep, or the clock got ahead (audio was suspended): start fresh rather than cram
		if (at === undefined || at < now + BEEP_LEAD_S / 2) at = now + BEEP_LEAD_S;
		while (at < now + BEEP_LOOKAHEAD_S) {
			const beep = next(Date.now() + (at - now) * 1000);
			if (!beep) {
				clearInterval(timer);
				return;
			}
			try {
				const source = ctx.createBufferSource();
				const gain = ctx.createGain();
				source.buffer = chimeBuffer(ctx, beep.chime);
				gain.gain.value = volume;
				source.connect(gain).connect(ctx.destination);
				source.onended = () => queued.delete(source);
				source.start(at);
				queued.add(source);
			} catch {}
			at += beep.nextInMs / 1000;
		}
	};

	timer = setInterval(pump, BEEP_PUMP_MS);
	pump();
	return stop;
}

// Clips decoded once each (the holiday sounds), by URL
const clips = new Map<string, Promise<AudioBuffer>>();

/**
 * Play a short recorded clip (a data URL) through the shared context, so it can sound wherever the
 * beeps can: after any touch, or once a wall panel's audio is unlocked. Silently does nothing when
 * Web Audio isn't available or allowed yet (a phone page nobody has touched). Resolves the clip's length
 * in seconds once it starts, 0 when it didn't play.
 */
export async function playClip(url: string, volume = 0.6): Promise<number> {
	try {
		const ctx = sharedContext();
		if (!ctx) return 0;
		if (ctx.state === 'suspended') await ctx.resume();
		if (ctx.state !== 'running') return 0;
		let decoded = clips.get(url);
		if (!decoded) {
			decoded = fetch(url)
				.then((response) => response.arrayBuffer())
				.then((bytes) => ctx.decodeAudioData(bytes));
			clips.set(url, decoded);
			decoded.catch(() => clips.delete(url));
		}
		const source = ctx.createBufferSource();
		const gain = ctx.createGain();
		source.buffer = await decoded;
		gain.gain.value = volume;
		source.connect(gain).connect(ctx.destination);
		source.start();
		return source.buffer.duration;
	} catch {
		// A flourish only; never in the way of what it decorates
		return 0;
	}
}

// One tap can reach this twice (a label and the control it clicks, a handler and the page-wide
// listener): calls this close together are one vibration
const HAPTIC_DEDUPE_MS = 40;
let lastHaptic = 0;

/**
 * A brief vibration where the device has a motor (phones; most wall tablets don't, and iOS has no
 * vibration API, so it does nothing there).
 */
export function hapticTap(durationMs = 12): void {
	const now = Date.now();
	if (now - lastHaptic < HAPTIC_DEDUPE_MS) return;
	lastHaptic = now;
	try {
		navigator.vibrate?.(durationMs);
	} catch {}
}

/** What counts as pressing something: buttons, switches, checkboxes, tabs, links, menu items. */
const TAPPABLE =
	'button, [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], a[href], summary, select, label, input[type="checkbox"], input[type="radio"]';

/**
 * Every press on the dashboard taps the phone's motor: one listener for the whole panel (its
 * dialogs and toasts render inside it too), on click, so a scroll that starts on a button never
 * buzzes. Disabled controls stay still, and anything inside `data-haptic="off"` gives its own
 * feedback (the remote and the keypad buzz as the finger lands). Returns the cleanup.
 */
export function installTapHaptics(root: EventTarget): () => void {
	const onClick = (e: Event) => {
		for (const node of e.composedPath()) {
			if (!(node instanceof Element)) continue;
			if (node.closest('[data-haptic="off"]')) return;
			if (!node.matches(TAPPABLE)) continue;
			if (!node.matches(':disabled, [aria-disabled="true"]')) hapticTap();
			return;
		}
	};
	root.addEventListener('click', onClick, true);
	return () => root.removeEventListener('click', onClick, true);
}
