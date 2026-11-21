import { describe, expect, it } from 'bun:test';
import { encode } from 'uqr';
import { qrPath } from '../qr';

describe('qrPath', () => {
	it('draws every dark module once, inside a quiet zone', () => {
		const text = 'https://app.music-assistant.io/join/abc123';
		const { size, path } = qrPath(text);
		const { data } = encode(text, { ecc: 'M', border: 4 });
		expect(size).toBe(data.length);
		const dark = data.flat().filter(Boolean).length;
		const drawn = [...path.matchAll(/h(\d+)/g)].reduce((sum, [, w]) => sum + Number(w), 0);
		expect(drawn).toBe(dark);
		// The quiet zone: nothing in the first four rows or columns
		expect(path).not.toMatch(/M[0-3] /);
		expect(path).not.toMatch(/M\d+ [0-3]h/);
	});
});
