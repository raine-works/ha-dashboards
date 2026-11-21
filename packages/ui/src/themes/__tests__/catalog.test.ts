import { describe, expect, it } from 'bun:test';
import { activeTheme, themeCatalog } from '../catalog';

const hass = (theme?: string) => ({ themes: { theme, darkMode: true } }) as never;

describe('which theme a card shows', () => {
	const catalog = themeCatalog();

	it("is the theme Home Assistant applies, when it's one of ours", () => {
		expect(activeTheme(hass('Raineworks Blue'), undefined, catalog).id).toBe('blue');
	});

	it("is the house theme under Home Assistant's own, or another house's theme", () => {
		expect(activeTheme(hass('default'), undefined, { ...catalog, house: 'neutral' }).id).toBe('neutral');
		expect(activeTheme(hass('Someone Elses'), undefined, catalog).id).toBe('raineworks');
		expect(activeTheme(null, undefined, catalog).id).toBe('raineworks');
	});

	it("is the card's own theme option first", () => {
		expect(activeTheme(hass('Raineworks Blue'), 'rose', catalog).id).toBe('rose');
		expect(activeTheme(hass('Raineworks Blue'), 'nope', catalog).id).toBe('blue');
	});
});
