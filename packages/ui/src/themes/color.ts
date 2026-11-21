// Color math for the themes: CSS colors (oklch, hex, rgb) to OKLCH and back to sRGB hex, which
// Home Assistant's Companion apps need (Android parses only hex and comma rgb()). OKLab is Björn
// Ottosson's.

export interface Oklch {
	l: number;
	c: number;
	h: number;
}

/** `#855317` → [r, g, b] (0–255); null for anything else (unavailable, unknown). */
export function parseHex(value: string | undefined): [number, number, number] | null {
	const m = /^#?([0-9a-f]{6})$/i.exec(value?.trim() ?? '');
	if (!m) return null;
	const n = Number.parseInt(m[1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toLinear = (v: number) => {
	const c = v / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

/** sRGB → OKLCH (Björn Ottosson's OKLab). */
export function rgbToOklch([r8, g8, b8]: [number, number, number]): Oklch {
	const [r, g, b] = [toLinear(r8), toLinear(g8), toLinear(b8)];
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	const h = (Math.atan2(B, A) * 180) / Math.PI;
	return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

/** OKLCH → sRGB channels (0–255), unclamped: outside 0–255 means out of gamut. */
function oklchToRgbRaw({ l: L, c, h }: Oklch): [number, number, number] {
	const A = c * Math.cos((h * Math.PI) / 180);
	const B = c * Math.sin((h * Math.PI) / 180);
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	return [
		fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.5 && v <= 255.5);

/** The color at this lightness and hue with as much of the chroma as sRGB can show. */
export function fitGamut(color: Oklch): Oklch {
	if (inGamut(oklchToRgbRaw(color))) return color;
	let [lo, hi] = [0, color.c];
	for (let i = 0; i < 20; i++) {
		const mid = (lo + hi) / 2;
		if (inGamut(oklchToRgbRaw({ ...color, c: mid }))) lo = mid;
		else hi = mid;
	}
	return { ...color, c: lo };
}

export const toRgb = (color: Oklch): [number, number, number] =>
	oklchToRgbRaw(fitGamut(color)).map((v) => Math.min(255, Math.max(0, Math.round(v)))) as [number, number, number];

export const toHex = (color: Oklch) =>
	`#${toRgb(color)
		.map((v) => v.toString(16).padStart(2, '0'))
		.join('')}`;

/** A CSS color with its alpha (0–1). */
export interface ParsedColor {
	color: Oklch;
	alpha: number;
}

const percentOr = (v: string, scale = 1) =>
	v.endsWith('%') ? Number.parseFloat(v) / 100 : Number.parseFloat(v) * scale;

/**
 * `oklch(0.145 0 0)`, `oklch(1 0 0 / 10%)`, `#0a0a0a`, `#0a0a0a80`, `rgb(10, 10, 10)` or
 * `rgba(255, 255, 255, 0.1)` as OKLCH with alpha; null for anything else (a var(), a gradient).
 */
export function parseCssColor(value: string): ParsedColor | null {
	const v = value.trim().toLowerCase();
	const ok = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(v);
	if (ok) {
		const l = ok[1].endsWith('%') ? Number.parseFloat(ok[1]) / 100 : Number.parseFloat(ok[1]);
		return {
			color: { l, c: Number.parseFloat(ok[2]), h: Number.parseFloat(ok[3]) },
			alpha: ok[4] ? percentOr(ok[4]) : 1,
		};
	}
	const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
	if (hex) {
		const rgb = parseHex(`#${hex[1]}`);
		return rgb ? { color: rgbToOklch(rgb), alpha: hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1 } : null;
	}
	const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(v);
	if (rgb)
		return {
			color: rgbToOklch([Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]),
			alpha: rgb[4] ? percentOr(rgb[4]) : 1,
		};
	return null;
}

/** OKLCH as CSS, rounded the way the themes write it. */
export const oklchCss = ({ l, c, h }: Oklch, alpha = 1) =>
	`oklch(${+l.toFixed(3)} ${+c.toFixed(3)} ${+h.toFixed(3)}${alpha < 1 ? ` / ${Math.round(alpha * 100)}%` : ''})`;

/** A CSS color as an opaque hex over `backdrop` (for a translucent one, the color it shows as). */
export function cssToHex(value: string, backdrop = '#000000'): string | null {
	const parsed = parseCssColor(value);
	if (!parsed) return null;
	if (parsed.alpha >= 1) return toHex(parsed.color);
	const [r, g, b] = toRgb(parsed.color);
	const under = parseHex(backdrop) ?? [0, 0, 0];
	const mix = [r, g, b].map((v, i) => Math.round(v * parsed.alpha + (under[i] ?? 0) * (1 - parsed.alpha)));
	return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** `#0a0a0a` → `10, 10, 10`: Home Assistant's `--rgb-*` variables. */
export function hexToRgbList(hex: string): string {
	return (parseHex(hex) ?? [0, 0, 0]).join(', ');
}

/** Set `vars` on `el`, removing the ones it set last time that `vars` no longer has; returns what's set. */
export function applyVars(el: HTMLElement, vars: Record<string, string>, previous: Record<string, string>) {
	for (const name of Object.keys(previous)) if (!(name in vars)) el.style.removeProperty(name);
	for (const [name, value] of Object.entries(vars))
		if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
	return vars;
}

/** `a` mixed into `b` by `amount` (0–1), in OKLab like CSS's color-mix(in oklab, …), as hex. */
export function mixHex(a: string, b: string, amount: number): string {
	const ca = parseCssColor(a)?.color;
	const cb = parseCssColor(b)?.color;
	if (!ca || !cb) return a;
	const lab = (c: Oklch) => [c.l, c.c * Math.cos((c.h * Math.PI) / 180), c.c * Math.sin((c.h * Math.PI) / 180)];
	const [l1, a1, b1] = lab(ca) as [number, number, number];
	const [l2, a2, b2] = lab(cb) as [number, number, number];
	const [l, A, B] = [l1 * amount + l2 * (1 - amount), a1 * amount + a2 * (1 - amount), b1 * amount + b2 * (1 - amount)];
	const h = (Math.atan2(B, A) * 180) / Math.PI;
	return toHex({ l, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h });
}

/** A color at `alpha` as rgba() (Home Assistant's shadows and borders). */
export function withAlpha(color: string, alpha: number): string {
	const parsed = parseCssColor(color);
	return parsed ? `rgba(${hexToRgbList(toHex(parsed.color))}, ${alpha})` : color;
}
