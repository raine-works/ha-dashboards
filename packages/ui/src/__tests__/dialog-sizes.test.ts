import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Glob } from 'bun';

// AGENTS.md: the dialog sizes (DialogContent's `size`: `default`, `workspace` or `sheet`), and a dialog never sets
// its own width or height. This finds DialogContent tags whose classes size them anyway.

const packages = resolve(import.meta.dir, '../../..');

/**
 * Dialogs with a shape of their own, not yet a size variant: Party mode takes the whole screen, and the
 * keypad keeps a phone keypad's narrow column. Don't add to this list: add a size to components/ui/dialog.tsx.
 */
const KNOWN = new Set(['ui/src/components/music/PartyMode.tsx', 'ui/src/components/security/KeypadModal.tsx']);

/** Classes that set a width or height, under any variants (`sm:max-w-md`, `max-sm:max-h-[…]`). */
const SIZING = /^!?(?:min-|max-)?(?:w|h|size)-/;

/** The sizing classes in each `<DialogContent …>` tag of a file's source, with their line. */
function sizedDialogs(source: string): { line: number; classes: string[] }[] {
	const found: { line: number; classes: string[] }[] = [];
	for (const match of source.matchAll(/<DialogContent\b[\s\S]*?>\s*\n/g)) {
		const classes = match[0]
			.split(/[\s"'`{}]+/)
			.filter((token) => SIZING.test(token.slice(token.lastIndexOf(':') + 1)));
		if (classes.length > 0) found.push({ line: source.slice(0, match.index).split('\n').length, classes });
	}
	return found;
}

describe('dialog sizes', () => {
	it('finds the sizing classes it looks for', () => {
		const source =
			'<DialogContent className="gap-5 sm:max-w-md">\n<DialogContent size="workspace" className="overflow-hidden">\n';
		expect(sizedDialogs(source)).toEqual([{ line: 1, classes: ['sm:max-w-md'] }]);
		expect(sizedDialogs('<DialogContent className="max-sm:top-auto max-sm:max-h-[calc(100%-2rem)]">\n')).toEqual([
			{ line: 1, classes: ['max-sm:max-h-[calc(100%-2rem)]'] },
		]);
	});

	it('no dialog sets its own width or height', () => {
		const sized: string[] = [];
		for (const file of new Glob('*/src/**/*.tsx').scanSync(packages)) {
			if (file.includes('__tests__') || file.endsWith('components/ui/dialog.tsx') || KNOWN.has(file)) continue;
			for (const { line, classes } of sizedDialogs(readFileSync(resolve(packages, file), 'utf8')))
				sized.push(`${file}:${line} ${classes.join(' ')}`);
		}
		expect(sized).toEqual([]);
	});

	it('a sheet lets go of the top on phones but keeps a height cap', () => {
		// Without the cap, a sheet anchored only at the bottom grows past the toolbar and nothing scrolls
		const source = readFileSync(resolve(packages, 'ui/src/components/ui/dialog.tsx'), 'utf8');
		const sheet = source.match(/const SHEET =\s*'([^']*)'/)?.[1].split(/\s+/) ?? [];
		expect(sheet).toContain('max-sm:top-auto');
		expect(sheet).toContain('max-sm:max-h-[calc(var(--panel-height)-2rem)]');
		expect(source).toContain("size === 'sheet' && SHEET,\n\t\t\t\t\tclassName,");
	});
});
