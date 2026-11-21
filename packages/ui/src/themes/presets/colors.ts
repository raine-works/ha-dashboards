import { oklchCss } from '../color';
import type { DashboardTheme } from '../tokens';
import { neutral } from './neutral';

/**
 * A color theme the way shadcn's are made: Neutral with its primary, focus ring and the sidebar's
 * selection in one hue (a step darker on white than on black, so text on it stays readable).
 */
function colorTheme(id: string, name: string, hue: number, chroma: number): DashboardTheme {
	const light = oklchCss({ l: 0.55, c: chroma, h: hue });
	const dark = oklchCss({ l: 0.68, c: chroma, h: hue });
	const ringLight = oklchCss({ l: 0.7, c: chroma * 0.7, h: hue });
	const ringDark = oklchCss({ l: 0.5, c: chroma * 0.7, h: hue });
	return {
		id,
		name,
		description: `Neutral with a ${name.toLowerCase()} accent`,
		radius: neutral.radius,
		light: {
			...neutral.light,
			primary: light,
			'primary-foreground': 'oklch(0.985 0 0)',
			ring: ringLight,
			'sidebar-primary': light,
			'sidebar-primary-foreground': 'oklch(0.985 0 0)',
			'sidebar-ring': ringLight,
		},
		dark: {
			...neutral.dark,
			primary: dark,
			'primary-foreground': 'oklch(0.145 0 0)',
			ring: ringDark,
			'sidebar-primary': dark,
			'sidebar-primary-foreground': 'oklch(0.145 0 0)',
			'sidebar-ring': ringDark,
		},
	};
}

export const blue = colorTheme('blue', 'Blue', 259, 0.17);
export const green = colorTheme('green', 'Green', 150, 0.15);
export const orange = colorTheme('orange', 'Orange', 50, 0.17);
export const rose = colorTheme('rose', 'Rose', 12, 0.18);
export const violet = colorTheme('violet', 'Violet', 293, 0.2);
