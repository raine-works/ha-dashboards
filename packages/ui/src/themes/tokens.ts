// What a theme sets: shadcn's color tokens (new-york v4), the dashboards' status colors (success,
// warning, info, alarm), the chart palette and the sidebar's, for light and dark. The names are the
// CSS variables' (without the --), which the components read through Tailwind (bg-background…).

export const TOKEN_NAMES = [
	'background',
	'foreground',
	'card',
	'card-foreground',
	'popover',
	'popover-foreground',
	'primary',
	'primary-foreground',
	'secondary',
	'secondary-foreground',
	'muted',
	'muted-foreground',
	'accent',
	'accent-foreground',
	'destructive',
	'success',
	'success-foreground',
	'warning',
	'warning-foreground',
	'info',
	'info-foreground',
	'alarm',
	'alarm-foreground',
	'border',
	'input',
	'ring',
	'chart-1',
	'chart-2',
	'chart-3',
	'chart-4',
	'chart-5',
	'chart-6',
	'chart-7',
	'sidebar',
	'sidebar-foreground',
	'sidebar-primary',
	'sidebar-primary-foreground',
	'sidebar-accent',
	'sidebar-accent-foreground',
	'sidebar-border',
	'sidebar-ring',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];

/** Every token's CSS value (oklch, hex, or a color with alpha) for one mode. */
export type Tokens = Record<TokenName, string>;

/** Decoration a theme adds over its colors (the dashboards only; Home Assistant can't draw these). */
export interface ThemeEffects {
	/** Two colors (any CSS color), blended in oklab: edges, glows and hairlines. */
	gradient?: { from: string; to: string };
	/** A gradient edge on primary buttons, and on cards and selected items as they're focused or chosen. */
	edges?: boolean;
	/** A two-color glow under primary buttons. */
	glow?: boolean;
}

export interface DashboardTheme {
	/** Stable id (`raineworks`, `neutral`, or a custom theme's). */
	id: string;
	/** Its name in the pickers, and (prefixed) in Home Assistant's theme list. */
	name: string;
	/** One line about it. */
	description?: string;
	/** The base corner radius (CSS length). */
	radius: string;
	light: Tokens;
	dark: Tokens;
	effects?: ThemeEffects;
	/**
	 * Home Assistant's own accent (its switches, sliders, the sidebar's selected item), per mode;
	 * the theme's primary when unset.
	 */
	chromeAccent?: { light?: string; dark?: string };
}
