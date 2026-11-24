/**
 * A theme as a Home Assistant theme (the dict Home Assistant's frontend applies to its whole UI):
 * what the hand-written Blackout theme set, from a theme's tokens. The integration registers these
 * (custom_components/raineworks_dashboards/themes.py).
 *
 * - Hex, or rgba() for translucent colors: the Companion apps read app-header-background-color and
 *   primary-background-color and Android parses only hex and comma rgb(); Home Assistant derives
 *   its --rgb-* variables only from hex, and its rgba(var(--rgb-…)) uses need them.
 * - Home Assistant derives text-primary-color, the primary palette (ha-color-primary-05…95) and the
 *   like only for its own default theme, so a theme has to set them.
 * - Both modes are in `modes`, so Profile → Theme offers Auto, Light and Dark.
 *
 * @module
 */
import { cssToHex, fitGamut, hexToRgbList, mixHex, type Oklch, parseCssColor, toHex, withAlpha } from './color';
import type { DashboardTheme, Tokens } from './tokens';

/** One mode's Home Assistant theme variables, by name without the `--`. */
export type HaThemeVars = Record<string, string>;

/** A Home Assistant theme: shared variables at the top level, each mode's colors in `modes`. */
export interface HaTheme {
	[key: string]: string | { light: HaThemeVars; dark: HaThemeVars };
	modes: { light: HaThemeVars; dark: HaThemeVars };
}

const FONT = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
/** The palette steps Home Assistant 2026's newer components read (--ha-color-primary-05…95). */
const PALETTE_STEPS = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95];

/** A token as opaque hex over the mode's background (a translucent border shows as a gray). */
const hex = (value: string, backdrop: string) => cssToHex(value, backdrop) ?? '#808080';

/** A token as Home Assistant takes it: hex when opaque, rgba() when translucent. */
function css(value: string): string {
	const parsed = parseCssColor(value);
	if (!parsed) return value;
	const solid = toHex(parsed.color);
	if (parsed.alpha >= 1) return solid;
	return `rgba(${hexToRgbList(solid)}, ${+parsed.alpha.toFixed(3)})`;
}

/** Black or white, whichever reads on `background` (WCAG relative luminance). */
function readableOn(background: string): string {
	const [r, g, b] = (hexToRgbList(background).split(', ').map(Number) as number[]).map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
	return luminance > 0.4 ? '#0a0a0a' : '#fafafa';
}

/** The accent's palette from 05 (lightest) to 95 (darkest), Material-style, in its hue. */
function palette(accent: string): HaThemeVars {
	const seed = parseCssColor(accent)?.color ?? { l: 0.6, c: 0, h: 0 };
	const vars: HaThemeVars = {};
	for (const step of PALETTE_STEPS) {
		const l = 0.98 - (step / 100) * 0.86;
		// Chroma peaks mid-scale, as a tonal palette's does
		const c = seed.c * Math.min(1, 0.25 + 1.5 * Math.min(l, 1 - l));
		vars[`ha-color-primary-${String(step).padStart(2, '0')}`] = toHex(fitGamut({ l, c, h: seed.h } as Oklch));
	}
	return vars;
}

