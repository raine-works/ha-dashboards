// A theme as the dashboards' CSS: its tokens on the mount point's .light / .dark class (the card
// puts one there; dark is also the :host default, before the first render), and its effects as
// variables and a data attribute the effect styles in theme.css key off.
import { type DashboardTheme, TOKEN_NAMES, type Tokens } from './tokens';

const declarations = (tokens: Tokens, theme: DashboardTheme) =>
	[`--radius: ${theme.radius};`, ...TOKEN_NAMES.map((name) => `--${name}: ${tokens[name]};`)].join(' ');

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
