import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { moduleFiles } from '../../../../scripts/modules-fixture';

// The integration's setup tools (Python) ship modules.json and are tested against
// tests/fixtures/modules.json; both have to be what lib/modules.ts says today
// (`bun scripts/modules-fixture.ts` writes them again after a change)
describe('the modules fixture', () => {
	for (const [path, content] of Object.entries(moduleFiles()))
		it(`${path.slice(path.lastIndexOf('/', path.lastIndexOf('/') - 1) + 1)} is current`, () => {
			// Compared as data: the file is in Biome's JSON style
			expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(JSON.parse(JSON.stringify(content)));
		});
});
