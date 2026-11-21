import type { HassEntity, HassEntityRegistryEntry } from '../types/homeassistant';

/**
 * The signed-in person's phone accent color (Material You), from the Android Companion app's
 * Dynamic Color sensor (`sensor.<phone>_accent_color`, a hex state), turned into the accent tokens
 * of the dashboards and of Home Assistant's own chrome. Without one, nothing changes.
 */

export interface Oklch {
	l: number;
	c: number;
	h: number;
}

const ACCENT_SENSOR = /^sensor\..+_accent_color$/;

/**
 * The accent sensor of the person signed in as `userId`: on the device behind one of their device
 * trackers (the phone the Companion app registered). Undefined for an account
 * that isn't a person with a tracker (the wall panels' ROAMiQ user, the admin).
 */
export function accentSensorFor(
	states: Record<string, HassEntity>,
	entities: Record<string, HassEntityRegistryEntry> | undefined,
	userId: string | undefined,
): string | undefined {
	if (!userId || !entities) return undefined;
	const person = Object.values(states).find(
		(s) => s.entity_id.startsWith('person.') && s.attributes.user_id === userId,
	);
	const trackers = person?.attributes.device_trackers;
	if (!Array.isArray(trackers)) return undefined;
	const devices = new Set(trackers.map((t) => entities[t as string]?.device_id).filter(Boolean));
	if (devices.size === 0) return undefined;
	// Whatever its state now: it's read on every update, and may only be unavailable for a moment
	return Object.values(entities).find((e) => ACCENT_SENSOR.test(e.entity_id) && devices.has(e.device_id))?.entity_id;
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

const css = ({ l, c, h }: Oklch) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;

/** The accent's tones, Material-style: light on dark, dark on light, so text on it stays readable. */
export function accentTones(seed: Oklch, dark: boolean) {
	// Strong enough to read as the phone's color, never neon; a gray seed (Monochrome) stays gray
	const c = Math.min(seed.c, 0.16);
	const tone = (l: number, chroma = c) => fitGamut({ l, c: chroma, h: seed.h });
	return dark
		? { accent: tone(0.82), onAccent: tone(0.24, Math.min(c, 0.05)), ring: tone(0.62) }
		: { accent: tone(0.48), onAccent: tone(0.985, Math.min(c, 0.01)), ring: tone(0.62) };
}

/** The dashboards' shadcn tokens (on the card's mount point, over `theme.css`'s neutral ones). */
export function accentPanelTokens(seed: Oklch, dark: boolean): Record<string, string> {
	const { accent, onAccent, ring } = accentTones(seed, dark);
	return {
		'--primary': css(accent),
		'--primary-foreground': css(onAccent),
		'--ring': css(ring),
		'--sidebar-primary': css(accent),
		'--sidebar-primary-foreground': css(onAccent),
		'--sidebar-ring': css(ring),
	};
}

/**
 * Home Assistant's own accent variables (Blackout's amber and white primary): buttons, links,
 * switches, sliders and the sidebar's selected item. Hex and `r, g, b` (HA builds `rgba()` from the
 * `rgb-` ones). Surfaces, text and the hex colors the Companion apps read stay Blackout's.
 */
export function accentChromeVars(seed: Oklch, dark: boolean): Record<string, string> {
	const { accent, onAccent } = accentTones(seed, dark);
	const hex = toHex(accent);
	const rgb = toRgb(accent).join(', ');
	return {
		'--primary-color': hex,
		'--rgb-primary-color': rgb,
		'--accent-color': hex,
		'--rgb-accent-color': rgb,
		'--text-accent-color': hex,
		'--text-primary-color': toHex(onAccent),
		'--mdc-theme-primary': hex,
		'--sidebar-selected-icon-color': hex,
		'--sidebar-selected-text-color': hex,
		'--switch-checked-track-color': hex,
		'--paper-slider-active-color': hex,
		'--paper-slider-pin-color': hex,
	};
}

/** Set `vars` on `el`, removing the ones it set last time that `vars` no longer has; returns what's set. */
export function applyVars(el: HTMLElement, vars: Record<string, string>, previous: Record<string, string>) {
	for (const name of Object.keys(previous)) if (!(name in vars)) el.style.removeProperty(name);
	// Re-set whatever differs, also after Home Assistant re-applied its theme over ours
	for (const [name, value] of Object.entries(vars))
		if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
	return vars;
}
