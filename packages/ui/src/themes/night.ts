/**
 * The night level (docs/design/color.md): while Home Bedtime is on, a wall panel dims, so it never
 * lights up a dark hallway. Surfaces and text a step darker, the status colors softer, the brand's
 * glow off; the alarm (`destructive` / `alarm`) stays at full strength. Laid over a theme's dark
 * tokens (the wall panels are always dark), on the mount point while `data-night` is set.
 *
 * @module
 */
import type { TokenName } from './tokens';

/** What the night level changes; everything else keeps the theme's dark value. */
export const NIGHT_TOKENS: Partial<Record<TokenName, string>> = {
	background: 'oklch(0.12 0 0)',
	foreground: 'oklch(0.86 0 0)',
	card: 'oklch(0.155 0 0)',
	'card-foreground': 'oklch(0.86 0 0)',
	popover: 'oklch(0.18 0 0)',
	'popover-foreground': 'oklch(0.86 0 0)',
	// Each color night sets, it sets with its text: a theme's own foreground (white on a deep accent from
	// the theme editor) would be unreadable on the night's light gray or softened statuses
	primary: 'oklch(0.84 0 0)',
	'primary-foreground': 'oklch(0.145 0 0)',
	secondary: 'oklch(0.21 0 0)',
	'secondary-foreground': 'oklch(0.86 0 0)',
	muted: 'oklch(0.21 0 0)',
	'muted-foreground': 'oklch(0.66 0 0)',
	accent: 'oklch(0.21 0 0)',
	'accent-foreground': 'oklch(0.86 0 0)',
	// Chroma capped near 0.12: tinted surfaces that don't glow
	success: 'oklch(0.7 0.11 170)',
	warning: 'oklch(0.78 0.12 88)',
	info: 'oklch(0.66 0.1 255)',
	'success-foreground': 'oklch(0.145 0 0)',
	'warning-foreground': 'oklch(0.145 0 0)',
	'info-foreground': 'oklch(0.145 0 0)',
};

/** The night level as CSS, over the dark tokens on the mount point (`.dark[data-night]` wins over `.dark`). */
export function nightCss(): string {
	const vars = Object.entries(NIGHT_TOKENS)
		.map(([name, value]) => `--${name}: ${value};`)
		.join(' ');
	return `.dark[data-night] { ${vars} }`;
}

/**
 * Whether a card shows the night level: a wall panel (shared, on a wall) while Home Bedtime is on.
 * Phones and desktops are someone's own screen and follow their own brightness.
 */
export const isNight = (wallPanel: boolean, homeBedtime: string | undefined) => wallPanel && homeBedtime === 'on';
