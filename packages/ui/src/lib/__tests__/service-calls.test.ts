import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import { describeServiceCall, serviceErrorMessage } from '../service-calls';

const entity = (entity_id: string, friendly_name: string): HassEntity => ({
	entity_id,
	state: 'on',
	attributes: { friendly_name },
	last_changed: '',
	last_updated: '',
});
const states = {
	'lock.front': entity('lock.front', 'Front Entry'),
	'light.a': entity('light.a', 'Kitchen'),
	'script.daily_brief_generate': entity('script.daily_brief_generate', 'Daily Brief: Generate'),
};

describe('describeServiceCall', () => {
	it('names the action and the entity', () => {
		expect(describeServiceCall('lock', 'lock', { entity_id: 'lock.front' }, states)).toBe("Couldn't lock Front Entry");
		expect(describeServiceCall('cover', 'close_cover', { entity_id: 'cover.west_bay' }, states)).toBe(
			"Couldn't close West bay",
		);
	});

	it('counts the other entities', () => {
		expect(describeServiceCall('light', 'turn_on', { entity_id: ['light.a', 'light.b', 'light.c'] }, states)).toBe(
			"Couldn't turn on Kitchen +2",
		);
	});

	it('runs scripts, by entity or as a service', () => {
		expect(describeServiceCall('script', 'turn_on', { entity_id: 'script.daily_brief_generate' }, states)).toBe(
			"Couldn't run Daily Brief: Generate",
		);
		expect(describeServiceCall('script', 'daily_brief_generate', {}, states)).toBe(
			"Couldn't run Daily Brief: Generate",
		);
	});

	it('falls back to the service name and a label target', () => {
		expect(describeServiceCall('light', 'turn_off', { label_id: 'household_light' })).toBe(
			"Couldn't turn off the household lights",
		);
		expect(describeServiceCall('todo', 'remove_completed_items', {})).toBe("Couldn't remove completed items");
	});
});

describe('serviceErrorMessage', () => {
	it('reads websocket errors, Errors and strings', () => {
		expect(serviceErrorMessage({ code: 'home_assistant_error', message: 'Lock jammed' })).toBe('Lock jammed');
		expect(serviceErrorMessage(new Error('Timeout'))).toBe('Timeout');
		expect(serviceErrorMessage('Nope')).toBe('Nope');
		expect(serviceErrorMessage({ error: { message: 'Inner' } })).toBe('Inner');
		expect(serviceErrorMessage(undefined)).toBeUndefined();
		expect(serviceErrorMessage({})).toBeUndefined();
	});
});
