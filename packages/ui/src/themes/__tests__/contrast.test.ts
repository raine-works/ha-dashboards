import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { buildTheme } from '../build';
import { contrast, cssToHex, mixHex } from '../color';
import { cornerScale } from '../css';
import { PRESET_THEMES } from '../index';
import { isNight, NIGHT_TOKENS } from '../night';
import type { Tokens } from '../tokens';

// docs/design/color.md: text at 4.5:1 (WCAG 1.4.3), a control's edge at 3:1 (1.4.11), in every theme
// and both modes, so a theme can't ship a status color that can't be read
const TEXT = 4.5;
const CONTROL = 3;
const STATUSES = ['success', 'warning', 'info', 'destructive', 'alarm'] as const;

/** A status's tint, as the dashboards draw it: the color mixed into the surface (10% light, 14% dark). */
const tint = (tokens: Tokens, status: string, dark: boolean) =>
	mixHex(tokens[status as keyof Tokens], cssToHex(tokens.card) ?? '#000000', dark ? 0.14 : 0.1);

// Themes made in the theme editor too: a deep accent gets white text in dark mode, which the night
// level's light-gray primary would leave unreadable unless night sets the text with it
const BUILT = [
	buildTheme({
		name: 'Deep blue',
		from: PRESET_THEMES[0]!,
		base: 'neutral',
		accent: { kind: 'color', color: 'oklch(0.5 0.2 260)' },
		radius: '0.625rem',
		edges: false,
		glow: false,
	}),
];

for (const theme of [...PRESET_THEMES, ...BUILT])
	describe(`${theme.name}`, () => {
		for (const [mode, tokens] of [
			['light', theme.light],
			['dark', theme.dark],
			// The wall panels at night (Home Bedtime): dimmer, and still readable
			['night', { ...theme.dark, ...NIGHT_TOKENS } as Tokens],
		] as const) {
			const dark = mode !== 'light';
			// A translucent token (a dark border) shows over the card
			const on = (fg: string, bg: string) => contrast(fg, bg, cssToHex(tokens.card) ?? '#000000');

			it(`${mode}: text reads on every surface`, () => {
				for (const surface of ['background', 'card', 'popover', 'muted'] as const) {
					expect(on(tokens.foreground, tokens[surface]), `foreground on ${surface}`).toBeGreaterThanOrEqual(TEXT);
					expect(on(tokens['muted-foreground'], tokens[surface]), `muted text on ${surface}`).toBeGreaterThanOrEqual(
						TEXT,
					);
				}
				expect(on(tokens['primary-foreground'], tokens.primary), 'on primary').toBeGreaterThanOrEqual(TEXT);
				expect(on(tokens['secondary-foreground'], tokens.secondary), 'on secondary').toBeGreaterThanOrEqual(TEXT);
			});

			it(`${mode}: a control's edge shows (3:1)`, () => {
				expect(on(tokens.input, tokens.card), 'input on card').toBeGreaterThanOrEqual(CONTROL);
			});

			for (const status of STATUSES)
				it(`${mode}: ${status} reads as text, on its tint, and under its foreground`, () => {
					const color = tokens[status];
					expect(on(color, tokens.card), `${status} on card`).toBeGreaterThanOrEqual(TEXT);
					expect(on(color, tint(tokens, status, dark)), `${status} on its tint`).toBeGreaterThanOrEqual(TEXT);
					const foreground = status === 'destructive' ? undefined : tokens[`${status}-foreground` as keyof Tokens];
					if (foreground)
						expect(on(foreground, color), `${status}-foreground on ${status}`).toBeGreaterThanOrEqual(TEXT);
				});

			it(`${mode}: the alarm is the destructive red (one red for danger)`, () => {
				expect(tokens.alarm).toBe(tokens.destructive);
			});
		}
	});

describe('the night level', () => {
	it('dims a wall panel while Home Bedtime is on, and nothing else', () => {
		expect(isNight(true, 'on')).toBe(true);
		expect(isNight(true, 'off')).toBe(false);
		expect(isNight(true, undefined)).toBe(false);
		// A phone or desktop is someone's own screen
		expect(isNight(false, 'on')).toBe(false);
	});

	it('leaves the alarm at full strength', () => {
		expect(NIGHT_TOKENS.destructive).toBeUndefined();
		expect(NIGHT_TOKENS.alarm).toBeUndefined();
	});

	it('is darker than the dark mode it dims', () => {
		const l = (color: string) => Number(/oklch\(([\d.]+)/.exec(color)?.[1]);
		for (const theme of PRESET_THEMES) {
			expect(l(NIGHT_TOKENS.background ?? '')).toBeLessThan(l(theme.dark.background));
			expect(l(NIGHT_TOKENS.foreground ?? '')).toBeLessThan(l(theme.dark.foreground));
		}
	});
});

describe('corners', () => {
	const css = readFileSync(new URL('../../styles/theme.css', import.meta.url), 'utf8');

	it("follow the theme's corners, every role", () => {
		for (const role of ['chip', 'control', 'control-lg', 'icon', 'tile', 'dialog'])
			expect(css, role).toMatch(new RegExp(`--radius-${role}: calc\\([^;]*var\\(--corner-scale, 1\\)\\)`));
	});

	it("scale by the theme's radius against the default 0.625rem", () => {
		expect(cornerScale('0.625rem')).toBe(1);
		expect(cornerScale('1rem')).toBe(1.6);
		expect(cornerScale('0rem')).toBe(0);
		expect(cornerScale('10px')).toBe(1);
		expect(cornerScale('round')).toBe(1);
	});

	it('are no rounder than the default where the browser draws no squircles', () => {
		// A round corner half a shape's height is a circle: Raineworks' icon tiles and header buttons
		// were circles on the wall panels' WebView, which has no corner-shape
		for (const role of ['chip', 'control', 'control-lg', 'icon', 'tile', 'dialog'])
			expect(css, role).toMatch(
				new RegExp(
					`--radius-${role}: calc\\([^;]*min\\(var\\(--corner-cap, 1\\), var\\(--corner-scale, 1\\)\\)\\s*\\)`,
				),
			);
		for (const size of ['sm', 'md', 'lg', 'xl', '2xl'])
			expect(css, size).toMatch(
				new RegExp(`--radius-${size}: [^;]*min\\(var\\(--radius\\), 0\\.625rem \\* var\\(--corner-cap, 1\\)\\)`),
			);
		const squircles = css.slice(css.indexOf('@supports (corner-shape: squircle)'));
		expect(squircles).toMatch(/^@supports \(corner-shape: squircle\) \{\s*:host,\s*:root \{\s*--corner-cap: 1000;/);
	});

	it('are full squircles in Raineworks, the default', () => {
		const raineworks = PRESET_THEMES.find((t) => t.id === 'raineworks');
		expect(raineworks?.radius).toBe('1rem');
	});
});
