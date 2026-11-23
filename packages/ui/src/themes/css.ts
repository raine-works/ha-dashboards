/**
 * A theme as the dashboards' CSS: its tokens on the mount point's .light / .dark class (the card
 * puts one there; dark is also the :host default, before the first render), and its effects as
 * variables and a data attribute the effect styles in theme.css key off.
 *
 * @module
 */
import { type DashboardTheme, TOKEN_NAMES, type Tokens } from './tokens';

const declarations = (tokens: Tokens, theme: DashboardTheme) =>
	[`--radius: ${theme.radius};`, ...TOKEN_NAMES.map((name) => `--${name}: ${tokens[name]};`)].join(' ');

/** A theme's stylesheet for a card's ShadowRoot: both modes' tokens, the radius and the gradient's colors. */
export function themeCss(theme: DashboardTheme): string {
	const gradient = theme.effects?.gradient;
	const effectVars = gradient ? ` --gradient-from: ${gradient.from}; --gradient-to: ${gradient.to};` : '';
	return `.light { ${declarations(theme.light, theme)}${effectVars} }\n.dark, :host { ${declarations(theme.dark, theme)}${effectVars} }`;
}

/** The effects a theme turns on, as the mount point's `data-effects` (`edges glow`). */
export function themeEffects(theme: DashboardTheme): string {
	const effects = theme.effects;
	if (!effects?.gradient) return '';
	return [effects.edges && 'edges', effects.glow && 'glow'].filter(Boolean).join(' ');
}

/** A theme's tokens for one mode as inline style (a preview drawn in that theme, wherever it sits). */
export function themeStyle(theme: DashboardTheme, mode: 'light' | 'dark'): Record<string, string> {
	const tokens = mode === 'dark' ? theme.dark : theme.light;
	const style: Record<string, string> = { '--radius': theme.radius };
	for (const name of TOKEN_NAMES) style[`--${name}`] = tokens[name];
	const gradient = theme.effects?.gradient;
	if (gradient) {
		style['--gradient-from'] = gradient.from;
		style['--gradient-to'] = gradient.to;
	}
	return style;
}
