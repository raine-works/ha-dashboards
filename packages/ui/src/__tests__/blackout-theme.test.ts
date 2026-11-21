import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';

import { neutral } from '../themes/presets/neutral';

// The Neutral theme (themes/presets/neutral.ts) is the source of truth; the Blackout Home Assistant
// theme mirrors it so YAML dashboards and panels share one design language.
const blackoutYaml = await Bun.file(resolve(import.meta.dir, '../../../../theme/blackout.yaml')).text();

const panelTokens: Record<string, string> = { ...neutral.dark, radius: neutral.radius };
// Top-level theme keys (two-space indent) only, so `modes:` overrides don't shadow them
const blackoutTokens = Object.fromEntries(
	[...blackoutYaml.matchAll(/^ {2}([a-z0-9-]+): "([^"]*)"$/gm)].map((m) => [m[1], m[2]]),
);

const SHADCN_ALIASES: Record<string, string> = {
	'shadcn-background': 'background',
	'shadcn-card': 'card',
	'shadcn-border': 'border',
	'shadcn-foreground': 'foreground',
	'shadcn-muted': 'muted',
	'shadcn-muted-foreground': 'muted-foreground',
	'shadcn-primary': 'primary',
	'shadcn-secondary': 'secondary',
	'shadcn-radius': 'radius',
	// HA's overlay surface (dialogs, sheets, dropdowns) uses shadcn's floating-surface color
	'ha-dialog-surface-background': 'popover',
};

describe('Blackout theme follows the panel shadcn theme', () => {
	// Chart and sidebar tokens are shadcn extras the panels and Blackout don't use
	const mirrored = Object.keys(panelTokens).filter((k) => !/^(chart|sidebar)(-|$)/.test(k));

	it('reads the panel tokens', () => {
		expect(mirrored).toContain('radius');
		expect(mirrored).toContain('warning');
	});

	it.each(mirrored)('--%s matches', (token) => {
		expect(blackoutTokens[token]).toBe(panelTokens[token]);
	});

	it.each(Object.entries(SHADCN_ALIASES))('%s mirrors --%s', (alias, token) => {
		expect(blackoutTokens[alias]).toBe(panelTokens[token]);
	});
});

// Light mode: Neutral's light tokens ↔ Blackout's `modes: light:` (six-space indent)
const panelLightTokens: Record<string, string> = { ...neutral.light, radius: neutral.radius };
const blackoutLight = blackoutYaml.slice(blackoutYaml.indexOf('\n    light:\n'));
const blackoutLightTokens = Object.fromEntries(
	[...blackoutLight.matchAll(/^ {6}([a-z0-9-]+): "([^"]*)"$/gm)].map((m) => [m[1], m[2]]),
);

describe('Blackout light mode follows the panel light theme', () => {
	const mirrored = Object.keys(panelLightTokens).filter((k) => !/^(chart|sidebar)(-|$)/.test(k));

	it('reads the light tokens', () => {
		expect(mirrored).toContain('background');
		expect(mirrored).toContain('warning');
	});

	it.each(mirrored)('--%s matches', (token) => {
		expect(blackoutLightTokens[token]).toBe(panelLightTokens[token]);
	});

	it.each(Object.entries(SHADCN_ALIASES))('%s mirrors --%s', (alias, token) => {
		expect(blackoutLightTokens[alias]).toBe(panelLightTokens[token]);
	});
});

// The Companion apps read these straight from the theme (status bar, navigation bar / page
// background, pull-to-refresh) and Android only parses hex, so oklch would leave its default colors
const COMPANION_APP_COLORS = ['app-header-background-color', 'primary-background-color', 'primary-color'];

describe('Blackout colors the Companion apps read are hex', () => {
	it.each(COMPANION_APP_COLORS)('%s (dark) is hex', (key) => {
		expect(blackoutTokens[key]).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it.each(COMPANION_APP_COLORS)('%s (light) is hex', (key) => {
		expect(blackoutLightTokens[key]).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it('matches the dashboards in dark mode (page background oklch(0.145 0 0) = #0a0a0a)', () => {
		expect(panelTokens.background).toBe('oklch(0.145 0 0)');
		expect(blackoutTokens['app-header-background-color']).toBe('#0a0a0a');
	});
});
