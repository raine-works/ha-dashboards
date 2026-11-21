// Tailwind lint (part of `bun run lint`): what the editor's Tailwind extension flags, which Biome
// can't check (its only Tailwind rule sorts classes). Loads Tailwind's own design system with the
// dashboards' theme and reports, across packages/*/src:
// - non-canonical classes (suggestCanonicalClasses): `[scrollbar-width:none]` → `scrollbar-none`,
//   `h-[420px]` → `h-105`, `data-[x]:` → `data-x:`
// - conflicts (cssConflict): two classes in one list with the same properties under the same
//   variants, so one silently wins (stacked `via-` stops)
// The stock shadcn files keep their upstream classes. Note the build compiles with
// bun-plugin-tailwind's older Tailwind, so a suggested utility it lacks gets a @utility in theme.css
// (as scrollbar-none did).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Glob } from 'bun';
import { __unstable__loadDesignSystem } from 'tailwindcss';

/** Mirrors of upstream shadcn/ui (components/ui), kept as shadcn writes them. */
const STOCK_SHADCN = [
	'ui/src/components/ui/chart.tsx',
	'ui/src/components/ui/alert.tsx',
	'ui/src/components/ui/tabs.tsx',
	'ui/src/components/ui/checkbox.tsx',
];

const root = resolve(import.meta.dir, '..');
const themePath = resolve(root, 'packages/ui/src/styles/theme.css');
const stylesheet = (path: string) => ({ path, base: dirname(path), content: readFileSync(path, 'utf8') });
// biome-ignore lint/suspicious/noExplicitAny: Tailwind's unstable design system API is untyped here
const ds: any = await __unstable__loadDesignSystem(`@import "tailwindcss";\n${readFileSync(themePath, 'utf8')}`, {
	base: dirname(themePath),
	async loadStylesheet(id: string, base: string) {
		if (id === 'tailwindcss') return stylesheet(resolve(root, 'node_modules/tailwindcss/index.css'));
		if (id.startsWith('tailwindcss/')) return stylesheet(resolve(root, 'node_modules', `${id}.css`));
		// The theme's other imports (Sonner's and Leaflet's CSS) define no utilities
		return { path: id, base, content: '' };
	},
} as never);

const isClass = (token: string) =>
	!!token && token.length < 200 && !token.includes('${') && !!ds.candidatesToCss([token])[0];
// A class's CSS with its own selector and every value taken out: wrappers and property names
const shape = (cls: string) =>
	(ds.candidatesToCss([cls])[0] as string)
		.replaceAll(`.${cls.replace(/[^a-zA-Z0-9-]/g, (c) => `\\${c}`)}`, '.X')
		.replace(/:\s*[^;{}]+;/g, ':;')
		.replace(/\s+/g, '');

const problems: string[] = [];
for (const file of new Glob('packages/*/src/**/*.{ts,tsx}').scanSync(root)) {
	const rel = file.replace('packages/', '');
	if (file.includes('__tests__') || STOCK_SHADCN.includes(rel)) continue;
	const text = readFileSync(resolve(root, file), 'utf8');
	for (const literal of text.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
		const line = text.slice(0, literal.index).split('\n').length;
		const classes = literal[2].split(/\s+/).filter(isClass);
		const shapes = new Map<string, string>();
		for (const cls of classes) {
			const [canonical] = ds.canonicalizeCandidates([cls], { rem: 16 });
			if (canonical && canonical !== cls) problems.push(`${rel}:${line}  ${cls} → ${canonical}`);
			const s = shape(cls);
			const other = shapes.get(s);
			if (other && other !== cls) problems.push(`${rel}:${line}  ${other} and ${cls} conflict (one silently wins)`);
			else shapes.set(s, cls);
		}
	}
}

for (const problem of problems) console.log(problem);
if (problems.length > 0) {
	console.log(`\nTailwind lint: ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
	process.exit(1);
}
console.log('Tailwind lint: no problems');
