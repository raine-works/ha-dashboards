// Which themes a page can show, and which one a card shows. The presets are built in; the custom
// themes (each person's own and the house's) come from the raineworks_dashboards integration,
// asked once per connection, with the house theme's id. One store for the page, so every card and
// the picker agree.
import type { HomeAssistant } from '../types/homeassistant';
import { DEFAULT_THEME_ID, haThemeName, PRESET_THEMES } from './index';
import type { DashboardTheme } from './tokens';

const INTEGRATION = 'raineworks_dashboards';

/** A theme someone can pick, and how Home Assistant knows it. */
export interface CatalogTheme {
	theme: DashboardTheme;
	/** Its name in Home Assistant's theme list. */
	haName: string;
	custom: boolean;
	/** This person's own custom theme (they can edit and delete it). */
	mine: boolean;
	/** A custom theme everyone sees (an administrator's). */
	shared: boolean;
}

export interface ThemeCatalog {
	themes: CatalogTheme[];
	/** The house theme's id (Home Assistant's default; '' when the house leaves Home Assistant's own). */
	house: string;
}

const presets: CatalogTheme[] = PRESET_THEMES.map((theme) => ({
	theme,
	haName: haThemeName(theme),
	custom: false,
	mine: false,
	shared: false,
}));

let catalog: ThemeCatalog = { themes: presets, house: DEFAULT_THEME_ID };
const listeners = new Set<() => void>();
let loadedFor: unknown = null;

export const themeCatalog = () => catalog;

export function subscribeThemeCatalog(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** For tests and the demo: replace what the integration said. */
export function setThemeCatalog(next: Partial<ThemeCatalog>) {
	catalog = { themes: next.themes ?? catalog.themes, house: next.house ?? catalog.house };
	for (const listener of listeners) listener();
}

type ThemesAnswer = {
	house?: unknown;
	themes?: { id: string; ha_name: string; custom?: boolean; mine?: boolean; shared?: boolean; tokens?: unknown }[];
};

/** A custom theme as the integration keeps it: tokens shaped like a preset's. */
function isTheme(value: unknown): value is DashboardTheme {
	const t = value as Partial<DashboardTheme> | null;
	return !!t && typeof t.id === 'string' && typeof t.name === 'string' && !!t.light && !!t.dark;
}

/** Ask the integration for the custom themes and the house theme, once per connection. */
export async function loadThemeCatalog(hass: Pick<HomeAssistant, 'callWS' | 'config' | 'connection'>) {
	if (!hass.callWS || !hass.config?.components?.includes(INTEGRATION) || hass.connection === loadedFor) return;
	loadedFor = hass.connection;
	try {
		const answer = await hass.callWS<ThemesAnswer>({ type: `${INTEGRATION}/themes` });
		const custom: CatalogTheme[] = (answer?.themes ?? []).flatMap((t) =>
			t.custom && isTheme(t.tokens)
				? [{ theme: t.tokens, haName: t.ha_name, custom: true, mine: !!t.mine, shared: !!t.shared }]
				: [],
		);
		setThemeCatalog({
			themes: [...presets, ...custom],
			house: typeof answer?.house === 'string' ? answer.house : DEFAULT_THEME_ID,
		});
	} catch (err) {
		loadedFor = null;
		console.warn('Raineworks Dashboards: could not read the themes', err);
	}
}

/** Ask again (after saving or deleting a custom theme). */
export function reloadThemeCatalog(hass: Pick<HomeAssistant, 'callWS' | 'config' | 'connection'>) {
	loadedFor = null;
	return loadThemeCatalog(hass);
}

const byId = (id: unknown) => catalog.themes.find((t) => t.theme.id === id);

/**
 * The theme a card shows: its own `theme` option, else the theme Home Assistant applies (the
 * person's pick, else the house default) when it's one of ours, else the house theme, else
 * Raineworks.
 */
export function activeTheme(
	hass: Pick<HomeAssistant, 'themes'> | null,
	cardTheme?: unknown,
	current: ThemeCatalog = catalog,
): DashboardTheme {
	const find = (id: unknown) => current.themes.find((t) => t.theme.id === id);
	const applied = hass?.themes?.theme;
	return (
		find(cardTheme)?.theme ??
		current.themes.find((t) => t.haName === applied)?.theme ??
		find(current.house)?.theme ??
		find(DEFAULT_THEME_ID)?.theme ??
		(PRESET_THEMES[0] as DashboardTheme)
	);
}

/** The catalog entry of a theme id, for the picker. */
export const catalogTheme = (id: string) => byId(id);

/**
 * Make `haName` this person's theme, as Home Assistant's Profile page does (a `settheme` event on
 * the app): saved to their profile, so it follows them to every device, and applied to the whole
 * of Home Assistant at once (the Companion apps' bars too). '' goes back to the house theme.
 */
export function setHomeAssistantTheme(haName: string) {
	document
		.querySelector('home-assistant')
		?.dispatchEvent(new CustomEvent('settheme', { detail: { theme: haName }, bubbles: true, composed: true }));
}
