import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	alarmEvents,
	alertsWatch,
	cameraForDoorbell,
	discoverAlarmPanels,
	discoverDoorbells,
	discoverOpenings,
	endedAlarms,
	newlyOpened,
	newRings,
	openingsWatch,
	RECENT_EVENT_MS,
	serverNow,
} from '../alerts';
import type { CameraDevice } from '../cameras';

const entity = (
	entity_id: string,
	state: string,
	attributes: HassEntity['attributes'],
	last_changed = '2026-10-18T07:00:00Z',
): HassEntity => ({ entity_id, state, attributes, last_changed, last_updated: last_changed });

const toStates = (...entities: HassEntity[]) => Object.fromEntries(entities.map((e) => [e.entity_id, e]));

// Home Assistant's time in these tests: just after the states' default last_changed
const NOW = Date.parse('2026-10-18T07:00:10Z');
const HOURS_LATER = NOW + 3 * 60 * 60 * 1000;

describe('discoverOpenings', () => {
	it('marks covers that can close (garage doors) and ones closing', () => {
		const [garage, contact] = discoverOpenings(
			toStates(
				entity('cover.garage_north', 'closing', {
					device_class: 'garage',
					supported_features: 15,
					friendly_name: 'A Garage',
				}),
				entity('binary_sensor.front', 'on', { device_class: 'door', friendly_name: 'B Front' }),
			),
		);
		expect(garage).toMatchObject({ closable: true, isClosing: true, isOpen: false });
		expect(contact).toMatchObject({ closable: false, isClosing: false, isOpen: true });
		const [noClose] = discoverOpenings(
			toStates(entity('cover.gate', 'open', { device_class: 'gate', supported_features: 1 })),
		);
		expect(noClose.closable).toBe(false);
	});

	it('finds doors, windows and garage doors and tidies names', () => {
		const openings = discoverOpenings(
			toStates(
				entity('binary_sensor.foyer_front_entry_contact', 'on', {
					device_class: 'door',
					friendly_name: 'Front Entry Contact',
				}),
				entity('binary_sensor.garage_window_1_contact', 'off', {
					device_class: 'window',
					friendly_name: 'Window 1 Contact',
				}),
				entity('cover.garage_west_bay_garage_door', 'opening', {
					device_class: 'garage',
					friendly_name: 'West Bay Garage Door',
				}),
				entity('binary_sensor.doorbell_motion', 'on', { device_class: 'motion', friendly_name: 'Motion' }),
				entity('binary_sensor.back_contact', 'unavailable', { device_class: 'door', friendly_name: 'Back' }),
			),
		);
		expect(openings.map((o) => [o.name, o.kind, o.isOpen, o.available])).toEqual([
			['Back', 'door', false, false],
			['Front Entry', 'door', true, true],
			['West Bay Garage Door', 'garage', true, true],
			['Window 1', 'window', false, true],
		]);
	});

	it('reads only binary sensors and covers, whatever device class another entity has', () => {
		const openings = discoverOpenings(
			toStates(
				entity('sensor.front_door', 'on', { device_class: 'door' }),
				entity('switch.garage_door', 'on', { device_class: 'garage' }),
				entity('binary_sensor.side_door', 'on', { device_class: 'door', friendly_name: 'Side Door' }),
			),
		);
		expect(openings.map((o) => o.entityId)).toEqual(['binary_sensor.side_door']);
	});
});

describe('newlyOpened', () => {
	const door = (state: string) =>
		discoverOpenings(toStates(entity('binary_sensor.front', state, { device_class: 'door', friendly_name: 'Front' })));

	it('reports closed → open transitions only', () => {
		expect(newlyOpened(door('off'), door('on'), NOW).map((o) => o.name)).toEqual(['Front']);
		expect(newlyOpened(door('on'), door('on'), NOW)).toEqual([]);
		expect(newlyOpened(door('on'), door('off'), NOW)).toEqual([]);
	});

	it('ignores first sightings and recovery from unavailable', () => {
		expect(newlyOpened(undefined, door('on'), NOW)).toEqual([]);
		expect(newlyOpened(door('unavailable'), door('on'), NOW)).toEqual([]);
	});

	it('ignores a door that opened before the page slept', () => {
		expect(newlyOpened(door('off'), door('on'), HOURS_LATER)).toEqual([]);
	});
});

describe('doorbell rings', () => {
	const RING_NOW = Date.parse('2026-10-18T07:05:02Z');
	const bell = (state: string) =>
		discoverDoorbells(
			toStates(
				entity('event.front_porch_doorbell_doorbell', state, {
					device_class: 'doorbell',
					event_types: ['ring'],
					event_type: 'ring',
				}),
				entity('event.some_button', '2026-10-18T07:00:00Z', { event_types: ['press'] }),
			),
		);

	it('discovers doorbell event entities', () => {
		expect(bell('unknown').map((d) => d.entityId)).toEqual(['event.front_porch_doorbell_doorbell']);
	});

	it('detects a new ring, not the first sighting or unavailability', () => {
		expect(newRings(bell('unknown'), bell('2026-10-18T07:05:00Z'), RING_NOW)).toHaveLength(1);
		expect(newRings(bell('2026-10-18T07:05:00Z'), bell('2026-10-18T07:05:00Z'), RING_NOW)).toEqual([]);
		expect(newRings(undefined, bell('2026-10-18T07:05:00Z'), RING_NOW)).toEqual([]);
		expect(newRings(bell('2026-10-18T07:05:00Z'), bell('unavailable'), RING_NOW)).toEqual([]);
	});

	it('ignores a ring from before the page slept', () => {
		const later = Date.parse('2026-10-18T07:05:00Z') + RECENT_EVENT_MS + 1;
		expect(newRings(bell('unknown'), bell('2026-10-18T07:05:00Z'), later)).toEqual([]);
	});

	it('pairs the doorbell with its camera by entity prefix', () => {
		const cam = (id: string): CameraDevice => ({ id, label: id, entityId: `camera.${id}`, available: true });
		expect(
			cameraForDoorbell('event.front_porch_doorbell_doorbell', [
				cam('living_room_living_room'),
				cam('front_porch_doorbell'),
			])?.id,
		).toBe('front_porch_doorbell');
		expect(cameraForDoorbell('event.side_door_doorbell', [cam('living_room_living_room')])).toBeUndefined();
	});
});

