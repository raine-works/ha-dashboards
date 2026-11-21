import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	batteryForTracker,
	discoverPeople,
	formatAgo,
	formatDistance,
	formatPlace,
	getPersonView,
	groupNearby,
	householdFirstName,
	householdPerson,
	initialsFor,
	locatedPeople,
	reverseGeocode,
} from '../people';

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
	entity_id,
	state,
	attributes,
	last_changed: '2026-10-18T12:00:00Z',
	last_updated: '2026-10-18T12:00:00Z',
});

const states = (...entities: HassEntity[]) => Object.fromEntries(entities.map((e) => [e.entity_id, e]));

const home = entity('zone.home', '2', { friendly_name: 'Home', latitude: 40.0648, longitude: -91.6736, radius: 50 });
const office = entity('zone.office', '0', {
	friendly_name: 'Lux Financial',
	latitude: 40.429,
	longitude: -91.891,
	radius: 50,
});
const city = entity('zone.city', '0', {
	friendly_name: 'Maple Grove',
	latitude: 40.43,
	longitude: -91.89,
	radius: 5000,
});

describe('people', () => {
	it('builds initials', () => {
		expect(initialsFor('Robin Pike')).toBe('RP');
		expect(initialsFor('Mary Jo Smith')).toBe('MS');
		expect(initialsFor('Chai')).toBe('CH');
		expect(initialsFor('  ')).toBe('?');
	});

	it('formats distances in miles or kilometers', () => {
		expect(formatDistance(800, true)).toBe('0.5 mi');
		expect(formatDistance(48_280, true)).toBe('30 mi');
		expect(formatDistance(650, false)).toBe('650 m');
		expect(formatDistance(4_200, false)).toBe('4.2 km');
		expect(formatDistance(42_000, false)).toBe('42 km');
	});

	it('formats time since the last report', () => {
		const now = Date.parse('2026-10-18T12:00:00Z');
		expect(formatAgo('2026-10-18T11:59:30Z', now)).toBe('Just now');
		expect(formatAgo('2026-10-18T11:55:00Z', now)).toBe('5 min ago');
		expect(formatAgo('2026-10-18T09:00:00Z', now)).toBe('3 hr ago');
		expect(formatAgo('2026-10-17T12:00:00Z', now)).toBe('1 day ago');
		expect(formatAgo('garbage', now)).toBe('Just now');
	});

	it('reads Companion app battery sensors', () => {
		const s = states(
			entity('sensor.jordan_s_phone_battery_level', '81'),
			entity('sensor.jordan_s_phone_battery_state', 'charging'),
			entity('sensor.robin_s_phone_battery_level', '31'),
			entity('sensor.robin_s_phone_battery_state', 'Not Charging'),
			entity('sensor.ios_battery_level', '100'),
			entity('sensor.ios_battery_state', 'Full'),
			entity('sensor.ios_charger_type', 'ac'),
		);
		expect(batteryForTracker('device_tracker.jordan_s_phone', s)).toEqual({ level: 81, charging: true, full: false });
		expect(batteryForTracker('device_tracker.robin_s_phone', s)).toEqual({
			level: 31,
			charging: false,
			full: false,
		});
		expect(batteryForTracker('device_tracker.ios', s)).toEqual({ level: 100, charging: true, full: true });
		expect(batteryForTracker('device_tracker.none', s)).toBeNull();
		expect(batteryForTracker(undefined, s)).toBeNull();
	});

	it('falls back to tracker battery attributes', () => {
		const s = states(entity('device_tracker.watch', 'home', { battery_level: 55.4, battery_status: 'Charging' }));
		expect(batteryForTracker('device_tracker.watch', s)).toEqual({ level: 55, charging: true, full: false });
	});

	it('describes a person at home', () => {
		const person = entity('person.robin_pike', 'home', {
			friendly_name: 'Robin Pike',
			device_trackers: ['device_tracker.robin_s_phone'],
			source: 'device_tracker.robin_s_phone',
			in_zones: ['zone.home'],
			latitude: 40.0648,
			longitude: -91.6736,
			entity_picture: '/api/image/serve/abc/512x512',
		});
		const tracker = { ...entity('device_tracker.robin_s_phone', 'home'), last_updated: '2026-10-18T11:58:00Z' };
		const view = getPersonView(
			person,
			states(home, person, tracker, entity('sensor.robin_s_phone_battery_level', '31')),
		);
		expect(view).toMatchObject({
			name: 'Robin Pike',
			shortName: 'Robin',
			initials: 'RP',
			isHome: true,
			zone: { entityId: 'zone.home', name: 'Home' },
			locationLabel: 'Home',
			battery: { level: 31, charging: false },
			updated: '2026-10-18T11:58:00Z',
		});
		expect(view.distanceFromHome).toBeLessThan(1);
	});

	it('picks the smallest zone a person is in', () => {
		const person = entity('person.jordan', 'Lux Financial', {
			friendly_name: 'Jordan',
			device_trackers: ['device_tracker.jordan'],
			in_zones: ['zone.city', 'zone.office'],
			latitude: 40.429,
			longitude: -91.891,
		});
		const view = getPersonView(person, states(home, office, city, person));
		expect(view.zone).toEqual({ entityId: 'zone.office', name: 'Lux Financial' });
		expect(view.locationLabel).toBe('Lux Financial');
		expect(view.isHome).toBe(false);
		expect(view.distanceFromHome).toBeGreaterThan(30_000);
	});

	it('finds the zone by name when in_zones is missing', () => {
		const person = entity('person.jordan', 'Lux Financial', { device_trackers: ['device_tracker.jordan'] });
		expect(getPersonView(person, states(office, person)).zone).toEqual({
			entityId: 'zone.office',
			name: 'Lux Financial',
		});
	});

	it('labels people outside every zone as away', () => {
		const person = entity('person.avery', 'not_home', {
			friendly_name: 'Avery',
			device_trackers: ['device_tracker.avery'],
			in_zones: [],
		});
		const view = getPersonView(person, states(home, person));
		expect(view.zone).toBeNull();
		expect(view.locationLabel).toBe('Away');
		expect(view.distanceFromHome).toBeNull();
		expect(getPersonView(entity('person.x', 'unknown'), {}).locationLabel).toBe('Unknown');
	});

	it('discovers tracked people only, sorted by name', () => {
		const s = states(
			entity('person.zed', 'home', { friendly_name: 'Zed', device_trackers: ['device_tracker.z'] }),
			entity('person.admin', 'unknown', { friendly_name: 'Admin', device_trackers: [] }),
			entity('person.chai', 'unknown', { friendly_name: 'Chai' }),
			entity('person.amy', 'not_home', { friendly_name: 'Amy', device_trackers: ['device_tracker.a'] }),
		);
		const people = discoverPeople(s);
		expect(people.map((p) => p.entityId)).toEqual(['person.amy', 'person.zed']);
		expect(locatedPeople(people)).toEqual([]);
	});

	it('formats reverse-geocoded places', () => {
		expect(formatPlace({ road: 'Main Street', city: 'Orem' })).toBe('Main Street, Orem');
		expect(formatPlace({ road: 'Main Street', town: 'Payson' }, 'Costco')).toBe('Costco, Payson');
		expect(formatPlace({ suburb: 'Maple Grove', city: 'Maple Grove' })).toBe('Maple Grove');
		expect(formatPlace({})).toBeNull();
	});

	it('caches reverse geocoding per position', async () => {
		let calls = 0;
		const fetcher = (async () => {
			calls++;
			return new Response(JSON.stringify({ name: '', address: { road: 'Center St', town: 'Fairview' } }));
		}) as unknown as typeof fetch;
		expect(await reverseGeocode(40.1, -91.6, fetcher)).toBe('Center St, Fairview');
		expect(await reverseGeocode(40.1001, -91.6001, fetcher)).toBe('Center St, Fairview');
		expect(calls).toBe(1);
	});
});

