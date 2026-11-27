import { beforeAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { buildPanel } from '@app/dashboard-build';
import { bundleHash } from '../../scripts/publish';

// Build a fresh bundle (never published) rather than reading a committed artifact
const bundlePath = join(mkdtempSync(join(tmpdir(), 'dashboards-')), 'dashboards.js');

beforeAll(async () => {
	const ok = await buildPanel(
		{
			name: 'dashboards-test',
			entrypoint: resolve(import.meta.dir, '../index.tsx'),
			outfile: bundlePath,
			stylesKey: 'dashboards',
		},
		{ sync: false },
	);
	expect(ok).toBe(true);
}, 120_000);

describe('the dashboards bundle', () => {
	it('registers every card', async () => {
		const text = await Bun.file(bundlePath).text();
		for (const tag of ['home-dashboard', 'wall-panel-dashboard']) {
			expect(text).toContain(`tag:"${tag}"`);
		}
		// The section cards, for Home Assistant's sections view and its card picker
		for (const tag of ['header', 'lighting', 'security', 'climate', 'music', 'cameras'])
			expect(text).toContain(`tag:"raineworks-${tag}"`);
		expect(text).toContain('window.customCards');
		// Former tags still work
		for (const tag of ['kitchen-dashboard', 'basement-dashboard', 'hallway-dashboard', 'kitchen-wall-panel'])
			expect(text).toContain(tag);
	});

	it("carries one stylesheet, with the Home dashboard's phone rule scoped to it", async () => {
		const text = await Bun.file(bundlePath).text();
		expect(text.startsWith('(globalThis.__panelStyles??={})["dashboards"]=')).toBe(true);
		expect(text).toContain(':host(home-dashboard)');
	});

	it("follows a section card's own width inside it, and the screen's everywhere else", async () => {
		const text = await Bun.file(bundlePath).text();
		expect(text).toMatch(/@container card \(width\s*<\s*64rem\)\s*\{\.max-lg\\\\:[\w-]+:where\(\[data-card\] \*\)/);
		expect(text).toMatch(/\.max-lg\\\\:[\w-]+:not\(:where\(\[data-card\] \*\)\)/);
	});

	it('moves less in a card set to `motion: reduced`, as on a device that asks for less', async () => {
		const text = await Bun.file(bundlePath).text();
		// The motion-reduce: variant, and theme.css's own rules, under the media query and the attribute both
		expect(text).toContain('@media (prefers-reduced-motion:reduce){.motion-reduce\\\\:animate-none');
		expect(text).toContain(':where([data-motion=reduced]) .motion-reduce\\\\:animate-none');
		expect(text).toContain(':where([data-motion=reduced]) :is(.animate-pulse,.animate-ping)');
		expect(text).toContain(':where([data-motion=reduced]) .assist-card[data-phase] .assist-orb:after');
		// :is() can't hold a pseudo-element: a browser drops the whole rule
		expect(text).not.toMatch(/:is\([^)]*:(?:before|after)\b/);
	});

	// What every page loads: the bundle and the chunks it imports statically (code it shares with a
	// chunk loaded on demand); `import()` chunks load only when used
	const staticChunks = async () => {
		const text = await Bun.file(bundlePath).text();
		return [...text.matchAll(/from"\.\/(chunk-[\w-]+\.js)"/g)].map((m) => m[1]);
	};
	const chunks = () => readdirSync(dirname(bundlePath)).filter((f) => /^chunk-[\w-]+\.js$/.test(f));

	it('loads Recharts only with the energy charts', async () => {
		const always = await staticChunks();
		const lazy = chunks().filter((c) => !always.includes(c));
		const has = async (file: string) =>
			(await Bun.file(join(dirname(bundlePath), file)).text()).includes('recharts-surface');
		expect(lazy.length).toBeGreaterThan(0);
		expect(await Promise.all(lazy.map(has))).toContain(true);
		for (const c of always) expect(await has(c)).toBe(false);
		expect(await Bun.file(bundlePath).text()).toContain('import("./chunk-');
	});

	it('draws squircles where the browser can, and keeps circles round', async () => {
		const text = await Bun.file(bundlePath).text();
		expect(text).toMatch(/@supports \(?corner-shape: ?squircle\)?/);
		expect(text).toContain('corner-shape:squircle');
		expect(text).toContain('corner-shape:round');
		// Rounder than the default only where squircles are drawn (elsewhere a full squircle is a circle)
		expect(text).toMatch(/@supports \(?corner-shape: ?squircle\)?\s*\{\s*:host,\s*:root\s*\{\s*--corner-cap:\s*1000/);
		expect(text).toMatch(
			/rounded-icon\{border-radius:calc\(14px\s*\*\s*min\(var\(--corner-cap,\s*1\),\s*var\(--corner-scale,\s*1\)\)\)\}/,
		);
		// A circle drawn in CSS (the Assist orb) keeps its round curve too, and a pseudo-element (a ring
		// around a round key) takes its element's
		expect(text).toMatch(/\.assist-orb[^{}]*\{[^{}]*corner-shape:round/);
		expect(text).toMatch(
			/:before,\s*:after\{corner-shape:inherit\}|::before,\s*::after\s*\{\s*corner-shape:\s*inherit/,
		);
	});

	it("embeds Geist, raineworks.com's typeface, and no longer Poppins", async () => {
		const text = await Bun.file(bundlePath).text();
		expect(text).toContain("font-family:'Geist'");
		expect(text).not.toContain('Poppins');
	});

	it('stays within its budget', async () => {
		// Budget: every card (the music player, TVs with their app icons, the brief player, to-do date
		// picker, error boundaries, Assist with its Markdown answers, camera zoom, the clip player,
		// the Party QR code (uqr), Queue tab, energy dialog, litter box controls, the Daily dialog's Study tab, the intercom's quick messages and podcast episodes; ~90KB of it React Compiler memoization) + CSS (~90KB)
		// + Sonner + embedded Geist (~28KB) + Leaflet's CSS, once for all four dashboards (Leaflet's JS, ~160KB,
		// loads with the People dialog's map since it moved behind import(): 1.30MB → 1.14MB up front)
		// What a page loads up front: the bundle and its static chunks (the energy charts' Recharts,
		// ~420KB, loads on demand and isn't counted; the code it shares with the bundle, Preact and
		// tailwind-merge, is a static chunk that costs ~37KB more than when it was inside the bundle;
		// raised to 1.2MB for the bedtime toggles, their confirm dialogs and the away rooms; to 1.21MB for the
		// holiday easter eggs, ~12KB, whose drawings load on demand in a chunk of their own; to 1.22MB for
		// their sounds' player, ~2KB, the clips themselves loading on demand, a chunk per holiday; to 1.23MB
		// for the wall panels' party mode, whose view loads on demand: ~10KB more up front, mostly the
		// music code it shares with the page moving into a static chunk of its own; to 1.25MB when the React
		// Compiler took preact/compat's hooks for React's: ~15KB of memoization for the 13 functions it
		// had skipped, among them the slider, the alarm card and the dialog; to 1.26MB for the memoized
		// light, scene and queue rows, which re-render only when their own values change; to 1.27MB for the
		// soundbar's TV audio in Now Playing: what's on the TV in its room and its TV controls; to 1.28MB for
		// the to-do dialog's Completed tab and the pets dialog's level gauges; to 1.29MB for the dialogs'
		// history entries, so Back closes them; to 1.3MB for swiping notifications away and a swiped row's
		// spring back; down to 1.2MB once Leaflet's JS loaded with the People map, ~1.14MB then; to 1.21MB
		// for the redesign: room tiles and their dialog, a line per climate device, phone alerts, labeled
		// header buttons and bedtime by label, ~1.2MB with them; to 1.235MB for numbers that roll to a new value,
		// NumberFlow's element (~16KB: it's on screen from the first paint, the header's temperature, so it isn't
		// loaded on demand), and the phone sheets' drag down to close, ~1.23MB with them; to 1.24MB for the rest of
		// the rolling numbers and the to-do items' edit dialog, ~1.236MB with them; to 1.28MB for the section cards:
		// ~6KB of cards, and ~32KB of breakpoints written twice, as media queries and as container queries for
		// a card's own width, which compress to ~2KB (~3KB more brotli in all), ~1.275MB with them)
		const sizes = [bundlePath, ...(await staticChunks()).map((c) => join(dirname(bundlePath), c))].map(
			(path) => Bun.file(path).size,
		);
		expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(1_280_000);
	});

	it('names a bundle by its content', () => {
		expect(bundleHash('a')).toBe(bundleHash('a'));
		expect(bundleHash('a')).not.toBe(bundleHash('b'));
		expect(bundleHash('a')).toMatch(/^[0-9a-f]{12}$/);
	});
});
