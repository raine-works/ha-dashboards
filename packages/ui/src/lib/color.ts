/** Convert a Home Assistant hs_color (hue 0-360, saturation 0-100) to RGB at full value. */
export function hsToRgb(h: number, s: number): [number, number, number] {
	// 360 is 0 again (the hue slider's end), and a negative hue wraps the same way
	h = ((h % 360) + 360) % 360;
	s = s / 100;
	const v = 1;
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	let [r1, g1, b1] = [0, 0, 0];

	if (h >= 0 && h < 60) [r1, g1, b1] = [c, x, 0];
	else if (h >= 60 && h < 120) [r1, g1, b1] = [x, c, 0];
	else if (h >= 120 && h < 180) [r1, g1, b1] = [0, c, x];
	else if (h >= 180 && h < 240) [r1, g1, b1] = [0, x, c];
	else if (h >= 240 && h < 300) [r1, g1, b1] = [x, 0, c];
	else if (h >= 300 && h < 360) [r1, g1, b1] = [c, 0, x];

	return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

/** Approximate RGB of white light at a color temperature (Tanner Helland's fit, 1000–40000 K). */
export function kelvinToRgb(kelvin: number): [number, number, number] {
	const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
	const clamp = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
	const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
	const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
	const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
	return [clamp(r), clamp(g), clamp(b)];
}
