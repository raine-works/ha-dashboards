import { describe, expect, it } from 'bun:test';
import { ENTRY_CHIME } from '../security';
import { renderChime } from '../tones';

const loudest = (samples: Float32Array, from: number, to: number) =>
	samples.slice(from, to).reduce((max, v) => Math.max(max, Math.abs(v)), 0);

describe('renderChime', () => {
	it('is exactly the asked length, silent at both ends and peaking at 1', () => {
		const samples = renderChime(48_000, { notes: [{ frequency: 1318.5 }], decayMs: 90, lengthMs: 350 });
		expect(samples.length).toBe(16_800);
		expect(Math.abs(samples[0] ?? 1)).toBe(0);
		expect(Math.abs(samples[samples.length - 1] ?? 1)).toBe(0);
		expect(loudest(samples, 0, samples.length)).toBeCloseTo(1, 5);
	});
	it('rings out: loud as it strikes, nearly silent by the end', () => {
		const samples = renderChime(48_000, { notes: [{ frequency: 1318.5 }], decayMs: 90, lengthMs: 350 });
		expect(loudest(samples, 0, 2400)).toBeGreaterThan(0.8);
		expect(loudest(samples, 14_400, 15_000)).toBeLessThan(0.05);
	});
	it('strikes each note at its own time', () => {
		const samples = renderChime(48_000, ENTRY_CHIME);
		// The second note lifts the level again at 110ms, after the first has faded some
		expect(loudest(samples, 5280, 5800)).toBeGreaterThan(loudest(samples, 4800, 5270));
	});
});
