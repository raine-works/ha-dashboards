import { describe, expect, it } from 'bun:test';
import type { HassEntity, HassEntityRegistryEntry } from '../../types/homeassistant';
import {
	accentChromeVars,
	accentPanelTokens,
	accentSensorFor,
	accentTones,
	parseHex,
	rgbToOklch,
	toHex,
	toRgb,
} from '../accent';

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity =>
	({ entity_id, state, attributes, last_changed: '', last_updated: '' }) as HassEntity;
const reg = (entity_id: string, device_id: string) => ({ entity_id, device_id }) as HassEntityRegistryEntry;

describe('accentSensorFor', () => {
	const states = {
		'person.robin': entity('person.robin', 'home', {
			user_id: 'u1',
			device_trackers: ['device_tracker.robin_s_phone'],
		}),
		'person.cat': entity('person.cat', 'unknown', { device_trackers: [] }),
		'sensor.robin_s_phone_accent_color': entity('sensor.robin_s_phone_accent_color', '#855317'),
		'sensor.other_phone_accent_color': entity('sensor.other_phone_accent_color', '#123456'),
	};
	const entities = {
		'device_tracker.robin_s_phone': reg('device_tracker.robin_s_phone', 'phone1'),
		'sensor.robin_s_phone_battery_level': reg('sensor.robin_s_phone_battery_level', 'phone1'),
		'sensor.robin_s_phone_accent_color': reg('sensor.robin_s_phone_accent_color', 'phone1'),
		'sensor.other_phone_accent_color': reg('sensor.other_phone_accent_color', 'phone2'),
	};

	it("finds the signed-in person's phone accent sensor through their tracker's device", () => {
		expect(accentSensorFor(states, entities, 'u1')).toBe('sensor.robin_s_phone_accent_color');
	});

	it('has none for an account that is no tracked person (the wall panels, the admin)', () => {
		expect(accentSensorFor(states, entities, 'roamiq')).toBeUndefined();
		expect(accentSensorFor(states, entities, undefined)).toBeUndefined();
		expect(accentSensorFor(states, undefined, 'u1')).toBeUndefined();
	});
});

describe('parseHex', () => {
	it('reads the sensor state, nothing else', () => {
		expect(parseHex('#855317')).toEqual([133, 83, 23]);
		expect(parseHex('855317')).toEqual([133, 83, 23]);
		expect(parseHex('unavailable')).toBeNull();
		expect(parseHex(undefined)).toBeNull();
	});
});

describe('OKLCH', () => {
	it('round-trips sRGB', () => {
		for (const hex of ['#855317', '#3366cc', '#ffffff', '#000000', '#22c55e']) {
			const rgb = parseHex(hex) as [number, number, number];
			expect(toHex(rgbToOklch(rgb))).toBe(hex);
		}
	});

	it('matches known values', () => {
		const white = rgbToOklch([255, 255, 255]);
		expect(white.l).toBeCloseTo(1, 3);
		expect(white.c).toBeCloseTo(0, 3);
	});

	it('pulls a color sRGB cannot show back into gamut, keeping its lightness and hue', () => {
		const rgb = toRgb({ l: 0.82, c: 0.4, h: 140 });
		expect(rgb.every((v) => v >= 0 && v <= 255)).toBe(true);
		expect(rgbToOklch(rgb).l).toBeCloseTo(0.82, 1);
	});
});

describe('accent tones', () => {
	const seed = rgbToOklch([133, 83, 23]);

	it('keeps the hue, light on dark and dark on light', () => {
		const dark = accentTones(seed, true);
		const light = accentTones(seed, false);
		expect(dark.accent.l).toBeCloseTo(0.82, 2);
		expect(light.accent.l).toBeCloseTo(0.48, 2);
		expect(dark.accent.h).toBeCloseTo(seed.h, 1);
		expect(dark.onAccent.l).toBeLessThan(0.3);
		expect(light.onAccent.l).toBeGreaterThan(0.95);
	});

	it('keeps a gray seed gray (the Monochrome style)', () => {
		expect(accentTones(rgbToOklch([128, 128, 128]), true).accent.c).toBeLessThan(0.001);
	});

	it("sets the dashboards' primary tokens and Home Assistant's accent variables", () => {
		expect(Object.keys(accentPanelTokens(seed, true))).toContain('--primary');
		const chrome = accentChromeVars(seed, true);
		expect(chrome['--primary-color']).toMatch(/^#[0-9a-f]{6}$/);
		expect(chrome['--rgb-primary-color']).toMatch(/^\d+, \d+, \d+$/);
		// The Companion apps read these from the theme: never touched
		expect(chrome).not.toHaveProperty('--app-header-background-color');
		expect(chrome).not.toHaveProperty('--primary-background-color');
	});
});
