/**
 * Home Assistant's Assist pipeline over the websocket (`assist_pipeline/run`, speech in, speech out):
 * the run streams events (run-start, stt-*, intent-*, tts-*, run-end, error), and the page sends
 * the microphone as binary frames to the handler the run-start names. Pure pieces live here.
 *
 * @module
 */

/** The sample rate the pipeline is asked for (what Home Assistant's speech-to-text expects). */
export const ASSIST_SAMPLE_RATE = 16_000;

/**
 * `answered`: the answer has been spoken (or, typed, shown); it stays on screen a while to read
 * (no glow). `typing`: the card's text box is open for a typed message, nothing running.
 */
export type AssistPhase =
	| 'idle'
	| 'starting'
	| 'listening'
	| 'typing'
	| 'processing'
	| 'speaking'
	| 'answered'
	| 'error';

/** An Assist run as the card shows it, folded from the pipeline's events (`reduceAssistEvent`). */
export interface AssistState {
	phase: AssistPhase;
	/**
	 * The message is typed, not spoken: no microphone, the answer shown and not read aloud, and the
	 * card keeps its text box for the next one.
	 */
	typed?: boolean;
	/** What the speech-to-text heard, or what was typed. */
	transcript?: string;
	/** What the agent answered (also spoken). */
	response?: string;
	/** Why the run failed, said simply. */
	error?: string;
	/** The run's binary handler: the first byte of every audio frame. */
	handlerId?: number;
	/**
	 * The spoken answer (relative to Home Assistant), known from run-start: fetching it early waits
	 * until the answer exists, then streams it (as it's written, with an engine that streams).
	 */
	ttsUrl?: string;
	/** Play `ttsUrl` now: the answer is spoken (tts-end), or a streaming engine has begun it. */
	ttsReady?: boolean;
	/** Keeps a follow-up in the same conversation. */
	conversationId?: string;
	/** The agent asked something back: listen again after it speaks. */
	continueConversation?: boolean;
	/** The run has ended (run-end or error); nothing more will come. */
	ended?: boolean;
}

/** Nothing running: the state before a run and after it's dismissed. */
export const IDLE_ASSIST: AssistState = { phase: 'idle' };

/** One event of a pipeline run, as the websocket delivers it. */
export interface AssistEvent {
	/** `run-start`, `stt-end`, `intent-progress`, `intent-end`, `tts-end`, `run-end`, `error`… */
	type: string;
	/** The event's data; its shape depends on `type`. */
	data?: Record<string, unknown> | null;
}

/** The parts of the pipeline's event data read here. */
interface AssistEventData {
	runner_data?: { stt_binary_handler_id?: number | null };
	conversation_id?: string | null;
	stt_output?: { text?: unknown };
	intent_output?: {
		conversation_id?: string | null;
		continue_conversation?: boolean;
		response?: { speech?: { plain?: { speech?: unknown } } };
	};
	tts_output?: { url?: unknown; stream_response?: boolean };
	tts_start_streaming?: boolean;
	chat_log_delta?: { role?: unknown; content?: unknown };
	code?: unknown;
	message?: unknown;
}

// Pipeline error codes worth saying in words; anything else is "Something went wrong"
const ERROR_MESSAGES: Record<string, string> = {
	'stt-no-text-recognized': "Sorry, I didn't catch that",
	'stt-stream-failed': "Sorry, I didn't catch that",
	'stt-provider-unsupported-metadata': "Speech recognition can't use this microphone",
	'intent-failed': "Sorry, I couldn't do that",
	'tts-failed': "Couldn't speak the answer",
	timeout: 'Assist took too long',
};

/**
 * A failed run said simply: the known pipeline error `code`s in words, else the pipeline's own
 * `message`, else "Something went wrong".
 */
