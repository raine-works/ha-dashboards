import type { CharacterId } from '../../lib/holidays';
import { playClip } from '../../lib/tones';
import { activeHolidayNow } from './useHoliday';

// Each holiday's clips (sounds/, CC0 from Freesound: sounds/CREDITS.md), loaded with `import()` the
// first time that holiday plays one, so a holiday's sounds cost nothing on any other day
const SOUNDS: Record<CharacterId, () => Promise<{ default: string[] }>> = {
	birthday: () => import('./sounds/birthday'),
	'new-year': () => import('./sounds/new-year'),
	valentines: () => import('./sounds/valentines'),
	'st-patricks': () => import('./sounds/st-patricks'),
	easter: () => import('./sounds/easter'),
	'mothers-day': () => import('./sounds/mothers-day'),
	'fathers-day': () => import('./sounds/fathers-day'),
	'independence-day': () => import('./sounds/independence-day'),
	halloween: () => import('./sounds/halloween'),
	thanksgiving: () => import('./sounds/thanksgiving'),
	christmas: () => import('./sounds/christmas'),
};

// One sound at a time, then a rest: a request while one loads or plays, or within this long after it
// ends, is dropped (taps in a row, two doors opening together), so they never overlap or run on
const COOLDOWN_MS = 1500;
// While a clip loads (its length isn't known yet): long enough for any of them to load
const LOADING_MS = 10_000;
let quietUntil = 0;

/** Play one of a holiday's clips (a random one when it has several: New Year's horn or cork), or a birthday's. */
export async function playHolidaySound(id: CharacterId): Promise<void> {
	if (Date.now() < quietUntil) return;
	quietUntil = Date.now() + LOADING_MS;
	try {
		const { default: clips } = await SOUNDS[id]();
		const clip = clips[Math.floor(Math.random() * clips.length)];
		const seconds = clip ? await playClip(clip) : 0;
		quietUntil = seconds > 0 ? Date.now() + seconds * 1000 + COOLDOWN_MS : 0;
	} catch {
		// The chunk didn't load (offline): the toast still shows
		quietUntil = 0;
	}
}

/**
 * An alert toast's sound in a holiday's days (the one on or leading up to today); silence otherwise.
 * Wall panels only: their callers check `useWallPanel()`.
 */
export function playAlertHolidaySound(): void {
	const active = activeHolidayNow();
	if (active) void playHolidaySound(active.holiday.id);
}

/** The quiet between the holiday's sound and a recording spliced after it (seconds). */
const CHIME_GAP_S = 0.3;

/**
 * A voice recording with the holiday's sound in front of it, in place of Music Assistant's chime
 * (the intercom's recordings skip script.play_announcement, which does the same for text): the
 * clip decoded at the recording's sample rate, a short gap, then the recording. The recording
 * alone when no holiday is near or the clip can't be decoded.
 */
export async function withHolidayChime(samples: Float32Array, sampleRate: number): Promise<Float32Array | null> {
	const active = activeHolidayNow();
	if (!active || typeof OfflineAudioContext === 'undefined') return null;
	try {
		const { default: clips } = await SOUNDS[active.holiday.id]();
		const clip = clips[Math.floor(Math.random() * clips.length)];
		if (!clip) return null;
		const bytes = await (await fetch(clip)).arrayBuffer();
		// An offline context at the recording's rate decodes and resamples in one step
		const decoded = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(bytes);
		const chime = decoded.getChannelData(0);
		const gap = Math.round(CHIME_GAP_S * sampleRate);
		const joined = new Float32Array(chime.length + gap + samples.length);
		joined.set(chime, 0);
		joined.set(samples, chime.length + gap);
		return joined;
	} catch {
		return null;
	}
}
