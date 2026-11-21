import { describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import {
	ALARM_SYSTEM_LABEL,
	ARMING_CHIME,
	alarmSystemParts,
	countdownBeep,
	describeProblem,
	discoverDoorLocks,
	discoverGarageBays,
	ENTRY_CHIME,
	garagePendingDone,
	garageStatus,
	lockFaults,
	lockFaultsIn,
	lockStatus,
	securityWatch,
	systemGroups,
	systemProblems,
} from '../security';

const entity = (entity_id: string, friendly_name: string, attributes: Record<string, unknown> = {}): HassEntity => ({
	entity_id,
	state: 'on',
	attributes: { friendly_name, ...attributes },
	last_changed: '',
	last_updated: '',
});

const states = Object.fromEntries(
	[
		entity('lock.kitchen_back_entry', 'Back Entry'),
		entity('lock.entryway_front_entry', 'Front Entry'),
		entity('lock.hidden', 'Hidden Lock'),
		entity('binary_sensor.foyer_front_entry_contact', 'Front Entry Contact', { device_class: 'door' }),
		entity('binary_sensor.kitchen_window', 'Kitchen Window', { device_class: 'window' }),
		entity('cover.garage_west_bay_garage_door', 'West Bay Garage Door', { device_class: 'garage' }),
		entity('cover.master_suite_curtains', 'Master Suite Curtains', { device_class: 'curtain' }),
	].map((s) => [s.entity_id, s]),
);

const hass: Pick<HomeAssistant, 'entities' | 'devices'> = {
	entities: {
		'lock.entryway_front_entry': { entity_id: 'lock.entryway_front_entry', device_id: 'd1' },
		'lock.kitchen_back_entry': { entity_id: 'lock.kitchen_back_entry', area_id: 'kitchen' },
		'lock.hidden': { entity_id: 'lock.hidden', hidden: true },
		'binary_sensor.foyer_front_entry_contact': {
			entity_id: 'binary_sensor.foyer_front_entry_contact',
			area_id: 'entryway',
		},
		'binary_sensor.kitchen_window': { entity_id: 'binary_sensor.kitchen_window', area_id: 'kitchen' },
	},
	devices: { d1: { id: 'd1', area_id: 'entryway' } },
};

describe('discoverDoorLocks', () => {
	it('lists visible locks by entity id with the door contact in their area', () => {
		expect(discoverDoorLocks(hass, states)).toEqual([
			{ id: 'lock.entryway_front_entry', name: 'Front', contactId: 'binary_sensor.foyer_front_entry_contact' },
			// A window in the same area isn't the door's contact
			{ id: 'lock.kitchen_back_entry', name: 'Back', contactId: undefined },
		]);
	});
});

describe('discoverGarageBays', () => {
	it('lists garage doors only, without "Garage Door" in the name', () => {
		expect(discoverGarageBays(hass, states)).toEqual([{ id: 'cover.garage_west_bay_garage_door', name: 'West Bay' }]);
	});
});

describe('lockStatus', () => {
	it('never shows an unreachable lock as unlocked', () => {
		expect(lockStatus('unavailable')).toBe('offline');
		expect(lockStatus('unknown', 'locking')).toBe('offline');
		expect(lockStatus(undefined)).toBe('offline');
		expect(lockStatus('jammed', 'locking')).toBe('jammed');
	});

	it('shows the pending action, then the reported state', () => {
		expect(lockStatus('unlocked', 'locking')).toBe('locking');
		expect(lockStatus('locked')).toBe('locked');
		expect(lockStatus('unlocking')).toBe('unlocking');
		expect(lockStatus('open')).toBe('unlocked');
	});

	it('shows a failed lock as jammed until it locks or is tried again', () => {
		expect(lockStatus('unlocked', undefined, true)).toBe('jammed');
		expect(lockStatus('unlocked', 'locking', true)).toBe('locking');
		expect(lockStatus('locked', undefined, true)).toBe('locked');
		expect(lockStatus('unavailable', undefined, true)).toBe('offline');
	});
});

describe('lockFaults', () => {
	it("reads the helper's JSON list", () => {
		const helper = (state: string) => ({ ...entity('input_text.lock_faults', 'Lock Faults'), state });
		expect(lockFaults(undefined).size).toBe(0);
		expect(lockFaults(helper('')).size).toBe(0);
		expect(lockFaults(helper('unknown')).size).toBe(0);
		expect([...lockFaults(helper('["lock.kitchen_back_entry", 3]'))]).toEqual(['lock.kitchen_back_entry']);
	});
});

describe('garageStatus', () => {
	it('is stopped when open partway, and a stop on its way leaves the move showing', () => {
		expect(garageStatus('open', undefined, 40)).toBe('stopped');
		expect(garageStatus('open', undefined, 100)).toBe('open');
		expect(garageStatus('open')).toBe('open');
		expect(garageStatus('opening', 'stopping', 40)).toBe('opening');
		expect(garageStatus('open', 'stopping', 40)).toBe('stopped');
		expect(garageStatus('open', 'closing', 40)).toBe('closing');
	});

	it('knows when the pending action is done', () => {
		expect(garagePendingDone('stopping', 'closing')).toBe(false);
		expect(garagePendingDone('stopping', 'open')).toBe(true);
		expect(garagePendingDone('opening', 'opening')).toBe(false);
		expect(garagePendingDone('opening', 'open')).toBe(true);
		expect(garagePendingDone('closing', 'closed')).toBe(true);
	});

	it('reports moves, pending moves and offline bays', () => {
		expect(garageStatus('closed', 'opening')).toBe('opening');
		expect(garageStatus('closing', 'opening')).toBe('closing');
		expect(garageStatus('open')).toBe('open');
		expect(garageStatus('unavailable', 'closing')).toBe('offline');
	});
});

describe('countdownBeep', () => {
	it('chimes once a second while arming, twice in the last 10s', () => {
		expect(countdownBeep('arming', 45_000)).toEqual({ chime: ARMING_CHIME, nextInMs: 1000 });
		expect(countdownBeep('arming', 9_000)).toEqual({ chime: ARMING_CHIME, nextInMs: 500 });
	});
	it('chimes its two-note chime during the entry delay', () => {
		expect(countdownBeep('pending', 25_000)).toEqual({ chime: ENTRY_CHIME, nextInMs: 1000 });
		expect(countdownBeep('pending', 5_000)).toEqual({ chime: ENTRY_CHIME, nextInMs: 500 });
	});
	it('stays quiet once the delay ends and in every other state', () => {
		expect(countdownBeep('pending', 0)).toBeNull();
		expect(countdownBeep('triggered', 5_000)).toBeNull();
		expect(countdownBeep('armed_away', 5_000)).toBeNull();
		expect(countdownBeep(undefined, 5_000)).toBeNull();
	});
	it('fits each chime inside the fastest gap, so they never overlap', () => {
		for (const chime of [ARMING_CHIME, ENTRY_CHIME]) expect(chime.lengthMs).toBeLessThan(500);
	});
});

describe('securityWatch', () => {
	const watch = securityWatch(() => states) as (id: string) => boolean;

	it('follows locks, garage doors and door sensors, not the other binary sensors and covers', () => {
		expect(
			['lock.kitchen_back_entry', 'binary_sensor.foyer_front_entry_contact', 'cover.garage_west_bay_garage_door'].every(
				watch,
			),
		).toBe(true);
		expect(['binary_sensor.kitchen_window', 'cover.master_suite_curtains', 'sensor.cpu'].some(watch)).toBe(false);
	});

	it('counts one that just left the states', () => {
		expect(['binary_sensor.gone', 'cover.gone', 'lock.gone'].every(watch)).toBe(true);
	});
});

describe('alarm system check', () => {
	const at = (entity_id: string, state: string, friendly_name: string, attributes: Record<string, unknown> = {}) => ({
		entity_id,
		state,
		attributes: { friendly_name, ...attributes },
		last_changed: '',
		last_updated: '',
	});
	const systemStates = Object.fromEntries(
		[
			at('binary_sensor.front_contact', 'off', 'Front Entry Contact', { device_class: 'door' }),
			at('binary_sensor.kitchen_window', 'on', 'Kitchen Window Contact', { device_class: 'window' }),
			at('binary_sensor.theater_window', 'unavailable', 'Theater Window Contact', { device_class: 'window' }),
			at('binary_sensor.keypad_tamper', 'on', 'Keypad Tamper', { device_class: 'tamper' }),
			at('binary_sensor.foyer_person', 'on', 'Foyer Person detected'),
			at('lock.front', 'unavailable', 'Front Entry'),
			at('lock.back', 'unlocked', 'Back Entry'),
			at('lock.garage', 'unlocked', 'Garage Entry'),
			at('siren.kitchen', 'off', 'Siren'),
			at('siren.hallway', 'unavailable', 'Siren'),
			at('binary_sensor.unlabeled', 'unavailable', 'Unlabeled', { device_class: 'door' }),
			at('input_text.lock_faults', '["lock.garage"]', 'Lock faults'),
		].map((s) => [s.entity_id, s]),
	);
	const labeled = (entity_id: string, extra: Record<string, unknown> = {}) => ({
		entity_id,
		labels: [ALARM_SYSTEM_LABEL],
		...extra,
	});
	const systemHass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'> = {
		entities: Object.fromEntries(
			[
				labeled('binary_sensor.front_contact'),
				labeled('binary_sensor.kitchen_window'),
				labeled('binary_sensor.theater_window'),
				labeled('binary_sensor.keypad_tamper'),
				labeled('binary_sensor.foyer_person'),
				labeled('lock.front'),
				labeled('lock.back'),
				labeled('lock.garage'),
				labeled('siren.kitchen', { area_id: 'kitchen' }),
				labeled('siren.hallway', { area_id: 'hallway' }),
				labeled('binary_sensor.missing', { name: 'Gone' }),
				{ entity_id: 'binary_sensor.unlabeled' },
			].map((e) => [e.entity_id, e]),
		),
		devices: {},
		areas: {
			kitchen: { area_id: 'kitchen', name: 'Kitchen' },
			hallway: { area_id: 'hallway', name: 'Hallway' },
		},
	};
	const parts = alarmSystemParts(systemHass, systemStates);
	const byId = Object.fromEntries(parts.map((p) => [p.id, p]));

	it('lists every labeled sensor, lock and siren, in that order', () => {
		expect(parts.map((p) => p.kind)).toEqual([
			...Array(6).fill('sensor'),
			...Array(3).fill('lock'),
			...Array(2).fill('siren'),
		]);
		expect(byId['binary_sensor.unlabeled']).toBeUndefined();
	});

	it('names parts as people say them', () => {
		expect(byId['binary_sensor.front_contact'].name).toBe('Front Entry');
		expect(byId['binary_sensor.foyer_person'].name).toBe('Foyer camera');
		expect(byId['siren.kitchen'].name).toBe('Kitchen siren');
	});

	it("tells working parts from ones the alarm can't rely on", () => {
		expect(byId['binary_sensor.front_contact'].status).toBe('ok');
		expect(byId['binary_sensor.kitchen_window'].status).toBe('open');
		// Detecting someone is what a camera's sensor is for
		expect(byId['binary_sensor.foyer_person'].status).toBe('ok');
		expect(byId['binary_sensor.keypad_tamper'].status).toBe('tampered');
		expect(byId['binary_sensor.missing'].status).toBe('offline');
		expect(byId['lock.back'].status).toBe('unlocked');
		// Its last lock failed (input_text.lock_faults)
		expect(byId['lock.garage'].status).toBe('jammed');
		expect(systemProblems(parts).map(describeProblem)).toEqual([
			'Gone sensor is offline',
			'Keypad was tampered with',
			'Theater Window sensor is offline',
			'Front Entry lock is offline',
			'Garage Entry lock is jammed',
			'Hallway siren is offline',
		]);
	});

	it("counts what's ready by kind", () => {
		expect(systemGroups(parts)).toEqual([
			{ kind: 'sensor', ready: 3, total: 6 },
			{ kind: 'lock', ready: 1, total: 3 },
			{ kind: 'siren', ready: 1, total: 2 },
		]);
		expect(systemGroups([])).toEqual([]);
	});
});

describe('lockFaultsIn', () => {
	const entity = (state: string) => ({ state, attributes: {} }) as unknown as HassEntity;
	it("takes the integration's fault sensors and the house's own list", () => {
		const states = {
			'binary_sensor.front_entry_fault': entity('on'),
			'binary_sensor.back_entry_fault': entity('off'),
			'input_text.lock_faults': entity('["lock.garage_entry"]'),
		};
		expect([...lockFaultsIn(states, ['lock.front_entry', 'lock.back_entry', 'lock.garage_entry'])].sort()).toEqual([
			'lock.front_entry',
			'lock.garage_entry',
		]);
		expect(lockFaultsIn({}, ['lock.front_entry']).size).toBe(0);
	});
});
