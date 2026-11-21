import { describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import { batteryTone, discoverWindowCovers, estimatePosition, FULL_TRAVEL_MS, lowestBattery } from '../covers';

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
	entity_id,
	state,
	attributes,
	last_changed: '',
	last_updated: '',
});

const states = Object.fromEntries(
	[
		entity('cover.master_suite_curtains', 'closed', {
			friendly_name: 'Master Suite Curtains',
			device_class: 'curtain',
			entity_id: ['cover.left_robot', 'cover.right_robot'],
		}),
		entity('cover.left_robot', 'closed', { friendly_name: 'Left', device_class: 'curtain' }),
		entity('cover.right_robot', 'closed', { friendly_name: 'Right', device_class: 'curtain' }),
		entity('cover.office_blind', 'open', { friendly_name: 'Office Blind', device_class: 'blind' }),
		entity('cover.garage', 'closed', { friendly_name: 'Garage', device_class: 'garage' }),
		entity('cover.hidden_shade', 'open', { friendly_name: 'Hidden', device_class: 'shade' }),
		entity('sensor.left_robot_battery', '24.0'),
		entity('sensor.right_robot_battery', '28'),
		entity('sensor.office_blind_battery', 'unavailable'),
	].map((s) => [s.entity_id, s]),
);

const hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'> = {
	entities: {
		'cover.master_suite_curtains': { entity_id: 'cover.master_suite_curtains', area_id: 'bedroom' },
		'cover.office_blind': { entity_id: 'cover.office_blind', area_id: 'office' },
		'cover.hidden_shade': { entity_id: 'cover.hidden_shade', hidden: true },
	},
	devices: {},
	areas: {
		bedroom: { area_id: 'bedroom', name: 'Master Suite' },
		office: { area_id: 'office', name: 'Office' },
	},
};

describe('discoverWindowCovers', () => {
	it('lists window covers by area, a group standing for its motors', () => {
		expect(discoverWindowCovers(hass, states)).toEqual([
			{
				entityId: 'cover.master_suite_curtains',
				name: 'Master Suite Curtains',
				kind: 'curtain',
				area: 'Master Suite',
				motors: ['cover.left_robot', 'cover.right_robot'],
			},
			{
				entityId: 'cover.office_blind',
				name: 'Office Blind',
				kind: 'blind',
				area: 'Office',
				motors: ['cover.office_blind'],
			},
		]);
	});
});

describe('lowestBattery', () => {
	it("reads the motors' battery sensors", () => {
		expect(lowestBattery({ motors: ['cover.left_robot', 'cover.right_robot'] }, states)).toBe(24);
		expect(lowestBattery({ motors: ['cover.office_blind'] }, states)).toBeUndefined();
	});

	it('tones low batteries', () => {
		expect(batteryTone(24)).toBe('normal');
		expect(batteryTone(20)).toBe('warning');
		expect(batteryTone(9)).toBe('destructive');
	});
});

describe('estimatePosition', () => {
	it("moves at a full travel's pace from where the cover was", () => {
		const opening = { from: 0, to: 100, startedAt: 1000 };
		expect(estimatePosition(opening, 1000)).toBe(0);
		expect(estimatePosition(opening, 1000 + FULL_TRAVEL_MS / 2)).toBe(50);
		const closing = { from: 80, to: 0, startedAt: 0 };
		expect(estimatePosition(closing, FULL_TRAVEL_MS / 4)).toBe(55);
	});

	it('stops at the target, and never runs backwards in time', () => {
		expect(estimatePosition({ from: 20, to: 60, startedAt: 0 }, FULL_TRAVEL_MS)).toBe(60);
		expect(estimatePosition({ from: 20, to: 60, startedAt: 5000 }, 0)).toBe(20);
	});
});
