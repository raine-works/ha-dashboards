import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../../types/homeassistant';
import { formatStatus, formatTarget, presetChoices } from '../ClimateSection';

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

	it('summarizes current temperature, humidity and activity', () => {
		expect(
			formatStatus(climate('heat_cool', { current_temperature: 72, current_humidity: 43, hvac_action: 'heating' })),
		).toBe('72° inside · 43% · Heating');
		expect(formatStatus(climate('off', { current_temperature: 71, hvac_action: 'off' }))).toBe('71° inside');
	});
});

describe('presetChoices', () => {
	it('offers every preset but Override, which is only shown', () => {
		expect(presetChoices(['home', 'away', 'sleep', 'override'])).toEqual(['home', 'away', 'sleep']);
		expect(presetChoices(undefined)).toEqual(['home', 'away', 'sleep']);
	});
});
