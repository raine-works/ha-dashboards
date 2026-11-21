import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REFERENCE, referencePages } from '../../../../scripts/docs';

// docs/reference is written from the code (the modules, the integration's options and actions);
// `bun scripts/docs.ts` writes it again after a change
describe('docs/reference', () => {
	for (const [name, content] of Object.entries(referencePages())) {
		it(`${name} matches the code`, () => {
			expect(readFileSync(resolve(REFERENCE, name), 'utf8')).toBe(content);
		});
	}
});
