import { describe, expect, it } from 'bun:test';
import {
	assistErrorMessage,
	assistStatus,
	audioFrame,
	IDLE_ASSIST,
	micLevel,
	nextSpeechChunk,
	reduceAssistEvent,
	speechText,
	toPcm16,
} from '../assist';

const run = (...events: { type: string; data?: Record<string, unknown> }[]) =>
	events.reduce(reduceAssistEvent, { ...IDLE_ASSIST, phase: 'starting' as const });

describe('reduceAssistEvent', () => {
	it('listens once the run names its audio handler', () => {
		const state = run({
			type: 'run-start',
			data: { conversation_id: 'c1', runner_data: { stt_binary_handler_id: 3 } },
		});
		expect(state.phase).toBe('listening');
		expect(state.handlerId).toBe(3);
		expect(state.conversationId).toBe('c1');
	});

	it('thinks from the start for a typed message, keeping what was typed', () => {
		const typed = { phase: 'processing' as const, typed: true, transcript: 'Is the garage open?' };
		const state = [
			{ type: 'run-start', data: { runner_data: { stt_binary_handler_id: null } } },
			{ type: 'intent-start' },
		].reduce(reduceAssistEvent, typed);
		expect(state.phase).toBe('processing');
		expect(state.transcript).toBe('Is the garage open?');
		expect(state.handlerId).toBeUndefined();
	});

	it('thinks once speech ends, keeping what it heard', () => {
		const state = run(
			{ type: 'run-start', data: { runner_data: { stt_binary_handler_id: 1 } } },
			{ type: 'stt-vad-end' },
			{ type: 'stt-end', data: { stt_output: { text: ' Turn on the kitchen lights ' } } },
		);
		expect(state.phase).toBe('processing');
		expect(state.transcript).toBe('Turn on the kitchen lights');
	});

	it('takes the answer, conversation and spoken url', () => {
		const state = run(
			{
				type: 'intent-end',
				data: {
					intent_output: {
						conversation_id: 'abc',
						continue_conversation: true,
						response: { speech: { plain: { speech: 'Which room?' } } },
					},
				},
			},
			{ type: 'tts-end', data: { tts_output: { url: '/api/tts_proxy/x.mp3' } } },
			{ type: 'run-end' },
		);
		expect(state.response).toBe('Which room?');
		expect(state.conversationId).toBe('abc');
		expect(state.continueConversation).toBe(true);
		expect(state.ttsUrl).toBe('/api/tts_proxy/x.mp3');
		expect(state.ended).toBe(true);
	});

	it("knows the answer's url from the start, and plays it once spoken", () => {
		const started = run({
			type: 'run-start',
			data: {
				runner_data: { stt_binary_handler_id: 1 },
				tts_output: { url: '/api/tts_proxy/a.mp3', stream_response: false },
			},
		});
		expect(started.ttsUrl).toBe('/api/tts_proxy/a.mp3');
		expect(started.ttsReady).toBeFalsy();
		expect(reduceAssistEvent(started, { type: 'intent-progress', data: { chat_log_delta: {} } })).toBe(started);
		expect(
			reduceAssistEvent(started, { type: 'tts-end', data: { tts_output: { url: '/api/tts_proxy/a.mp3' } } }).ttsReady,
		).toBe(true);
	});

	it('plays early when a streaming engine starts speaking', () => {
		const started = run({
			type: 'run-start',
			data: {
				runner_data: { stt_binary_handler_id: 1 },
				tts_output: { url: '/api/tts_proxy/a.mp3', stream_response: true },
			},
		});
		expect(reduceAssistEvent(started, { type: 'intent-progress', data: { tts_start_streaming: true } }).ttsReady).toBe(
			true,
		);
	});

	it('shows a streaming agent’s answer as it is written, the last message only', () => {
		const delta = (chat_log_delta: Record<string, unknown>) => ({ type: 'intent-progress', data: { chat_log_delta } });
		const state = run(
			delta({ role: 'assistant', content: 'Let me check' }),
			delta({ role: 'tool_result' }),
			delta({ role: 'assistant', content: 'The front ' }),
			delta({ content: 'door is locked.' }),
		);
		expect(state.response).toBe('The front door is locked.');
		expect(state.ttsReady).toBeFalsy();
	});

	it('keeps speaking when the answer ends after its speech began', () => {
		const speaking = {
			...run({ type: 'run-start', data: { tts_output: { url: '/a.mp3' } } }),
			phase: 'speaking' as const,
		};
		const state = reduceAssistEvent(speaking, {
			type: 'intent-end',
			data: { intent_output: { response: { speech: { plain: { speech: 'Done.' } } } } },
		});
		expect(state.phase).toBe('speaking');
		expect(state.response).toBe('Done.');
	});

	it('ends on an error, said simply', () => {
		const state = run({ type: 'error', data: { code: 'stt-no-text-recognized', message: 'No text recognized' } });
		expect(state.phase).toBe('error');
		expect(state.error).toBe("Sorry, I didn't catch that");
		expect(state.ended).toBe(true);
	});

	it('ignores events it has no use for', () => {
		const before = run({ type: 'run-start', data: { runner_data: { stt_binary_handler_id: 1 } } });
		expect(reduceAssistEvent(before, { type: 'stt-vad-start' })).toBe(before);
	});
});

