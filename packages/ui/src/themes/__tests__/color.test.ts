import { describe, expect, it } from 'bun:test';
import { cssToHex, hexToRgbList, oklchCss, parseCssColor, rgbToOklch, toHex } from '../color';

describe('theme colors', () => {
	it('parses the CSS colors themes use', () => {
		expect(parseCssColor('oklch(0.145 0 0)')).toEqual({ color: { l: 0.145, c: 0, h: 0 }, alpha: 1 });
		expect(parseCssColor('oklch(1 0 0 / 10%)')?.alpha).toBeCloseTo(0.1);
		expect(parseCssColor('#ffffff')?.color.l).toBeCloseTo(1, 3);
		expect(parseCssColor('rgba(255, 255, 255, 0.1)')?.alpha).toBeCloseTo(0.1);
		expect(parseCssColor('rgb(0 0 0 / 50%)')?.alpha).toBeCloseTo(0.5);
		expect(parseCssColor('var(--x)')).toBeNull();
		expect(parseCssColor('linear-gradient(red, blue)')).toBeNull();
	});

	it("turns them into the hex Home Assistant's Companion apps need", () => {
		expect(cssToHex('oklch(0.145 0 0)')).toBe('#0a0a0a');
		expect(cssToHex('oklch(1 0 0)')).toBe('#ffffff');
		// A translucent color is what it shows as over its backdrop
		expect(cssToHex('oklch(1 0 0 / 10%)', '#000000')).toBe('#1a1a1a');
		expect(hexToRgbList('#0a0a0a')).toBe('10, 10, 10');
	});

	it('round-trips hex through OKLCH', () => {
		for (const hex of ['#ea9a7e', '#2998ad', '#f59e0b', '#3987e5']) expect(toHex(rgbToOklch(hexRgb(hex)))).toBe(hex);
		expect(oklchCss({ l: 0.1449, c: 0, h: 0 })).toBe('oklch(0.145 0 0)');
		expect(oklchCss({ l: 1, c: 0, h: 0 }, 0.1)).toBe('oklch(1 0 0 / 10%)');
	});
});

function hexRgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
