import { createContext, useContext } from 'preact/compat';
import { readStored, writeStored } from '../lib/storage';
import type { HomeAssistant } from '../types/homeassistant';
import { useHassSelector } from './HassContext';

export type ColorScheme = 'light' | 'dark';
/** Card option `color_scheme`: follow Home Assistant (`auto`), or force one mode. */
export type ColorSchemeSetting = ColorScheme | 'auto';

/** The mode a dashboard renders in (set by definePanelElement, which also puts the class on the mount point). */
export const ColorSchemeContext = createContext<ColorScheme>('dark');

export const useColorScheme = () => useContext(ColorSchemeContext);

const prefersDark = () =>
	typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Resolve a setting to a mode. `auto` follows the user's Home Assistant theme mode (Settings →
 * Profile → Theme: Auto / Light / Dark, where Auto follows the device), else the device itself.
 */
export function resolveColorScheme(setting: unknown, hass: Pick<HomeAssistant, 'themes'> | null): ColorScheme {
	if (setting === 'light' || setting === 'dark') return setting;
	const darkMode = hass?.themes?.darkMode;
	if (typeof darkMode === 'boolean') return darkMode ? 'dark' : 'light';
	return prefersDark() ? 'dark' : 'light';
}

// The Appearance picker sets Home Assistant's own theme mode (Profile → Browser settings → Theme:
// Auto / Light / Dark), so Home Assistant's whole page and the Companion app follow it, not only
// the dashboards; Home Assistant keeps it per browser, so it's this device's choice
const app = () => document.querySelector('home-assistant');

/** This browser's Home Assistant theme mode (`selectedTheme.dark`: unset = Auto, following the device). */
export function homeAssistantColorScheme(hass: Pick<HomeAssistant, 'selectedTheme'> | null): ColorSchemeSetting {
	const dark = hass?.selectedTheme?.dark;
	return dark === true ? 'dark' : dark === false ? 'light' : 'auto';
}

/**
 * Set Home Assistant's theme mode, as its Profile page does: a `settheme` event on the app, which
 * applies it at once (its `hass.themes.darkMode` follows, re-coloring every card) and saves it.
 */
export function setHomeAssistantColorScheme(setting: ColorSchemeSetting) {
	app()?.dispatchEvent(
		new CustomEvent('settheme', {
			detail: { dark: setting === 'auto' ? undefined : setting === 'dark' },
			bubbles: true,
			composed: true,
		}),
	);
}

// Before the picker set Home Assistant's mode it kept its own choice per device; hand it over once
const LEGACY_SCHEME_KEY = 'ha-dashboards:color-scheme';
let migrated = false;

/** Move a device's old dashboard-only Light / Dark choice into Home Assistant's theme mode. */
export function migrateDeviceColorScheme() {
	if (migrated) return;
	migrated = true;
	const saved = readStored(LEGACY_SCHEME_KEY);
	if (saved === null) return;
	writeStored(LEGACY_SCHEME_KEY, null);
	// Out of the render that called it: Home Assistant hands every card a new hass at once
	if (saved === 'light' || saved === 'dark') queueMicrotask(() => setHomeAssistantColorScheme(saved));
}

/** Home Assistant's Light / Dark / Auto for this browser and its setter, for the picker. */
export function useHomeAssistantColorScheme(): [ColorSchemeSetting, (setting: ColorSchemeSetting) => void] {
	// No entity holds it: re-checked only on updates that changed more than states
	return [useHassSelector(homeAssistantColorScheme, { watch: [] }), setHomeAssistantColorScheme];
}
