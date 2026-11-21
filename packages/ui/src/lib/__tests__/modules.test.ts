import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import { stepSetpoint } from '../climate';
import { parseHouseConfig } from '../house-config';
import { isModuleId, MODULES, type ModuleContext, moduleReport, moduleState } from '../modules';

const entity = (entity_id: string, attributes: Record<string, unknown> = {}, state = 'on') =>
	({ entity_id, state, attributes, last_changed: '', last_updated: '' }) as HassEntity;

/** A house with a few things: Music Assistant, a camera, a thermostat, Alarmo. */
function ctx(extra: Partial<ModuleContext['hass']> = {}, house: unknown = {}): ModuleContext {
	const states = {
		'media_player.kitchen': entity('media_player.kitchen', { mass_player_type: 'player' }, 'idle'),
		'camera.porch': entity('camera.porch'),
		'climate.hall': entity('climate.hall', {}, 'heat'),
		'alarm_control_panel.house': entity('alarm_control_panel.house', {}, 'disarmed'),
		'weather.home': entity('weather.home', {}, 'sunny'),
	};
	return {
		hass: {
			states,
			entities: { 'alarm_control_panel.house': { entity_id: 'alarm_control_panel.house', platform: 'alarmo' } },
			services: { alarmo: { arm: {} } },
			config: { components: ['assist_pipeline'] },
			...extra,
		},
		house: parseHouseConfig(house),
	};
}

describe('dashboard modules', () => {
	it('have unique ids, and say what they need', () => {
		expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
		for (const m of MODULES) expect(m.needs.length, m.id).toBeGreaterThan(5);
	});

	it('are on when this house has what they need, missing otherwise', () => {
		const states = Object.fromEntries(moduleReport(ctx()).map((row) => [row.id, row.state]));
		expect(states).toMatchObject({
			music: 'on',
			messages: 'on',
			cameras: 'on',
			climate: 'on',
			alarm: 'on',
			weather: 'on',
			assist: 'on',
			// Found as they're shown, or part of Home Assistant
			energy: 'on',
			notifications: 'on',
			holidays: 'on',
			todo: 'missing',
			thermostat_presets: 'missing',
			daily: 'missing',
			laundry: 'missing',
			guest_wifi: 'missing',
			pets: 'missing',
		});
	});

	it('need Alarmo for the alarm (the keypad arms through alarmo.arm)', () => {
		expect(moduleState('alarm', ctx({ services: {} }))).toBe('missing');
	});

	it('need the assist pipeline for Assist', () => {
		expect(moduleState('assist', ctx({ config: { components: ['light'] } }))).toBe('missing');
	});

	it('are turned off in the house settings', () => {
		expect(moduleState('holidays', ctx({}, { modules: { holidays: false } }))).toBe('off');
		expect(moduleState('music', ctx({}, { modules: { music: false, cameras: 'no' } }))).toBe('off');
		expect(moduleState('cameras', ctx({}, { modules: { cameras: 'no' } }))).toBe('on');
	});

	it('find the laundry and guest Wi-Fi from the house settings', () => {
		const house = {
			laundry: { washer: { machine_state: 'sensor.w', job_state: 'sensor.j', time_remaining: 'sensor.t' } },
			guest_wifi_qr: 'image.guest',
		};
		const states = { ...ctx().hass.states, 'sensor.w': entity('sensor.w'), 'image.guest': entity('image.guest') };
		expect(moduleState('laundry', ctx({ states }, house))).toBe('on');
		expect(moduleState('guest_wifi', ctx({ states }, house))).toBe('on');
		expect(moduleState('laundry', ctx({}, house))).toBe('missing');
	});

	it('know their own ids', () => {
		expect(isModuleId('music')).toBe(true);
		expect(isModuleId('jukebox')).toBe(false);
	});
});

describe('stepSetpoint', () => {
	it('steps one setpoint in Heat or Cool, within the limits', () => {
		expect(stepSetpoint(entity('climate.a', { temperature: 70 }, 'heat'), 1)).toEqual({ temperature: 71 });
		expect(stepSetpoint(entity('climate.a', { temperature: 90, max_temp: 90 }, 'cool'), 1)).toEqual({
			temperature: 90,
		});
	});

	it('moves the Auto range together, keeping its gap at the edges', () => {
		const auto = (low: number, high: number) =>
			entity('climate.a', { target_temp_low: low, target_temp_high: high, min_temp: 50, max_temp: 90 }, 'heat_cool');
		expect(stepSetpoint(auto(66, 74), -1)).toEqual({ target_temp_low: 65, target_temp_high: 73 });
		expect(stepSetpoint(auto(82, 90), 1)).toEqual({ target_temp_low: 82, target_temp_high: 90 });
	});

	it('does nothing while off', () => {
		expect(stepSetpoint(entity('climate.a', { temperature: 70 }, 'off'), 1)).toBeNull();
		expect(stepSetpoint(undefined, 1)).toBeNull();
	});
});
