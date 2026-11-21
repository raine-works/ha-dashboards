import { afterEach, describe, expect, it } from 'bun:test';
import { setHouseConfig } from '../house-config';
import { houseTtsEngine, isStreamingTts, speakWithFallback } from '../tts';
import { FIXTURE_HOUSE, useFixtureHouse } from './house-fixture';

afterEach(useFixtureHouse);
useFixtureHouse();

describe('speakWithFallback', () => {
	it("speaks in the house's voice when it works", async () => {
		const calls: Record<string, unknown>[] = [];
		const result = await speakWithFallback(async (data) => calls.push(data), 'media_player.door', 'Hello');
		expect(result).toBe('house');
		expect(calls).toEqual([
			{
				entity_id: 'tts.house_voice',
				media_player_entity_id: 'media_player.door',
				message: 'Hello',
				options: { voice: 'nova' },
			},
		]);
	});

	it("falls back to the fallback voice when the house's fails", async () => {
		const entities: unknown[] = [];
		const result = await speakWithFallback(
			async (data) => {
				entities.push(data.entity_id);
				if (data.entity_id === 'tts.house_voice') throw new Error('TTS failed');
			},
			'media_player.door',
			'Hello',
		);
		expect(result).toBe('fallback');
		expect(entities).toEqual(['tts.house_voice', 'tts.backup_voice']);
	});

	it('rejects when both voices fail', async () => {
		await expect(
			speakWithFallback(
				async () => {
					throw new Error('offline');
				},
				'media_player.door',
				'Hello',
			),
		).rejects.toThrow('offline');
	});

	it('without settings, speaks with the first engine Home Assistant has, in its default voice', async () => {
		setHouseConfig(undefined);
		const calls: Record<string, unknown>[] = [];
		const states = { 'tts.piper': { entity_id: 'tts.piper' } } as never;
		await speakWithFallback(async (data) => calls.push(data), 'media_player.door', 'Hi', states);
		expect(calls).toEqual([{ entity_id: 'tts.piper', media_player_entity_id: 'media_player.door', message: 'Hi' }]);
		expect(houseTtsEngine({})).toBeUndefined();
		await expect(speakWithFallback(async () => {}, 'media_player.door', 'Hi', {})).rejects.toThrow('No text-to-speech');
	});
});

describe('isStreamingTts', () => {
	it("is the house's engine when the settings say it streams", () => {
		expect(isStreamingTts('tts.house_voice')).toBe(true);
		expect(isStreamingTts('tts.backup_voice')).toBe(false);
		setHouseConfig({ ...FIXTURE_HOUSE, tts: { ...FIXTURE_HOUSE.tts, streaming: false } });
		expect(isStreamingTts('tts.house_voice')).toBe(false);
	});
});
