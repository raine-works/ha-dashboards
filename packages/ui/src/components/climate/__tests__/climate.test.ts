import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../../types/homeassistant';
import { formatStatus, formatTarget, formatZoneLine, presetChoices, targetOf } from '../ClimateSection';

const climate = (state: string, attributes: HassEntity['attributes']): HassEntity => ({
	entity_id: 'climate.test',
	state,
	attributes,
	last_changed: '',
	last_updated: '',
});

describe('ClimateSection formatters', () => {
	it('shows the dual setpoint range in heat_cool mode', () => {
		expect(formatTarget(climate('heat_cool', { temperature: null, target_temp_low: 67, target_temp_high: 74 }))).toBe(
			'67°–74°',
		);
	});

	it('shows the single setpoint in heat or cool mode', () => {
		expect(formatTarget(climate('heat', { temperature: 69.6 }))).toBe('70°');
	});

	it('shows Off when the zone is off and -- when no setpoint is known', () => {
		expect(formatTarget(climate('off', { temperature: 70 }))).toBe('Off');
		expect(formatTarget(climate('cool', { temperature: null }))).toBe('--');
	});

	it('gives the stepper whole degrees to roll between', () => {
		expect(targetOf(climate('heat', { temperature: 69.6 }))).toEqual({ kind: 'single', value: 70 });
		expect(targetOf(climate('heat_cool', { target_temp_low: 66.5, target_temp_high: 74.2 }))).toEqual({
			kind: 'range',
			low: 67,
			high: 74,
		});
		// Auto without both ends falls back to the one setpoint it reports
		expect(targetOf(climate('heat_cool', { temperature: 71, target_temp_low: 66 }))).toEqual({
			kind: 'single',
			value: 71,
		});
		expect(targetOf(climate('off', { temperature: 70 }))).toEqual({ kind: 'off' });
		expect(targetOf(climate('cool', {}))).toEqual({ kind: 'none' });
	});

	it('summarizes current temperature, humidity and activity', () => {
		expect(
			formatStatus(climate('heat_cool', { current_temperature: 72, current_humidity: 43, hvac_action: 'heating' })),
		).toBe('72° inside · 43% · Heating');
		expect(formatStatus(climate('off', { current_temperature: 71, hvac_action: 'off' }))).toBe('71° inside');
	});
});

describe('formatZoneLine', () => {
	it('leads with the mode, then what the thermostat reports', () => {
		expect(formatZoneLine(climate('heat', { current_temperature: 69, hvac_action: 'heating' }))).toBe(
			'Heat · 69° inside · Heating',
		);
		expect(formatZoneLine(climate('heat_cool', { current_temperature: 71, hvac_action: 'idle' }))).toBe(
			'Auto · 71° inside · Idle',
		);
		expect(formatZoneLine(climate('off', { current_temperature: 71, hvac_action: 'off' }))).toBe('Off · 71° inside');
	});

	it('names a mode it does not know by itself', () => {
		expect(formatZoneLine(climate('fan_only', {}))).toBe('Fan only');
	});
});

describe('presetChoices', () => {
	it('offers every preset but Override, which is only shown', () => {
		expect(presetChoices(['home', 'away', 'sleep', 'override'])).toEqual(['home', 'away', 'sleep']);
		expect(presetChoices(undefined)).toEqual(['home', 'away', 'sleep']);
	});
});