function modeVars(theme: DashboardTheme, t: Tokens, dark: boolean): HaThemeVars {
	const background = hex(t.background, '#000000');
	const on = (token: string) => hex(token, background);
	const card = on(t.card);
	const accent = hex(theme.chromeAccent?.[dark ? 'dark' : 'light'] ?? t.primary, background);
	const accentText = readableOn(accent);
	const foreground = on(t.foreground);
	const mutedForeground = on(t['muted-foreground']);
	const divider = css(t.border);
	const fill = dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)';
	const radius = `calc(${theme.radius} + 4px)`;
	const gradient = theme.effects?.gradient;
	// Raineworks-style glow under cards, faint (the dashboards' own cards have the full effect)
	const cardShadow =
		gradient && theme.effects?.glow
			? `-8px 6px 22px -14px ${withAlpha(gradient.from, 0.35)}, 8px 8px 24px -14px ${withAlpha(gradient.to, 0.35)}`
			: dark
				? '0 1px 2px rgba(0, 0, 0, 0.4)'
				: '0 1px 2px rgba(0, 0, 0, 0.06)';

	return {
		// Surfaces (hex: the Companion apps' status bar, page and navigation bar)
		'primary-background-color': background,
		'secondary-background-color': card,
		'card-background-color': card,
		'ha-card-background': card,
		'ha-dialog-surface-background': on(t.popover),
		'mdc-theme-surface': card,
		'material-background-color': card,
		'paper-listbox-background-color': card,
		'data-table-background-color': background,
		'table-row-background-color': card,
		'table-row-alternative-background-color': on(t.muted),
		'lovelace-background': background,
		'ha-panel-background': background,
		'app-header-background-color': background,
		'app-theme-color': background,
		'app-header-text-color': foreground,
		'app-header-edit-background-color': on(t.muted),
		'app-header-edit-text-color': foreground,
		'app-header-selection-bar-color': 'transparent',
		'sidebar-background-color': on(t.sidebar),
		'sidebar-text-color': foreground,
		'sidebar-icon-color': mutedForeground,
		'sidebar-selected-text-color': accent,
		'sidebar-selected-icon-color': accent,

		// Text
		'primary-text-color': foreground,
		'secondary-text-color': mutedForeground,
		'disabled-text-color': on(dark ? 'oklch(0.5 0 0)' : 'oklch(0.7 0 0)'),
		'text-primary-color': accentText,
		'text-accent-color': accentText,
		'divider-color': divider,
		'outline-color': divider,

		// The accent (Home Assistant's switches, sliders, buttons and selected items)
		'primary-color': accent,
		'accent-color': accent,
		'light-primary-color': mixHex(accent, background, 0.4),
		'dark-primary-color': accent,
		'mdc-theme-primary': accent,
		'mdc-theme-secondary': accent,
		'state-icon-color': mutedForeground,
		'state-icon-active-color': accent,
		'switch-checked-track-color': accent,
		'switch-checked-button-color': accentText,
		'switch-unchecked-track-color': divider,
		'switch-unchecked-button-color': mutedForeground,
		'slider-color': accent,
		'slider-track-color': divider,
		...palette(accent),

		// Statuses: the theme's, never the accent
		'error-color': on(t.destructive),
		'warning-color': on(t.warning),
		'success-color': on(t.success),
		'info-color': on(t.info),
		'state-unavailable-color': mutedForeground,

		// Cards
		'ha-card-border-radius': radius,
		'ha-card-border-width': '1px',
		'ha-card-border-color': divider,
		'ha-card-box-shadow': cardShadow,
		'ha-card-header-font-family': FONT,

		// Inputs
		'input-fill-color': fill,
		'mdc-text-field-fill-color': fill,
		'mdc-select-fill-color': fill,
		'input-ink-color': foreground,
		'input-label-ink-color': mutedForeground,
		'input-idle-line-color': divider,
		'input-hover-line-color': foreground,
		'input-dropdown-icon-color': mutedForeground,
		'mdc-checkbox-unchecked-color': mutedForeground,

		// Home Assistant derives --rgb-* only from hex values it's given; these are the ones it reads
		'rgb-primary-color': hexToRgbList(accent),
		'rgb-accent-color': hexToRgbList(accent),
		'rgb-text-primary-color': hexToRgbList(accentText),
		'rgb-primary-text-color': hexToRgbList(foreground),
		'rgb-secondary-text-color': hexToRgbList(mutedForeground),
		'rgb-primary-background-color': hexToRgbList(background),
		'rgb-card-background-color': hexToRgbList(card),
	};
}

/** The Home Assistant theme for `theme`: fonts at the top, each mode's colors in `modes`. */
export function haTheme(theme: DashboardTheme): HaTheme {
	return {
		'primary-font-family': FONT,
		'secondary-font-family': FONT,
		'paper-font-common-base_-_font-family': 'var(--secondary-font-family)',
		'paper-font-body1_-_font-family': 'var(--secondary-font-family)',
		'paper-font-headline_-_font-family': 'var(--primary-font-family)',
		'paper-font-title_-_font-family': 'var(--primary-font-family)',
		modes: { light: modeVars(theme, theme.light, false), dark: modeVars(theme, theme.dark, true) },
	};
}
