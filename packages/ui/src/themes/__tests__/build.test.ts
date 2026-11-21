import { describe, expect, it } from 'bun:test';
import { buildTheme, exportCss, importCss } from '../build';
import { parseCssColor } from '../color';
import { haTheme } from '../ha-theme';
import { neutral } from '../presets/neutral';
import { raineworks } from '../presets/raineworks';
import { TOKEN_NAMES } from '../tokens';

const lightness = (v: string) => parseCssColor(v)?.color.l ?? Number.NaN;

describe('making a theme', () => {
	it('puts a color accent on primary, the ring and Home Assistant, readable in both modes', () => {
		const theme = buildTheme({
			name: 'Sunset',
			from: neutral,
			base: 'neutral',
			accent: { kind: 'color', color: '#ff7a1a' },
			radius: '1rem',
			edges: false,
			glow: false,
		});
		expect(theme.id).toBe('custom-sunset');
		expect(theme.radius).toBe('1rem');
		expect(lightness(theme.light.primary)).toBeLessThanOrEqual(0.58);
		expect(lightness(theme.dark.primary)).toBeGreaterThanOrEqual(0.62);
		expect(theme.effects).toBeUndefined();
		expect(theme.chromeAccent?.dark).toMatch(/^#[0-9a-f]{6}$/);
		// Statuses are the starting theme's
		expect(theme.dark.warning).toBe(neutral.dark.warning);
	});

	it('makes a gradient into edges and a glow, keeping controls black and white', () => {
		const theme = buildTheme({
			name: 'Dusk',
			from: neutral,
			base: 'zinc',
			accent: { kind: 'gradient', from: '#7c3aed', to: '#06b6d4' },
			radius: '0.625rem',
			edges: true,
			glow: false,
		});
		expect(theme.effects).toEqual({ gradient: { from: '#7c3aed', to: '#06b6d4' }, edges: true, glow: false });
		expect(theme.dark.primary).not.toContain('0.2 ');
		// Zinc tints the grays
		expect(parseCssColor(theme.dark.muted)?.color.c).toBeGreaterThan(0);
		expect(haTheme(theme).modes.dark['primary-color']).toBe('#06b6d4');
	});

	it("round-trips shadcn's CSS", () => {
		const css = exportCss(raineworks);
		expect(css).toContain(':root {');
		expect(css).toContain('.dark {');
		expect(css).toContain('--gradient-from: #ea9a7e;');
		const back = importCss(css, neutral, 'Copy');
		expect(back?.dark).toEqual(raineworks.dark);
		expect(back?.light).toEqual(raineworks.light);
		expect(back?.effects?.gradient).toEqual(raineworks.effects?.gradient);
	});

	it('imports a theme from ui.shadcn.com or tweakcn, keeping the statuses it lacks', () => {
		const pasted = `@layer base {
  :root {
    --radius: 0.5rem;
    --background: hsl(0 0% 100%);
    --primary: oklch(0.6 0.2 30);
    --font-sans: Inter;
  }
  .dark {
    --background: oklch(0.15 0.01 30);
    --primary: oklch(0.7 0.18 30);
  }
}`;
		const theme = importCss(pasted, neutral, 'Ember');
		expect(theme?.radius).toBe('0.5rem');
		expect(theme?.light.primary).toBe('oklch(0.6 0.2 30)');
		expect(theme?.dark.background).toBe('oklch(0.15 0.01 30)');
		expect(theme?.dark.success).toBe(neutral.dark.success);
		for (const name of TOKEN_NAMES) expect(parseCssColor(theme!.light[name]), name).not.toBeNull();
		expect(importCss('body { color: red; }', neutral, 'Nothing')).toBeNull();
	});
});

describe('keeping the starting theme', () => {
	it("keeps Raineworks' colors and gradient, with the effects as chosen", () => {
		const theme = buildTheme({
			name: 'Rounder',
			from: raineworks,
			base: 'neutral',
			accent: { kind: 'keep' },
			radius: '1rem',
			edges: true,
			glow: false,
		});
		expect(theme.dark).toEqual(raineworks.dark);
		expect(theme.effects).toEqual({ gradient: raineworks.effects?.gradient, edges: true, glow: false });
		expect(theme.chromeAccent).toEqual(raineworks.chromeAccent);
	});
});
