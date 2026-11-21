// Making a theme: from a starting theme, an accent (one color, or a two-color gradient for the
// edges and glow), a gray base, a radius and effects; and shadcn's CSS in and out, so themes from
// ui.shadcn.com/themes or tweakcn come in as they are. Pure, so the editor previews as you go.
import { cssToHex, mixHex, oklchCss, parseCssColor } from './color';
import { type DashboardTheme, TOKEN_NAMES, type TokenName, type Tokens } from './tokens';

export type BaseGray = 'neutral' | 'zinc' | 'stone' | 'slate';

/** shadcn's gray bases: a hue and how much of it the grays carry. */
export const BASE_GRAYS: Record<BaseGray, { name: string; hue: number; chroma: number }> = {
	neutral: { name: 'Neutral', hue: 0, chroma: 0 },
	zinc: { name: 'Zinc', hue: 286, chroma: 0.006 },
	stone: { name: 'Stone', hue: 56, chroma: 0.005 },
	slate: { name: 'Slate', hue: 257, chroma: 0.014 },
};

export interface ThemeChoices {
	name: string;
	/** The theme it starts from (its statuses, charts and everything else). */
	from: DashboardTheme;
	base: BaseGray;
	/**
	 * The starting theme's own accent (`keep`), one color (buttons, focus, Home Assistant's switches),
	 * or two for a gradient (edges and glow).
	 */
	accent: { kind: 'keep' } | { kind: 'color'; color: string } | { kind: 'gradient'; from: string; to: string };
	radius: string;
	edges: boolean;
	glow: boolean;
}

/** A gray of `tokens` moved onto the base's hue (colored tokens stay as they are). */
function tint(value: string, base: BaseGray): string {
	const parsed = parseCssColor(value);
	const gray = BASE_GRAYS[base];
	if (!parsed || parsed.color.c > 0.03 || gray.chroma === 0) return value;
	const { l } = parsed.color;
	// Most chroma in the middle of the scale, as shadcn's bases have it
	const c = gray.chroma * (l > 0.97 || l < 0.12 ? 0.4 : l > 0.6 && l < 0.8 ? 2.5 : 1);
	return oklchCss({ l, c, h: gray.hue }, parsed.alpha);
}

/** Black or white text, whichever reads on `color`. */
function textOn(color: string): string {
	const l = parseCssColor(color)?.color.l ?? 0.5;
	return l > 0.62 ? 'oklch(0.145 0 0)' : 'oklch(0.985 0 0)';
}

/** The accent a step darker on white and lighter on black, so it reads on both. */
function forMode(color: string, dark: boolean): string {
	const parsed = parseCssColor(color);
	if (!parsed) return color;
	const { l, c, h } = parsed.color;
	const target = dark ? Math.max(l, 0.62) : Math.min(l, 0.58);
	return oklchCss({ l: target, c, h });
}

function accented(tokens: Tokens, accent: string, dark: boolean): Tokens {
	const color = forMode(accent, dark);
	const ring = oklchCss({ ...(parseCssColor(color)?.color ?? { l: 0.6, c: 0, h: 0 }), l: dark ? 0.5 : 0.7 });
	return {
		...tokens,
		primary: color,
		'primary-foreground': textOn(color),
		ring,
		'sidebar-primary': color,
		'sidebar-primary-foreground': textOn(color),
		'sidebar-ring': ring,
	};
}

export const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'theme';