describe('alarm events', () => {
	const panel = (state: string, attributes: HassEntity['attributes'] = {}) =>
		discoverAlarmPanels(
			toStates(entity('alarm_control_panel.alarmo', state, { friendly_name: 'Alarmo', ...attributes })),
		);

	it('maps alarm state changes to event kinds', () => {
		expect(alarmEvents(panel('disarmed'), panel('arming', { arm_mode: 'armed_away' }), NOW)).toEqual([
			expect.objectContaining({ kind: 'arming', modeLabel: 'Away' }),
		]);
		expect(alarmEvents(panel('arming'), panel('armed_away'), NOW)[0]).toMatchObject({
			kind: 'armed',
			modeLabel: 'Away',
		});
		expect(alarmEvents(panel('armed_home'), panel('pending'), NOW)[0].kind).toBe('pending');
		expect(alarmEvents(panel('pending'), panel('triggered'), NOW)[0].kind).toBe('triggered');
		expect(alarmEvents(panel('triggered'), panel('disarmed'), NOW)[0].kind).toBe('disarmed');
	});

	it('ignores first sightings, unchanged states and unavailability', () => {
		expect(alarmEvents(undefined, panel('triggered'), NOW)).toEqual([]);
		expect(alarmEvents(panel('armed_away'), panel('armed_away'), NOW)).toEqual([]);
		expect(alarmEvents(panel('unavailable'), panel('armed_away'), NOW)).toEqual([]);
		expect(alarmEvents(panel('armed_away'), panel('unavailable'), NOW)).toEqual([]);
	});

	it('skips arming, armed and disarmed from before the page slept, never a running alarm', () => {
		expect(alarmEvents(panel('disarmed'), panel('armed_away'), HOURS_LATER)).toEqual([]);
		expect(alarmEvents(panel('armed_away'), panel('disarmed'), HOURS_LATER)).toEqual([]);
		expect(alarmEvents(panel('armed_away'), panel('triggered'), HOURS_LATER)[0].kind).toBe('triggered');
		expect(alarmEvents(panel('armed_away'), panel('pending'), HOURS_LATER)[0].kind).toBe('pending');
	});

	it('names panels that left a triggered alarm or entry delay, whatever they went to', () => {
		expect(endedAlarms(panel('triggered'), panel('disarmed'))).toEqual(['alarm_control_panel.alarmo']);
		expect(endedAlarms(panel('pending'), panel('unavailable'))).toEqual(['alarm_control_panel.alarmo']);
		expect(endedAlarms(panel('pending'), panel('triggered'))).toEqual([]);
		expect(endedAlarms(panel('armed_away'), panel('disarmed'))).toEqual([]);
		expect(endedAlarms(undefined, panel('disarmed'))).toEqual([]);
	});
});

describe('alertsWatch', () => {
	const states = toStates(
		entity('binary_sensor.front_door', 'off', { device_class: 'door' }),
		entity('binary_sensor.hall_motion', 'on', { device_class: 'motion' }),
		entity('cover.garage', 'closed', { device_class: 'garage' }),
		entity('cover.curtains', 'open', { device_class: 'curtain' }),
		entity('event.porch_doorbell', 'unknown', { device_class: 'doorbell' }),
		entity('alarm_control_panel.alarmo', 'disarmed', {}),
		entity('sensor.cpu', '3', {}),
	);
	const watch = alertsWatch(() => states) as (id: string) => boolean;

	it('follows openings, doorbells and alarm panels by device class', () => {
		expect(
			['binary_sensor.front_door', 'cover.garage', 'event.porch_doorbell', 'alarm_control_panel.alarmo'].every(watch),
		).toBe(true);
		expect(['binary_sensor.hall_motion', 'cover.curtains', 'sensor.cpu'].some(watch)).toBe(false);
	});

	it('follows only the openings for the open doors list', () => {
		const openings = openingsWatch(() => states) as (id: string) => boolean;
		expect(['binary_sensor.front_door', 'cover.garage', 'binary_sensor.gone', 'cover.gone'].every(openings)).toBe(true);
		expect(
			[
				'binary_sensor.hall_motion',
				'cover.curtains',
				'event.porch_doorbell',
				'alarm_control_panel.alarmo',
				'sensor.cpu',
			].some(openings),
		).toBe(false);
	});

	it('counts an alert domain entity that just left the states', () => {
		expect(watch('binary_sensor.gone')).toBe(true);
		expect(watch('sensor.gone')).toBe(false);
	});
});

describe('serverNow', () => {
	it("is Home Assistant's latest update", () => {
		expect(
			serverNow(
				toStates(
					entity('sensor.a', '1', {}, '2026-10-18T07:00:00Z'),
					entity('sensor.b', '2', {}, '2026-10-18T07:03:00Z'),
				),
			),
		).toBe(Date.parse('2026-10-18T07:03:00Z'));
		expect(serverNow(undefined)).toBe(0);
	});
});
