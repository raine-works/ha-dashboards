import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';

// AGENTS.md: nothing renders over Home Assistant's toolbar but an open dialog's overlay; heights use
// --panel-height, never vh. The viewport's height units (vh, svh, dvh, lvh) count the toolbar too, so a
// size taken from them is wrong by the toolbar's height. theme.css defines --panel-height from 100dvh,
// the one place a viewport unit belongs.

const packages = resolve(import.meta.dir, '../../..');

/** A length in a viewport height unit: `10svh`, `2.5vh`, `100dvh`. */
const VIEWPORT_HEIGHT = /(?<![\w.-])\d*\.?\d+[sdl]?vh\b/g;

/** Each viewport height length in a file's source, with its line. */
function viewportHeights(source: string): string[] {
	return [...source.matchAll(VIEWPORT_HEIGHT)].map(
		(match) => `${source.slice(0, match.index).split('\n').length}: ${match[0]}`,
	);
}

describe('viewport height units', () => {
	it('finds the units it looks for', () => {
		expect(viewportHeights("pad: 'max-sm:size-[min(5.5rem,22vw,10svh)]'")).toEqual(['1: 10svh']);
		expect(viewportHeights('mt-[6vh] gap-y-[2.5dvh]\nh-[100lvh]')).toEqual(['1: 6vh', '1: 2.5dvh', '2: 100lvh']);
		expect(viewportHeights('h-[calc(var(--panel-height)*0.1)] w-[95vw] max-h-[3vhx]')).toEqual([]);
	});

	it('no component sizes itself from the viewport height', () => {
		const found: string[] = [];
		for (const file of new Glob('*/src/**/*.{ts,tsx}').scanSync(packages)) {
			if (file.includes('__tests__')) continue;
			for (const hit of viewportHeights(readFileSync(resolve(packages, file), 'utf8'))) found.push(`${file}:${hit}`);
		}
		expect(found).toEqual([]);
	});
});
