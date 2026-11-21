// One Assist run at a time for the whole page: the header button starts it, the overlay shows it.
// A small store outside the component tree, so both read the same run without a provider.

import {
	ASSIST_SAMPLE_RATE,
	type AssistEvent,
	type AssistState,
	audioFrame,
	IDLE_ASSIST,
	micLevel,
	nextSpeechChunk,
	reduceAssistEvent,
	speechText,
	toPcm16,
} from '../../lib/assist';
import { isStreamingTts } from '../../lib/tts';
import { downsampleBuffer, encodeWavDataUri } from '../../lib/wav';
import type { HomeAssistant } from '../../types/homeassistant';
import { startCapture } from '../audio/capture';

/** Stop listening after this long even if the pipeline hasn't heard the end of the command. */
const MAX_LISTEN_MS = 15_000;
/**
 * Give up on an answer that isn't ready to play in this long (the pipeline's own timeout is 60s
 * too). Playing it has no limit: a long answer reads for longer than this.
 */
const RUN_TIMEOUT_MS = 60_000;
/**
 * How long the card stays once a run is over (its answer, an error) or while its text box waits
 * for a message: long enough to read it, ask a follow-up or try again from the card. Touching the
 * card or typing in it starts the time again.
 */
export const LINGER_MS = 30_000;

let state: AssistState = IDLE_ASSIST;
const listeners = new Set<() => void>();
let current: { stop: () => void; cancel: () => void } | null = null;
let lingerTimer: ReturnType<typeof setTimeout> | undefined;

function setState(next: AssistState) {
	state = next;
	for (const listener of listeners) listener();
}

export const assistStore = {
	get: () => state,
	subscribe(listener: () => void) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};

// How loud the microphone is right now (0–1), for the overlay's meter. Apart from the run's state:
// it changes with every chunk of audio, and the overlay writes it to a CSS variable, never rendering.
let level = 0;
const levelListeners = new Set<(level: number) => void>();
/** Each chunk's level falls to this share of the last, so the meter drops off rather than flickers. */
const LEVEL_DECAY = 0.6;

function setLevel(next: number) {
	if (next === level) return;
	level = next;
	for (const listener of levelListeners) listener(level);
}

/** The microphone's level while it listens (called with the current one at once); 0 otherwise. */
export function subscribeAssistLevel(listener: (level: number) => void): () => void {
	levelListeners.add(listener);
	listener(level);
	return () => levelListeners.delete(listener);
}

function linger(next: AssistState) {
	setState(next);
	clearTimeout(lingerTimer);
	lingerTimer = setTimeout(() => setState(IDLE_ASSIST), LINGER_MS);
}

/** Someone is reading, scrolling or typing in the card: give it its full time again. */
export function keepAssistCard() {
	if (state.phase === 'answered' || state.phase === 'error' || state.phase === 'typing') linger(state);
}

function micErrorMessage(err: unknown): string {
	const name = (err as { name?: string })?.name;
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone access is turned off';
	if (name === 'NotFoundError') return 'No microphone found';
	return "Couldn't start the microphone";
}

/** End the command now: the pipeline works with what it has heard. */
export function stopListening() {
	current?.stop();
}

/** Drop the run (listening, thinking or speaking) and hide the overlay. */
export function cancelAssist() {
	current?.cancel();
	current = null;
	clearTimeout(lingerTimer);
	setState(IDLE_ASSIST);
}

/**
 * Open the card's text box for a typed message: whatever runs (the microphone, a spoken answer)
 * stops, and an answer on the card stays to be followed up, in the same conversation.
 */
export function startTyping() {
	const shown = state;
	current?.cancel();
	current = null;
	const answered = shown.phase === 'answered' || shown.phase === 'speaking';
	linger({
		phase: 'typing',
		typed: true,
		conversationId: shown.conversationId,
		transcript: answered ? shown.transcript : undefined,
		response: answered ? shown.response : undefined,
	});
}

/**
 * Run a typed message through the preferred Assist pipeline, from the conversation agent on
 * (`start_stage: intent`): no microphone, and the answer is shown, not read aloud (someone who
 * types is likely somewhere quiet). The card keeps its text box for the next message.
 */
