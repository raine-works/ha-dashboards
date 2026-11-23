/**
 * The Raineworks theme, the default: raineworks.com's design (its packages/ui/src/styles/globals.css),
 * shadcn's black and white with one accent, a peach-to-teal gradient blended in oklab, used only as
 * decoration (edges, a glow, hairlines), never as a status. Controls stay black and white; statuses
 * keep their own colors.
 *
 * @module
 */
import type { DashboardTheme } from '../tokens';
import { neutral } from './neutral';

const PEACH = '#ea9a7e';
const TEAL = '#2998ad';

/** The Raineworks theme (the default): black and white with a peach-to-teal gradient. */
export const raineworks: DashboardTheme = {
	id: 'raineworks',
	name: 'Raineworks',
	description: 'Black and white with a peach-to-teal edge and glow',
	radius: '0.625rem',
	light: {
		...neutral.light,
		'muted-foreground': 'oklch(0.51 0 0)',
		destructive: 'oklch(0.54 0.22 27.3)',
		success: 'oklch(0.5 0.12 150)',
		'success-foreground': 'oklch(1 0 0)',
		warning: 'oklch(0.53 0.13 55)',
		'warning-foreground': 'oklch(1 0 0)',
		info: 'oklch(0.5 0.13 255)',
		'info-foreground': 'oklch(1 0 0)',
		// Darker than shadcn's so a control's edge stands out (3:1)
		input: 'oklch(0.6 0 0)',
		ring: 'oklch(0.205 0 0)',
		sidebar: 'oklch(0.985 0 0)',
		'sidebar-accent': 'oklch(0.95 0 0)',
		'sidebar-ring': 'oklch(0.205 0 0)',
	},
	dark: {
		...neutral.dark,
		success: 'oklch(0.78 0.14 152)',
		'success-foreground': 'oklch(0.145 0 0)',
		warning: 'oklch(0.8 0.13 70)',
		'warning-foreground': 'oklch(0.145 0 0)',
		info: 'oklch(0.76 0.11 250)',
		'info-foreground': 'oklch(0.145 0 0)',
		input: 'oklch(1 0 0 / 40%)',
		ring: 'oklch(0.922 0 0)',
		sidebar: 'oklch(0.18 0 0)',
		'sidebar-primary': 'oklch(0.922 0 0)',
		'sidebar-primary-foreground': 'oklch(0.205 0 0)',
		'sidebar-ring': 'oklch(0.922 0 0)',
	},
	effects: { gradient: { from: PEACH, to: TEAL }, edges: true, glow: true },
	// Home Assistant's switches, sliders and selected sidebar item: the gradient's teal (darkened on
	// white for contrast, as the site's gradient text is)
	chromeAccent: { light: '#1f7f92', dark: TEAL },
};