describe('assistErrorMessage', () => {
	it("falls back to Home Assistant's message, then a generic one", () => {
		expect(assistErrorMessage('weird', 'Pipeline not found')).toBe('Pipeline not found');
		expect(assistErrorMessage(undefined)).toBe('Something went wrong');
	});
});

describe('toPcm16', () => {
	it('scales and clamps floats to 16-bit', () => {
		expect([...toPcm16(new Float32Array([0, 1, -1, 2, -2, 0.5]))]).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
	});
});

describe('audioFrame', () => {
	it('prefixes the handler id to little-endian samples', () => {
		expect([...audioFrame(5, new Int16Array([1, -1]))]).toEqual([5, 1, 0, 255, 255]);
	});

	it('is just the id to end the audio', () => {
		expect([...audioFrame(5)]).toEqual([5]);
	});
});

describe('micLevel', () => {
	const tone = (amplitude: number) =>
		Float32Array.from({ length: 2048 }, (_, i) => amplitude * Math.sin((i / 2048) * Math.PI * 40));

	it('is 0 for silence, room noise and no samples', () => {
		expect(micLevel(new Float32Array(2048))).toBe(0);
		expect(micLevel(tone(0.002))).toBe(0);
		expect(micLevel(new Float32Array(0))).toBe(0);
	});

	it('rises with the voice, up to 1', () => {
		const soft = micLevel(tone(0.07));
		const loud = micLevel(tone(0.3));
		expect(soft).toBeGreaterThan(0.25);
		expect(soft).toBeLessThan(0.5);
		expect(loud).toBeGreaterThan(soft);
		expect(loud).toBeLessThan(1);
		expect(micLevel(tone(1))).toBe(1);
	});
});

describe('nextSpeechChunk', () => {
	const long = 'The kitchen lights are on at seventy percent. The front door is locked and the garage is closed. ';

	it('takes the first sentence as soon as it ends', () => {
		expect(nextSpeechChunk('The kitchen lights are on. The fr', true, false)).toEqual({
			chunk: 'The kitchen lights are on.',
			rest: 'The fr',
		});
	});

	it('waits for a sentence to end, and for the space after it', () => {
		expect(nextSpeechChunk('The kitchen lights are', true, false)).toBeNull();
		expect(nextSpeechChunk('It is 54.', true, false)).toBeNull();
		expect(nextSpeechChunk('The house is using 3.5 kilowatts', true, false)).toBeNull();
	});

	it('keeps a short opening with the sentence after it', () => {
		expect(nextSpeechChunk('Sure. The kitchen lights are on. More', true, false)?.chunk).toBe(
			'Sure. The kitchen lights are on.',
		);
	});

	it('takes a couple of sentences at a time after the first', () => {
		expect(nextSpeechChunk(`${long}It is cold out.`, false, false)).toBeNull();
		const next = nextSpeechChunk(`${long}It is 54 degrees and cloudy outside right now. More`, false, false);
		expect(next?.chunk.endsWith('right now.')).toBe(true);
		expect(next?.rest).toBe('More');
	});

	it('cuts at the end of a line', () => {
		expect(nextSpeechChunk('- Kitchen lights are on at 70%\n- The front', true, false)?.chunk).toBe(
			'- Kitchen lights are on at 70%',
		);
	});

	it('takes what is left once the answer is whole', () => {
		expect(nextSpeechChunk('Done.', true, true)).toEqual({ chunk: 'Done.', rest: '' });
		expect(nextSpeechChunk('  ', false, true)).toBeNull();
	});
});

describe('speechText', () => {
	it('drops the Markdown a voice would read out', () => {
		expect(speechText('**Kitchen** lights are _on_ at `70%`.')).toBe('Kitchen lights are on at 70%.');
		expect(speechText('## Today\n- Rain at 3 PM\n1. Bring a coat')).toBe('Today. Rain at 3 PM. Bring a coat.');
	});

	it('keeps names with underscores and ends each line like a sentence', () => {
		expect(speechText('The sensor is living_room_temp\nIt reads 70 degrees!')).toBe(
			'The sensor is living_room_temp. It reads 70 degrees!',
		);
	});
});

describe('assistStatus', () => {
	it('says what it is doing', () => {
		expect(assistStatus({ phase: 'listening' })).toBe('Listening…');
		expect(assistStatus({ phase: 'typing' })).toBe('Type a message');
		expect(assistStatus({ phase: 'processing' })).toBe('Thinking…');
		expect(assistStatus({ phase: 'speaking', response: 'Done' })).toBe('Speaking');
		expect(assistStatus({ phase: 'error', error: 'No microphone found' })).toBe('No microphone found');
	});
});