/** The theme these choices make. */
export function buildTheme(choices: ThemeChoices, id = ''): DashboardTheme {
	const tintAll = (tokens: Tokens) =>
		Object.fromEntries(TOKEN_NAMES.map((n) => [n, tint(tokens[n], choices.base)])) as Tokens;
	let light = tintAll(choices.from.light);
	let dark = tintAll(choices.from.dark);
	const accent = choices.accent;
	let chromeAccent: DashboardTheme['chromeAccent'];
	let effects: DashboardTheme['effects'];
	if (accent.kind === 'keep') {
		chromeAccent = choices.from.chromeAccent;
		const gradient = choices.from.effects?.gradient;
		if (gradient) effects = { gradient, edges: choices.edges, glow: choices.glow };
	} else if (accent.kind === 'color') {
		light = accented(light, accent.color, false);
		dark = accented(dark, accent.color, true);
		chromeAccent = {
			light: cssToHex(forMode(accent.color, false)) ?? undefined,
			dark: cssToHex(forMode(accent.color, true)) ?? undefined,
		};
	} else {
		// A gradient decorates: controls stay the base's black and white, as Raineworks has them
		effects = { gradient: { from: accent.from, to: accent.to }, edges: choices.edges, glow: choices.glow };
		const to = cssToHex(accent.to) ?? '#808080';
		chromeAccent = { light: mixHex(to, '#000000', 0.8), dark: to };
	}
	return {
		id: id || `custom-${slug(choices.name)}`,
		name: choices.name.trim() || 'My theme',
		radius: choices.radius,
		light,
		dark,
		...(effects ? { effects } : {}),
		...(chromeAccent ? { chromeAccent } : {}),
	};
}

/** A theme's CSS variables as shadcn writes them (:root light, .dark dark), with its gradient. */
export function exportCss(theme: DashboardTheme): string {
	const block = (selector: string, tokens: Tokens) => {
		const lines = [`  --radius: ${theme.radius};`, ...TOKEN_NAMES.map((n) => `  --${n}: ${tokens[n]};`)];
		const gradient = theme.effects?.gradient;
		if (gradient) lines.push(`  --gradient-from: ${gradient.from};`, `  --gradient-to: ${gradient.to};`);
		return `${selector} {\n${lines.join('\n')}\n}`;
	};
	return `${block(':root', theme.light)}\n\n${block('.dark', theme.dark)}\n`;
}

/**
 * shadcn's CSS (from ui.shadcn.com/themes, tweakcn, or a project's globals.css) as a theme over
 * `base`: :root (or .light) for light, .dark for dark; tokens it doesn't set (the status colors,
 * which shadcn doesn't have) stay the base's. Null when it has no colors at all.
 */
export function importCss(css: string, base: DashboardTheme, name: string): DashboardTheme | null {
	const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
	const vars = (selector: RegExp) => {
		const found: Record<string, string> = {};
		for (const [, sel, body] of blocks)
			if (sel && body && selector.test(sel.trim()))
				for (const [, k, v] of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) if (k && v) found[k] = v.trim();
		return found;
	};
	const lightVars = vars(/(^|,|\s)(:root|\.light)(\s|,|$)/);
	const darkVars = vars(/(^|\s|,)\.dark(\s|,|$)/);
	const apply = (tokens: Tokens, found: Record<string, string>) => {
		const next = { ...tokens };
		let set = 0;
		for (const name of TOKEN_NAMES)
			if (found[name] && parseCssColor(found[name])) {
				next[name as TokenName] = found[name];
				set++;
			}
		return [next, set] as const;
	};
	const [light, lightSet] = apply(base.light, lightVars);
	const [dark, darkSet] = apply(base.dark, darkVars);
	if (lightSet + darkSet === 0) return null;
	const gradientFrom = lightVars['gradient-from'] ?? darkVars['gradient-from'];
	const gradientTo = lightVars['gradient-to'] ?? darkVars['gradient-to'];
	return {
		id: `custom-${slug(name)}`,
		name: name.trim() || 'Imported theme',
		radius: lightVars.radius ?? darkVars.radius ?? base.radius,
		light,
		// A theme with only :root has the same colors in dark mode
		dark: darkSet ? dark : light,
		...(gradientFrom && gradientTo
			? { effects: { gradient: { from: gradientFrom, to: gradientTo }, edges: true, glow: true } }
			: {}),
		chromeAccent: {
			light: cssToHex(light.primary) ?? undefined,
			dark: cssToHex((darkSet ? dark : light).primary) ?? undefined,
		},
	};
}
