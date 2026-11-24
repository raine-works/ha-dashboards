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
	// Generous corners, so the squircle shows: the icon tiles and big buttons full squircles
	radius: '1rem',
	light: {
		// The neutrals and status colors are Neutral's (docs/design/color.md), which every theme shares
		...neutral.light,
		ring: 'oklch(0.205 0 0)',
		sidebar: 'oklch(0.985 0 0)',
		'sidebar-accent': 'oklch(0.95 0 0)',
		'sidebar-ring': 'oklch(0.205 0 0)',
	},
	dark: {
		...neutral.dark,
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