export function assistErrorMessage(code: unknown, message?: unknown): string {
	if (typeof code === 'string' && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
	return typeof message === 'string' && message ? message : 'Something went wrong';
}

/** Fold one pipeline event into the run's state. */
export function reduceAssistEvent(state: AssistState, event: AssistEvent): AssistState {
	const data = (event.data ?? {}) as AssistEventData;
	switch (event.type) {
		case 'run-start':
			return {
				...state,
				// A typed message has nothing to listen for
				phase: state.typed ? 'processing' : 'listening',
				handlerId: data.runner_data?.stt_binary_handler_id ?? undefined,
				conversationId: data.conversation_id ?? state.conversationId,
				ttsUrl: typeof data.tts_output?.url === 'string' ? data.tts_output.url : state.ttsUrl,
			};
		case 'stt-vad-end':
		case 'stt-end': {
			const text = data.stt_output?.text;
			return {
				...state,
				phase: 'processing',
				transcript: typeof text === 'string' ? text.trim() : state.transcript,
			};
		}
		case 'intent-end': {
			const output = data.intent_output ?? {};
			const speech = output.response?.speech?.plain?.speech;
			return {
				...state,
				// A streaming agent's answer may be playing already
				phase: state.phase === 'speaking' ? 'speaking' : 'processing',
				response: typeof speech === 'string' && speech ? speech : state.response,
				conversationId: output.conversation_id ?? state.conversationId,
				continueConversation: !!output.continue_conversation,
			};
		}
		// An agent that streams (Claude, OpenAI) writes its answer piece by piece: shown as it comes,
		// and spoken from `tts_start_streaming` on, while it still writes. A piece with a `role`
		// starts a new message (after the agent used a tool), which replaces what came before.
		case 'intent-progress': {
			const delta = data.chat_log_delta;
			const piece = typeof delta?.content === 'string' ? delta.content : '';
			const response = delta?.role !== undefined ? piece : piece ? (state.response ?? '') + piece : state.response;
			const ttsReady = state.ttsReady || (!!data.tts_start_streaming && !!state.ttsUrl);
			if (response === state.response && ttsReady === !!state.ttsReady) return state;
			return { ...state, response: response || undefined, ttsReady };
		}
		case 'tts-end': {
			const url = data.tts_output?.url;
			return { ...state, ttsUrl: typeof url === 'string' ? url : state.ttsUrl, ttsReady: true };
		}
		case 'run-end':
			return { ...state, ended: true };
		case 'error':
			return { ...state, phase: 'error', error: assistErrorMessage(data.code, data.message), ended: true };
		default:
			return state;
	}
}

/** Float samples (-1..1) as 16-bit little-endian PCM, the format the pipeline reads. */
export function toPcm16(samples: Float32Array): Int16Array {
	const pcm = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	return pcm;
}

/**
 * How loud a chunk of the microphone (samples -1..1) is, for the listening meter: 0 for a quiet
 * room, about 0.4 for soft speech, 1 for a raised voice. The square root of its RMS, so speech
 * (RMS 0.02–0.2) fills the meter rather than its bottom fifth.
 */
export function micLevel(samples: Float32Array): number {
	if (!samples.length) return 0;
	let sum = 0;
	for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
	const rms = Math.sqrt(sum / samples.length);
	return Math.min(1, Math.max(0, (Math.sqrt(rms) - 0.05) * 2.2));
}

/**
 * One binary websocket frame for the run: the handler id, then the audio. An empty `pcm` (just the
 * id) tells the pipeline the audio has ended.
 */
export function audioFrame(handlerId: number, pcm: Int16Array = new Int16Array(0)): Uint8Array {
	const frame = new Uint8Array(1 + pcm.byteLength);
	frame[0] = handlerId;
	frame.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 1);
	return frame;
}

/** The first spoken piece is at least this long (a few words), so the answer starts at once. */
export const SPEECH_FIRST_MIN = 24;
/** Later pieces are at least this long: a couple of sentences each, so a long answer is few requests. */
export const SPEECH_CHUNK_MIN = 140;

// A sentence's end with the space after it (so "3.5" and a "." still being written never split), or a line's end
const SENTENCE_END = /[.!?…]+["')\]]*\s+|\n+/g;

/**
 * The next piece of an answer to speak, cut at a sentence's (or line's) end: the answer is spoken
 * piece by piece as it's written, so its first words are heard while the rest is still coming.
 * `first` takes a short piece (the first sentence), later ones a couple of sentences; `final` (the
 * answer is whole) takes whatever is left. Null while there's no whole piece yet.
 */
export function nextSpeechChunk(text: string, first: boolean, final: boolean): { chunk: string; rest: string } | null {
	const min = first ? SPEECH_FIRST_MIN : SPEECH_CHUNK_MIN;
	for (const match of text.matchAll(SENTENCE_END)) {
		const end = match.index + match[0].length;
		const chunk = text.slice(0, end).trim();
		if (chunk.length >= min) return { chunk, rest: text.slice(end) };
	}
	const rest = text.trim();
	return final && rest ? { chunk: rest, rest: '' } : null;
}

/**
 * An answer's text as it should be spoken: its Markdown marks gone (emphasis, code, headings, list
 * bullets), which a voice would read out or stumble on, and each line ending like a sentence.
 */
export function speechText(markdown: string): string {
	return markdown
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/, '')
				.replace(/\*\*|__|`/g, '')
				.replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|[.,;:!?]|$)/g, '$1')
				.trim(),
		)
		.filter(Boolean)
		.map((line) => (/[.!?…:;,]["')\]]*$/.test(line) ? line : `${line}.`))
		.join(' ');
}

/** The card's status line for each phase. */
export function assistStatus(state: AssistState): string {
	switch (state.phase) {
		case 'starting':
		case 'listening':
			return 'Listening…';
		case 'typing':
			return 'Type a message';
		case 'processing':
			return 'Thinking…';
		case 'speaking':
			return 'Speaking';
		case 'answered':
			return 'Assist';
		case 'error':
			return state.error ?? 'Something went wrong';
		default:
			return '';
	}
}
