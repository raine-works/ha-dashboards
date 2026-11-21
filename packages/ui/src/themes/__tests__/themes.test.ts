import { describe, expect, it } from 'bun:test';
import { parseCssColor } from '../color';
import { themeCss, themeEffects } from '../css';
import { haTheme } from '../ha-theme';
import { DEFAULT_THEME_ID, haThemeName, PRESET_THEMES, TOKEN_NAMES } from '../index';

const HEX = /^#[0-9a-f]{6}$/;

describe('the preset themes', () => {
	it('have unique ids, Raineworks first and the default', () => {
		expect(new Set(PRESET_THEMES.map((t) => t.id)).size).toBe(PRESET_THEMES.length);
		expect(PRESET_THEMES[0]?.id).toBe(DEFAULT_THEME_ID);
		expect(haThemeName(PRESET_THEMES[0]!)).toBe('Raineworks');
		expect(haThemeName({ id: 'blue', name: 'Blue' })).toBe('Raineworks Blue');
	});

	for (const theme of PRESET_THEMES)
		it(`${theme.name}: every token, in both modes, is a color`, () => {
			for (const mode of [theme.light, theme.dark])
				for (const name of TOKEN_NAMES) expect(parseCssColor(mode[name]), `${theme.id} ${name}`).not.toBeNull();
		});

	it('write their tokens for both modes, and Raineworks its effects', () => {
		const raineworks = PRESET_THEMES[0]!;
		const css = themeCss(raineworks);
		expect(css).toContain('.light {');
		expect(css).toContain('.dark, :host {');
		expect(css).toContain('--gradient-from: #ea9a7e;');
		expect(themeEffects(raineworks)).toBe('edges glow');
		expect(themeEffects(PRESET_THEMES[1]!)).toBe('');
	});
});

describe('as Home Assistant themes', () => {
	for (const theme of PRESET_THEMES)
		it(`${theme.name}: what the Companion apps read is hex, in both modes`, () => {
			const ha = haTheme(theme);
			for (const mode of [ha.modes.light, ha.modes.dark]) {
				expect(mode['app-header-background-color']).toMatch(HEX);
				expect(mode['primary-background-color']).toMatch(HEX);
				expect(mode['primary-color']).toMatch(HEX);
				expect(mode['rgb-primary-color']).toMatch(/^\d+, \d+, \d+$/);
				expect(mode['ha-color-primary-50']).toMatch(HEX);
				for (const [key, value] of Object.entries(mode)) expect(typeof value, key).toBe('string');
			}
		});

	it("Neutral's dark mode is Blackout's", () => {
		const dark = haTheme(PRESET_THEMES.find((t) => t.id === 'neutral')!).modes.dark;
		expect(dark['primary-background-color']).toBe('#0a0a0a');
		expect(dark['app-header-background-color']).toBe('#0a0a0a');
		expect(dark['primary-color']).toBe('#f59e0b');
		expect(dark['card-background-color']).toBe('#171717');
		expect(dark['divider-color']).toBe('rgba(255, 255, 255, 0.1)');
	});

	it('gives Raineworks cards a faint peach-and-teal glow', () => {
		const dark = haTheme(PRESET_THEMES[0]!).modes.dark;
		expect(dark['ha-card-box-shadow']).toContain('rgba(234, 154, 126, 0.35)');
		expect(dark['primary-color']).toBe('#2998ad');
	});
});
