import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { THEMES_JSON, themesJson } from '../../../../scripts/themes';

// The integration registers the themes from this file; `bun scripts/themes.ts` writes it again
describe('the integration’s themes.json', () => {
	it('is the preset themes', () => {
		expect(readFileSync(THEMES_JSON, 'utf8')).toBe(themesJson());
	});
});