export async function askAssist(hass: HomeAssistant, text: string, conversationId?: string): Promise<void> {
	const message = text.trim();
	if (!message) return;
	cancelAssist();
	const connection = hass.connection;
	if (!connection?.subscribeMessage) {
		linger({ phase: 'error', typed: true, error: "Assist isn't available here", ended: true });
		return;
	}

	let run: AssistState = { phase: 'processing', typed: true, transcript: message, conversationId };
	setState(run);
	let cancelled = false;
	let unsubscribe: (() => void) | undefined;
	let runTimer: ReturnType<typeof setTimeout> | undefined;

	const cleanup = () => {
		cancelled = true;
		clearTimeout(runTimer);
		unsubscribe?.();
		unsubscribe = undefined;
	};
	const end = (next: AssistState) => {
		cleanup();
		current = null;
		linger(next);
	};

	const onEvent = (event: AssistEvent) => {
		if (cancelled) return;
		run = reduceAssistEvent(run, event);
		if (run.phase === 'error') end(run);
		else if (!run.ended) setState(run);
		else if (run.response) end({ ...run, phase: 'answered' });
		else end({ ...run, phase: 'error', error: 'Assist had no answer' });
	};

	current = { stop: () => {}, cancel: cleanup };
	runTimer = setTimeout(() => onEvent({ type: 'error', data: { code: 'timeout' } }), RUN_TIMEOUT_MS);
	try {
		const unsub = await connection.subscribeMessage<AssistEvent>(onEvent, {
			type: 'assist_pipeline/run',
			start_stage: 'intent',
			end_stage: 'intent',
			input: { text: message },
			...(conversationId ? { conversation_id: conversationId } : {}),
			timeout: RUN_TIMEOUT_MS / 1000,
		});
		// Home Assistant may have ended the subscription with the run; unsubscribing then just fails
		unsubscribe = () => {
			Promise.resolve()
				.then(unsub)
				.catch(() => {});
		};
		if (cancelled) unsubscribe();
	} catch {
		// Cancelled meanwhile (maybe for a new run, which owns `current` and the overlay now): nothing to say
		if (cancelled) return;
		end({ ...run, phase: 'error', error: "Couldn't reach Assist", ended: true });
	}
}

// The one element the run's spoken answer plays through. A phone lets a page play sound only from
// an element that started playing during a tap (the Companion app's WebView and iOS both lock each
// audio element until then), and the answer arrives seconds after the tap: so the tap that starts
// listening plays a moment of silence on this element, which may then play the answer. An element
// made when the answer came was never allowed to, and the answer was shown in silence.
let player: HTMLAudioElement | undefined;
let silence: string | undefined;

/** Call during the tap that starts a run (before anything is awaited). */
function unlockPlayer(): HTMLAudioElement | undefined {
	try {
		player ??= new Audio();
		silence ??= encodeWavDataUri(new Float32Array(800), ASSIST_SAMPLE_RATE);
		player.onended = null;
		player.onerror = null;
		player.src = silence;
		player.play().catch(() => {});
	} catch {
		// No audio here: the answer is shown
	}
	return player;
}

/** The preferred pipeline's voice: what speaks the answer's pieces. */
interface PipelineVoice {
	engine: string;
	language?: string;
	voice?: string;
}

/** Don't hold the run up for the pipeline's settings longer than this. */
const VOICE_LOOKUP_MS = 1_500;

/**
 * The preferred pipeline's text-to-speech engine, language and voice, for speaking the answer
 * piece by piece; null when it has none, Home Assistant won't say, the page can't ask for speech
 * itself (the run then speaks the answer whole, at its end), or the engine streams
 * (`isStreamingTts()`): the run then speaks the answer itself as it's written, in one stream.
 */
async function pipelineVoice(hass: HomeAssistant): Promise<PipelineVoice | null> {
	if (!hass.callWS || !hass.callApi) return null;
	const lookup = hass
		.callWS<{ tts_engine?: string | null; tts_language?: string | null; tts_voice?: string | null }>({
			type: 'assist_pipeline/pipeline/get',
		})
		.then((pipeline) =>
			pipeline?.tts_engine && !isStreamingTts(pipeline.tts_engine)
				? {
						engine: pipeline.tts_engine,
						language: pipeline.tts_language ?? undefined,
						voice: pipeline.tts_voice ?? undefined,
					}
				: null,
		)
		.catch(() => null);
	return Promise.race([lookup, new Promise<null>((resolve) => setTimeout(() => resolve(null), VOICE_LOOKUP_MS))]);
}

