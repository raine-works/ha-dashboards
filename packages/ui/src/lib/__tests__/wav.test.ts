import { describe, expect, it } from 'bun:test';
import { computeWaveformPeaks, downsampleBuffer, encodeWavDataUri, formatDuration, mergeChunks } from '../wav';

const decodeDataUri = (uri: string) => {
	const binary = atob(uri.split(',')[1]);
	return new DataView(Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer);
};

describe('wav helpers', () => {
	it('merges chunks in order', () => {
		const merged = mergeChunks([new Float32Array([1, 2]), new Float32Array([3])]);
		expect(Array.from(merged)).toEqual([1, 2, 3]);
	});

	it('downsamples by averaging', () => {
		const out = downsampleBuffer(new Float32Array([0, 1, 0, 1, 0.5, 0.5]), 48000, 16000);
		expect(out.length).toBe(2);
		expect(out[0]).toBeCloseTo(1 / 3);
		expect(out[1]).toBeCloseTo(2 / 3);
	});

	it('returns the input when no downsampling is needed', () => {
		const input = new Float32Array([0.1, 0.2]);
		expect(downsampleBuffer(input, 16000, 16000)).toBe(input);
	});

	it('encodes a mono 16-bit WAV with head/tail silence', () => {
		const view = decodeDataUri(encodeWavDataUri(new Float32Array([1, -1]), 10, 0.2, 0.3));
		const dataBytes = (2 + 2 + 3) * 2; // 2 head + 2 samples + 3 tail
		expect(view.getUint32(40, true)).toBe(dataBytes);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(10);
		expect(view.getInt16(44, true)).toBe(0);
		expect(view.getInt16(48, true)).toBe(0x7fff);
		expect(view.getInt16(50, true)).toBe(-0x8000);
	});

	it('normalizes waveform peaks', () => {
		const peaks = computeWaveformPeaks(new Float32Array([0, 0, 0.5, 0.5, 1, 1]), 3);
		expect(peaks).toEqual([0.12, 0.5, 1]);
		expect(computeWaveformPeaks(new Float32Array(), 4)).toEqual([0.2, 0.2, 0.2, 0.2]);
	});

	it('formats durations as m:ss', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(5.4)).toBe('0:05');
		expect(formatDuration(75)).toBe('1:15');
	});
});
