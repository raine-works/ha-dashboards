import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOLIDAY_IDS } from '../lib/holidays';

// The integration's holiday chime (custom_components/raineworks_dashboards/holidays.py) plays the
// clips the dashboards play (components/holiday/sounds/<id>.ts); its calendar is checked against
// the dashboards' day by day (tests/fixtures/holidays.json, holiday-fixture.test.ts and pytest)
const root = resolve(import.meta.dir, '../../../..');
const sounds = resolve(import.meta.dir, '../components/holiday/sounds');
const python = readFileSync(resolve(root, 'custom_components/raineworks_dashboards/holidays.py'), 'utf8');

/** HOLIDAY_SOUNDS from the Python: id → clips. */
function pythonSounds(): Record<string, string[]> {
	const block = python.slice(python.indexOf('HOLIDAY_SOUNDS'));
	const body = block.slice(block.indexOf('{') + 1, block.indexOf('\n}'));
	return Object.fromEntries(
		[...body.matchAll(/"([a-z-]+)": \(([^)]*)\)/g)].map((m) => [
			m[1] as string,
			[...(m[2] as string).matchAll(/"([\w-]+)"/g)].map((c) => c[1] as string),
		]),
	);
}

describe('the holiday chime', () => {
	it('has the clips the dashboards play, for every holiday', () => {
		const clips = pythonSounds();
		expect(Object.keys(clips).sort()).toEqual([...HOLIDAY_IDS].sort());
		for (const id of HOLIDAY_IDS) {
			const module = readFileSync(resolve(sounds, `${id}.ts`), 'utf8');
			const imported = [...module.matchAll(/from '\.\/([\w-]+)\.mp3'/g)].map((m) => m[1]);
			expect([...(clips[id] ?? [])].sort()).toEqual(imported.sort());
		}
	});
});