/** One spoken piece of the answer: its audio, once Home Assistant has named its url. */
interface Clip {
	audio?: HTMLAudioElement;
	state: 'pending' | 'ready' | 'failed';
}

/**
 * Listen for a command and run it through Home Assistant's preferred Assist pipeline: speech to
 * text, the conversation agent (which performs the action), then its spoken answer played here.
 * When the agent asks something back, it listens again in the same conversation.
 *
 * **A voice that streams** (the house's, Grok: `STREAMING_TTS`) speaks the answer in the run
 * itself: Home Assistant feeds it the agent's words as they're written and the page plays the
 * run's audio url as it comes, from `tts_start_streaming` (or `tts-end` for a short answer).
 *
 * **Any other voice speaks it piece by piece**: the run ends at the agent's answer, and the page
 * asks Home Assistant for the speech of each piece itself (`tts_get_url`), the first sentence as
 * soon as it's written, then a couple of sentences at a time, all requested at once and played in
 * order. So the first words are heard while the agent still writes (one that streams) and the
 * rest is still being spoken into audio, though the engine can't take streamed text. Without a
 * voice the page can ask, the run speaks the answer whole.
 */
export async function startAssist(hass: HomeAssistant, conversationId?: string): Promise<void> {
	cancelAssist();
	// First, while this is still the tap's own turn
	const speaker = unlockPlayer();
	const connection = hass.connection;
	if (!connection?.subscribeMessage || !navigator.mediaDevices?.getUserMedia) {
		linger({ phase: 'error', error: "Assist isn't available here", ended: true });
		return;
	}

	let run: AssistState = { phase: 'starting', conversationId };
	setState(run);
	// Asked for now, read when the run starts (the mic takes longer to open)
	const voiceLookup = pipelineVoice(hass);
	let voice: PipelineVoice | null = null;

	let cancelled = false;
	let micOpen = false;
	let handlerId: number | undefined;
	const pending: Int16Array[] = [];
	let stream: MediaStream | undefined;
	let context: AudioContext | undefined;
	let nodes: AudioNode[] = [];
	let unsubscribe: (() => void) | undefined;
	let audio: HTMLAudioElement | undefined;
	let audioUrl: string | undefined;
	let audioFailed = false;
	const timers: ReturnType<typeof setTimeout>[] = [];
	let runTimer: ReturnType<typeof setTimeout> | undefined;
	// The answer in pieces: what's written but not yet sent to be spoken, and the pieces' audio in order
	let unspoken = '';
	let streamed = false;
	let firstPiece = true;
	let allSent = false;
	const clips: Clip[] = [];
	let cursor = 0;
	let playing = false;
	let heardAny = false;

	const send = (pcm?: Int16Array) => {
		if (handlerId === undefined) return;
		try {
			connection.socket?.send(audioFrame(handlerId, pcm));
		} catch {
			// The socket dropped; the run's error event (or the timeout) ends it
		}
	};

	const closeMic = (sendEnd: boolean) => {
		if (!micOpen) return;
		micOpen = false;
		setLevel(0);
		for (const node of nodes) node.disconnect();
		for (const track of stream?.getTracks() ?? []) track.stop();
		context?.close().catch(() => {});
		if (sendEnd) send();
	};

	const cleanup = () => {
		cancelled = true;
		closeMic(false);
		// Also when the mic never opened (the audio context failed after permission was granted)
		for (const track of stream?.getTracks() ?? []) track.stop();
		for (const timer of timers) clearTimeout(timer);
		clearTimeout(runTimer);
		unsubscribe?.();
		unsubscribe = undefined;
		for (const element of [audio, ...clips.map((clip) => clip.audio)]) {
			if (!element) continue;
			element.onended = null;
			element.onerror = null;
			element.pause();
			// Drops a request still waiting on Home Assistant
			element.removeAttribute('src');
			element.load();
		}
	};

	/** `heard`: the answer played to its end (else it failed, or there was none). */
	const finish = (heard: boolean) => {
		if (cancelled) return;
		cleanup();
		current = null;
		if (heard && run.continueConversation && run.conversationId) {
			void startAssist(hass, run.conversationId);
		} else if (run.response) {
			// Leave the answer up to finish reading it (and to read it at all, if it couldn't be
			// played), and to ask a follow-up from the card
			linger({ ...run, phase: 'answered' });
		} else {
			setState(IDLE_ASSIST);
		}
	};

	// Request the answer as soon as the run names its url: Home Assistant holds the request until
	// the answer is spoken (or streams it as it's written, with an engine that streams), so playing
	// starts without a round trip once it's ready
	const prepare = (url: string) => {
		audioUrl = url;
		audioFailed = false;
		// Through the element the tap unlocked
		audio = speaker ?? new Audio();
		audio.onended = () => finish(true);
		audio.onerror = () => {
			audioFailed = true;
			if (run.phase === 'speaking') finish(false);
		};
		audio.preload = 'auto';
		audio.src = url;
		audio.load();
	};

	const speak = () => {
		const url = run.ttsUrl;
		if (!url) return finish(false);
		// From here the audio's end (or failure) ends the run
		clearTimeout(runTimer);
		run = { ...run, phase: 'speaking' };
		setState(run);
		// A request that failed early (or a different url at tts-end) gets one fresh try
		if (!audio || audioFailed || audioUrl !== url) prepare(url);
		audio?.play().catch(() => finish(false));
	};

	// Play the pieces in order: the next one as soon as the last ends (or fails), waiting for one
	// whose url isn't known yet. The last piece's end ends the run.
	const pump = () => {
		if (cancelled || playing) return;
		while (clips[cursor]?.state === 'failed') cursor++;
		const clip = clips[cursor];
		if (!clip) {
			if (allSent) finish(heardAny);
			return;
		}
		if (clip.state !== 'ready' || !clip.audio) return;
		playing = true;
		// From here the audio's end (or failure) ends the run
		clearTimeout(runTimer);
		if (run.phase !== 'speaking') {
			run = { ...run, phase: 'speaking' };
			setState(run);
		}
		clip.audio.play().catch(() => settle(clip, false));
	};

	const settle = (clip: Clip, heard: boolean) => {
		if (cancelled) return;
		if (!heard) clip.state = 'failed';
		if (clips[cursor] === clip && playing) {
			playing = false;
			cursor++;
			heardAny = heardAny || heard;
		}
		pump();
	};

	// Ask for a piece's speech. Its audio is requested as soon as its url is known, so Home
	// Assistant makes every piece's at once while the ones before it play
	const say = (text: string, from: PipelineVoice) => {
		const clip: Clip = { state: 'pending' };
		clips.push(clip);
		hass
			.callApi?.<{ path?: string; url?: string }>('POST', 'tts_get_url', {
				engine_id: from.engine,
				message: text,
				...(from.language ? { language: from.language } : {}),
				...(from.voice ? { options: { voice: from.voice } } : {}),
				// Answers rarely repeat: nothing to keep on disk
				cache: false,
			})
			.then((result) => {
				const url = result?.path ?? result?.url;
				if (cancelled || !url) return settle(clip, false);
				const element = new Audio(url);
				element.preload = 'auto';
				element.onended = () => settle(clip, true);
				element.onerror = () => settle(clip, false);
				clip.audio = element;
				clip.state = 'ready';
				pump();
			})
			.catch(() => settle(clip, false));
	};

	// Send every whole piece written so far to be spoken; `final`: the answer is whole
	const speakWritten = (from: PipelineVoice, final: boolean) => {
		if (allSent) return;
		for (;;) {
			const next = nextSpeechChunk(unspoken, firstPiece, final);
			if (!next) break;
			unspoken = next.rest;
			const text = speechText(next.chunk);
			if (!text) continue;
			firstPiece = false;
			say(text, from);
		}
		if (final) {
			allSent = true;
			pump();
		}
	};

	const onEvent = (event: AssistEvent) => {
		if (cancelled) return;
		const before = run;
		run = reduceAssistEvent(run, event);

		if (event.type === 'run-start' && run.handlerId !== undefined) {
			handlerId = run.handlerId;
			for (const pcm of pending.splice(0)) send(pcm);
		}
		if (event.type === 'run-start' && run.ttsUrl) prepare(run.ttsUrl);
		// The pipeline heard the end of the command: stop sending
		if (event.type === 'stt-vad-end' || event.type === 'stt-end') closeMic(true);

		if (run.phase === 'error') {
			cleanup();
			current = null;
			linger(run);
			return;
		}
		if (voice) {
			// Spoken piece by piece: what the agent writes as it writes it, else its whole answer
			if (event.type === 'intent-progress') {
				const delta = (event.data as { chat_log_delta?: { role?: unknown; content?: unknown } } | null | undefined)
					?.chat_log_delta;
				// A new message (after the agent used a tool): what came before ends there
				if (delta?.role !== undefined && unspoken) unspoken += '\n';
				if (typeof delta?.content === 'string' && delta.content) {
					streamed = true;
					unspoken += delta.content;
					speakWritten(voice, false);
				}
			}
			if (event.type === 'intent-end') {
				if (!streamed) unspoken = run.response ?? '';
				speakWritten(voice, true);
			} else if (run.ended) {
				speakWritten(voice, true);
			}
			if (!cancelled) setState(run);
			return;
		}
		if (run.ttsReady && !before.ttsReady) {
			speak();
			return;
		}
		if (run.ended && run.phase !== 'speaking') {
			finish(false);
			return;
		}
		// Also while speaking: a streaming agent's answer grows as it's spoken
		setState(run);
	};

	current = {
		stop: () => closeMic(true),
		cancel: cleanup,
	};

	try {
		stream = await navigator.mediaDevices.getUserMedia({
			// Noise suppression and gain help recognition; echo cancellation warbles the voice
			audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true },
		});
		if (cancelled) return cleanup();
		try {
			context = new AudioContext({ sampleRate: ASSIST_SAMPLE_RATE });
		} catch {
			// A browser that can't record at 16kHz: record at its own rate and downsample each chunk
			context = new AudioContext();
		}
		await context.resume();
		const rate = context.sampleRate;
		micOpen = true;
		nodes = await startCapture(context, context.createMediaStreamSource(stream), (chunk) => {
			if (!micOpen) return;
			setLevel(Math.max(micLevel(chunk), level * LEVEL_DECAY));
			const pcm = toPcm16(rate === ASSIST_SAMPLE_RATE ? chunk : downsampleBuffer(chunk, rate, ASSIST_SAMPLE_RATE));
			if (handlerId === undefined) pending.push(pcm);
			else send(pcm);
		});
		if (cancelled) return cleanup();

		timers.push(setTimeout(() => closeMic(true), MAX_LISTEN_MS));
		runTimer = setTimeout(() => onEvent({ type: 'error', data: { code: 'timeout' } }), RUN_TIMEOUT_MS);

		voice = await voiceLookup;
		if (cancelled) return cleanup();
		const unsub = await connection.subscribeMessage<AssistEvent>(onEvent, {
			type: 'assist_pipeline/run',
			start_stage: 'stt',
			// With a voice to speak the pieces with, the run ends at the answer
			end_stage: voice ? 'intent' : 'tts',
			input: { sample_rate: ASSIST_SAMPLE_RATE },
			...(conversationId ? { conversation_id: conversationId } : {}),
			timeout: RUN_TIMEOUT_MS / 1000,
		});
		// Home Assistant may have ended the subscription with the run; unsubscribing then just fails
		unsubscribe = () => {
			Promise.resolve()
				.then(unsub)
				.catch(() => {});
		};
		if (cancelled) unsubscribe();
	} catch (err) {
		// Cancelled meanwhile (maybe for a new run, which owns `current` and the overlay now): nothing to say
		if (cancelled) return cleanup();
		const micFailed = !micOpen;
		cleanup();
		current = null;
		linger({
			phase: 'error',
			error: micFailed ? micErrorMessage(err) : "Couldn't reach Assist",
			ended: true,
		});
	}
}
