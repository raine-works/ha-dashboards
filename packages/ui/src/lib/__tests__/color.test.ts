import { describe, expect, it } from 'bun:test';
import { hsToRgb } from '../color';

describe('hsToRgb', () => {
	it('maps hue and saturation to full-brightness RGB', () => {
		expect(hsToRgb(0, 100)).toEqual([255, 0, 0]);
		expect(hsToRgb(120, 100)).toEqual([0, 255, 0]);
		expect(hsToRgb(240, 50)).toEqual([128, 128, 255]);
	});

	it('wraps 360 (the hue slider’s end) and beyond back to red', () => {
		expect(hsToRgb(360, 100)).toEqual([255, 0, 0]);
		expect(hsToRgb(480, 100)).toEqual(hsToRgb(120, 100));
		expect(hsToRgb(-120, 100)).toEqual(hsToRgb(240, 100));
	});
});
