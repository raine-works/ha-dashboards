import { describe, expect, it } from 'bun:test';
import { discoverThermostats } from '../climate';
import {
	houseConfig,
	parseHouseConfig,
	setHouseConfig,
	setIntegrationHouse,
	subscribeHouseConfig,
} from '../house-config';
import { findAlarmPanel } from '../security';

describe('parseHouseConfig', () => {
	it('gives a house with no settings discovery and no optional features', () => {
		expect(parseHouseConfig(undefined)).toEqual({
			announceSpeaker: undefined,
			weather: undefined,
			alarmPanel: undefined,
			thermostats: undefined,
			laundry: { washer: undefined, dryer: undefined },
			guestWifiQr: undefined,
			liveInputs: [],
			tts: { engine: undefined, voice: undefined, streaming: false, fallback: undefined },
			birthdayCalendar: undefined,
			bedtimeRoutines: {},
			modules: {},
		});
	});

	it('reads the YAML option', () => {
		const config = parseHouseConfig({
			announce_speaker: 'media_player.kitchen',
			thermostats: [{ entity: 'climate.up', name: 'Upstairs' }, 'climate.down'],
			laundry: {
				washer: { machine_state: 'sensor.w_m', job_state: 'sensor.w_j', time_remaining: 'sensor.w_t' },
			},
			tts: { engine: 'tts.piper', voice: 'amy', streaming: true },
			bedtime_routines: {
				'input_boolean.kids_bedtime': {
					zone: "Kids' Room",
					steps: [{ kind: 'lights', text: 'Turns off the lights', actions: ['light.turn_off'] }],
				},
			},
		});
		expect(config.announceSpeaker).toBe('media_player.kitchen');
		expect(config.thermostats).toEqual([
			{ entityId: 'climate.up', name: 'Upstairs' },
			{ entityId: 'climate.down', name: undefined },
		]);
		expect(config.laundry.washer).toEqual({
			name: 'Washer',
			machineState: 'sensor.w_m',
			jobState: 'sensor.w_j',
			timeRemaining: 'sensor.w_t',
		});
		expect(config.tts).toEqual({ engine: 'tts.piper', voice: 'amy', streaming: true, fallback: undefined });
		expect(config.bedtimeRoutines['input_boolean.kids_bedtime']?.steps).toHaveLength(1);
	});

	it('leaves out what is the wrong shape, never failing the dashboard', () => {
		const config = parseHouseConfig({
			announce_speaker: 'light.kitchen',
			weather: 42,
			thermostats: 'climate.one',
			laundry: { dryer: { machine_state: 'sensor.d_m' } },
			live_inputs: [{ name: 'No URI' }],
			bedtime_routines: {
				'light.not_a_toggle': { zone: 'X', steps: [] },
				'input_boolean.room_bedtime': { zone: 'Room', steps: [{ kind: 'dance', text: 'Dances' }] },
			},
		});
		expect(config.announceSpeaker).toBeUndefined();
		expect(config.weather).toBeUndefined();
		expect(config.thermostats).toBeUndefined();
		expect(config.laundry.dryer).toBeUndefined();
		expect(config.liveInputs).toEqual([]);
		expect(config.bedtimeRoutines).toEqual({ 'input_boolean.room_bedtime': { zone: 'Room', steps: [] } });
	});
});

describe('setHouseConfig', () => {
	it('tells listeners only of a real change', () => {
		let heard = 0;
		const stop = subscribeHouseConfig(() => heard++);
		setHouseConfig({ weather: 'weather.home' });
		setHouseConfig({ weather: 'weather.home' });
		expect(heard).toBe(1);
		expect(houseConfig().weather).toBe('weather.home');
		stop();
		setHouseConfig(undefined);
	});
});

describe('discovery without settings', () => {
	const states = {
		'climate.b': { entity_id: 'climate.b', attributes: { friendly_name: 'Bedroom' } },
		'climate.a': { entity_id: 'climate.a', attributes: { friendly_name: 'Attic' } },
		'climate.hidden': { entity_id: 'climate.hidden', attributes: {} },
		'alarm_control_panel.other': { entity_id: 'alarm_control_panel.other', attributes: {} },
		'alarm_control_panel.house': { entity_id: 'alarm_control_panel.house', attributes: {} },
	} as never;
	const hass = {
		entities: {
			'climate.hidden': { entity_id: 'climate.hidden', hidden: true },
			'alarm_control_panel.house': { entity_id: 'alarm_control_panel.house', platform: 'alarmo' },
		},
	} as never;

	it('shows every visible thermostat by name, or the configured ones in their order', () => {
		expect(discoverThermostats(hass, states, undefined)).toEqual([
			{ entityId: 'climate.a', name: 'Attic' },
			{ entityId: 'climate.b', name: 'Bedroom' },
		]);
		expect(discoverThermostats(hass, states, [{ entityId: 'climate.b', name: 'Upstairs' }])).toEqual([
			{ entityId: 'climate.b', name: 'Upstairs' },
		]);
	});

	it('finds the Alarmo panel first', () => {
		expect(findAlarmPanel(hass, states, undefined)).toBe('alarm_control_panel.house');
		expect(findAlarmPanel({}, states, undefined)).toBe('alarm_control_panel.house');
		expect(findAlarmPanel({ entities: {} }, { 'alarm_control_panel.z': {} }, undefined)).toBe('alarm_control_panel.z');
		expect(findAlarmPanel(hass, states, 'alarm_control_panel.other')).toBe('alarm_control_panel.other');
	});
});

describe('the house settings from both sources', () => {
	it("takes the integration's, with the card's winning key by key", () => {
		setHouseConfig(undefined);
		setIntegrationHouse({ weather: 'weather.integration', announce_speaker: 'media_player.kitchen' });
		expect(houseConfig().weather).toBe('weather.integration');
		setHouseConfig({ weather: 'weather.card' });
		expect(houseConfig().weather).toBe('weather.card');
		expect(houseConfig().announceSpeaker).toBe('media_player.kitchen');
		setIntegrationHouse(undefined);
		setHouseConfig(undefined);
		expect(houseConfig().announceSpeaker).toBeUndefined();
	});
});