describe('groupNearby', () => {
	it('groups points that overlap, in order', () => {
		const points = [
			{ id: 'a', x: 0, y: 0 },
			{ id: 'b', x: 30, y: 10 },
			{ id: 'c', x: 200, y: 0 },
			{ id: 'd', x: 0, y: 0 },
		];
		const groups = groupNearby(points, (p) => p, 44).map((g) => g.map((p) => p.id));
		expect(groups).toEqual([['a', 'b', 'd'], ['c']]);
		expect(groupNearby([], (p: { x: number; y: number }) => p, 44)).toEqual([]);
	});
});

describe('householdFirstName', () => {
	const robin = entity('person.robin', 'home', {
		friendly_name: 'Robin Pike',
		user_id: 'u-robin',
		device_trackers: ['device_tracker.robin_phone'],
	});
	const admin = entity('person.admin', 'unknown', { friendly_name: 'Admin', user_id: 'u-admin', device_trackers: [] });

	it("is the signed-in household member's first name", () => {
		expect(householdFirstName(states(robin, admin), 'u-robin')).toBe('Robin');
	});

	it('is nothing for accounts that are not household members, or no user', () => {
		expect(householdFirstName(states(robin, admin), 'u-admin')).toBeUndefined();
		expect(householdFirstName(states(robin), 'u-panel')).toBeUndefined();
		expect(householdFirstName(states(robin), undefined)).toBeUndefined();
	});
});

describe('householdPerson', () => {
	const robin = entity('person.robin', 'home', {
		friendly_name: 'Robin Pike',
		user_id: 'u-robin',
		device_trackers: ['device_tracker.robin_phone'],
	});
	const admin = entity('person.admin', 'unknown', { friendly_name: 'Admin', user_id: 'u-admin', device_trackers: [] });

	it('is the signed-in household member, never an account without a phone', () => {
		expect(householdPerson(states(robin, admin), 'u-robin')?.entity_id).toBe('person.robin');
		expect(householdPerson(states(robin, admin), 'u-admin')).toBeUndefined();
		expect(householdPerson(states(robin), undefined)).toBeUndefined();
	});
});
