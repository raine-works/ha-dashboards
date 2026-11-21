import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import { brightnessPercent, groupMembers } from '../lighting/LightingSection';

const light = (attributes: HassEntity['attributes']): HassEntity => ({
	entity_id: 'light.master_suite',
	state: 'on',
	attributes,
	last_changed: '',
	last_updated: '',
});

describe('lighting helpers', () => {
	it('lists a light group members', () => {
		expect(groupMembers(light({ entity_id: ['light.left_lamp', 'light.right_lamp'] }))).toEqual([
			'light.left_lamp',
			'light.right_lamp',
		]);
		expect(groupMembers(light({}))).toEqual([]);
		expect(groupMembers(undefined)).toEqual([]);
	});

	it('converts brightness to a percentage', () => {
		expect(brightnessPercent(light({ brightness: 255 }))).toBe(100);
		expect(brightnessPercent(light({ brightness: 128 }))).toBe(50);
		expect(brightnessPercent(light({}))).toBe(0);
	});
});
