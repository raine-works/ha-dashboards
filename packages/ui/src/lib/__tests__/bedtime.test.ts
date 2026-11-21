import { describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import {
	bedtimeRoomOf,
	bedtimeRooms,
	bedtimeService,
	discoverBedtimeToggles,
	homeBedtimeEntity,
	memberBedtimeRoom,
	otherBedtimeRooms,
} from '../bedtime';

const hass = (entities: NonNullable<HomeAssistant['entities']>): Pick<HomeAssistant, 'entities' | 'devices'> => ({
	entities,
	devices: { tablet: { id: 'tablet', area_id: 'jordan_s_room' } },
});

describe('discoverBedtimeToggles', () => {
	it("finds each room's labeled toggle by its area", () => {
		expect(
			discoverBedtimeToggles(
				hass({
					'input_boolean.master_suite_bedtime': {
						entity_id: 'input_boolean.master_suite_bedtime',
						area_id: 'bedroom',
						labels: ['bedtime'],
					},
					'input_boolean.kais_room_bedtime': {
						entity_id: 'input_boolean.kais_room_bedtime',
						area_id: 'kai_s_room',
						labels: ['bedtime'],
					},
					// The device's area when the entity has none
					'input_boolean.jordans_room_bedtime': {
						entity_id: 'input_boolean.jordans_room_bedtime',
						device_id: 'tablet',
						labels: ['bedtime'],
					},
				}),
			),
		).toEqual({
			bedroom: 'input_boolean.master_suite_bedtime',
			kai_s_room: 'input_boolean.kais_room_bedtime',
			jordan_s_room: 'input_boolean.jordans_room_bedtime',
		});
	});

	it('skips unlabeled, hidden, arealess and non-toggle entities', () => {
		expect(
			discoverBedtimeToggles(
				hass({
					'input_boolean.home_bedtime': { entity_id: 'input_boolean.home_bedtime', labels: ['bedtime'] },
					'input_boolean.guest': { entity_id: 'input_boolean.guest', area_id: 'guest_room' },
					'input_boolean.hidden': {
						entity_id: 'input_boolean.hidden',
						area_id: 'office',
						labels: ['bedtime'],
						hidden: true,
					},
					'light.lamp': { entity_id: 'light.lamp', area_id: 'library', labels: ['bedtime'] },
				}),
			),
		).toEqual({});
	});
});

const person = (entity_id: string, user_id: string, trackers = [`device_tracker.${user_id}_phone`]): HassEntity => ({
	entity_id,
	state: 'home',
	attributes: { user_id, device_trackers: trackers },
	last_changed: '',
	last_updated: '',
});

const house = (user?: string): Parameters<typeof memberBedtimeRoom>[0] => ({
	entities: {
		'input_boolean.master_suite_bedtime': {
			entity_id: 'input_boolean.master_suite_bedtime',
			area_id: 'bedroom',
			labels: ['bedtime'],
		},
		'input_boolean.kais_room_bedtime': {
			entity_id: 'input_boolean.kais_room_bedtime',
			area_id: 'kai_s_room',
			labels: ['bedtime'],
		},
		'person.robin': { entity_id: 'person.robin', area_id: 'bedroom' },
		'person.avery': { entity_id: 'person.avery', area_id: 'kai_s_room' },
		'person.jordan': { entity_id: 'person.jordan', area_id: 'jordan_s_room' },
		'person.admin': { entity_id: 'person.admin', area_id: 'bedroom' },
	},
	devices: {},
	areas: {
		bedroom: { area_id: 'bedroom', name: 'Master Suite' },
		kai_s_room: { area_id: 'kai_s_room', name: "Kai's Room" },
		jordan_s_room: { area_id: 'jordan_s_room', name: "Jordan's Room" },
	},
	states: {
		'person.robin': person('person.robin', 'robin'),
		'person.avery': person('person.avery', 'avery'),
		'person.jordan': person('person.jordan', 'jordan'),
		'person.admin': person('person.admin', 'admin', []),
	},
	user: user ? { id: user, name: user, is_admin: false, is_owner: false } : undefined,
});

describe('bedtimeRooms', () => {
	it('lists every room with a toggle by name', () => {
		expect(bedtimeRooms(house())).toEqual([
			{ areaId: 'kai_s_room', name: "Kai's Room", entityId: 'input_boolean.kais_room_bedtime' },
			{ areaId: 'bedroom', name: 'Master Suite', entityId: 'input_boolean.master_suite_bedtime' },
		]);
	});
});

describe('memberBedtimeRoom', () => {
	it("is the signed-in member's room, from their person's area", () => {
		expect(memberBedtimeRoom(house('robin'))?.entityId).toBe('input_boolean.master_suite_bedtime');
		expect(memberBedtimeRoom(house('avery'))?.entityId).toBe('input_boolean.kais_room_bedtime');
	});

	it('is none for a room without a toggle, a non-member or no one signed in', () => {
		expect(memberBedtimeRoom(house('jordan'))).toBeUndefined();
		// The admin account has no phone, so it isn't a household member
		expect(memberBedtimeRoom(house('admin'))).toBeUndefined();
		expect(memberBedtimeRoom(house())).toBeUndefined();
	});
});

describe('bedtimeRoomOf', () => {
	const toggle = (entity_id: string, state: string): HassEntity => ({
		entity_id,
		state,
		attributes: {},
		last_changed: '',
		last_updated: '',
	});
	const registry = {
		...house(),
		entities: {
			...house().entities,
			'light.kai_s_room_desk_lamp': { entity_id: 'light.kai_s_room_desk_lamp', device_id: 'lamp' },
			'light.master_suite_floor_lamp': { entity_id: 'light.master_suite_floor_lamp', area_id: 'bedroom' },
			'switch.kai_s_room_relaxed_stateful_scene': {
				entity_id: 'switch.kai_s_room_relaxed_stateful_scene',
				area_id: 'kai_s_room',
			},
		},
		devices: { lamp: { id: 'lamp', area_id: 'kai_s_room' } },
	};
	const states = (kai: string, master = 'off') => ({
		'input_boolean.kais_room_bedtime': toggle('input_boolean.kais_room_bedtime', kai),
		'input_boolean.master_suite_bedtime': toggle('input_boolean.master_suite_bedtime', master),
		'input_boolean.home_bedtime': toggle('input_boolean.home_bedtime', 'on'),
	});

	it("finds the room in bedtime holding a light (by its device's area) or a scene", () => {
		expect(bedtimeRoomOf(registry, states('on'), ['light.kai_s_room_desk_lamp'])?.name).toBe("Kai's Room");
		expect(bedtimeRoomOf(registry, states('on'), ['switch.kai_s_room_relaxed_stateful_scene'])?.name).toBe(
			"Kai's Room",
		);
		// Any of a room's lights
		expect(
			bedtimeRoomOf(registry, states('off', 'on'), ['light.kai_s_room_desk_lamp', 'light.master_suite_floor_lamp'])
				?.name,
		).toBe('Master Suite');
	});

	it("ignores rooms whose bedtime is off, whatever Home Bedtime's state", () => {
		expect(bedtimeRoomOf(registry, states('off'), ['light.kai_s_room_desk_lamp'])).toBeUndefined();
		expect(bedtimeRoomOf(registry, states('on'), ['light.master_suite_floor_lamp'])).toBeUndefined();
	});
});

describe('otherBedtimeRooms', () => {
	const at = (entity_id: string, state: string, name: string): HassEntity => ({
		entity_id,
		state,
		attributes: { friendly_name: name, user_id: entity_id.slice(7), device_trackers: [`device_tracker.${entity_id}`] },
		last_changed: '',
		last_updated: '',
	});
	const toggle = (entity_id: string, state = 'off'): HassEntity => ({
		entity_id,
		state,
		attributes: {},
		last_changed: '',
		last_updated: '',
	});
	const base = house('robin');
	const world = (people: Record<string, string>, toggles: Record<string, string> = {}) => ({
		...base,
		entities: {
			...base.entities,
			'input_boolean.jordans_room_bedtime': {
				entity_id: 'input_boolean.jordans_room_bedtime',
				area_id: 'jordan_s_room',
				labels: ['bedtime'],
			},
			'person.kai': { entity_id: 'person.kai', area_id: 'kai_s_room' },
		},
		states: {
			'person.robin': at('person.robin', people.robin ?? 'home', 'Robin Pike'),
			'person.jordan': at('person.jordan', people.jordan ?? 'home', 'Jordan Call'),
			'person.kai': at('person.kai', people.kai ?? 'home', 'Kai Pike'),
			'person.avery': at('person.avery', people.avery ?? 'home', 'Avery Fonville'),
			'input_boolean.master_suite_bedtime': toggle('input_boolean.master_suite_bedtime', toggles.master ?? 'off'),
			'input_boolean.kais_room_bedtime': toggle('input_boolean.kais_room_bedtime', toggles.kai ?? 'off'),
			'input_boolean.jordans_room_bedtime': toggle('input_boolean.jordans_room_bedtime', toggles.jordan ?? 'off'),
		},
	});

	const summary = (rooms: ReturnType<typeof otherBedtimeRooms>) =>
		rooms.map(({ name, on, home, away, pickable }) => ({ name, on, home, away, pickable }));

	it("lists every room but the member's own, pickable when nobody there is home", () => {
		expect(summary(otherBedtimeRooms(world({ jordan: 'not_home', kai: 'Work', avery: 'not_home' })))).toEqual([
			{ name: "Jordan's Room", on: false, home: [], away: ['Jordan'], pickable: true },
			{ name: "Kai's Room", on: false, home: [], away: ['Avery', 'Kai'], pickable: true },
		]);
	});

	it('shows a room with someone home, or already in bedtime, without letting it be picked', () => {
		// Kai away but Avery home; Jordan away but his room is already in bedtime
		expect(summary(otherBedtimeRooms(world({ jordan: 'not_home', kai: 'not_home' }, { jordan: 'on' })))).toEqual([
			{ name: "Jordan's Room", on: true, home: [], away: ['Jordan'], pickable: false },
			{ name: "Kai's Room", on: false, home: ['Avery'], away: ['Kai'], pickable: false },
		]);
	});

	it('without a member signed in, lists every room', () => {
		expect(otherBedtimeRooms({ ...world({ jordan: 'not_home' }), user: undefined }).map((r) => r.name)).toEqual([
			"Jordan's Room",
			"Kai's Room",
			'Master Suite',
		]);
	});
});

describe("the integration's bedtime switches", () => {
	const entry = (entity_id: string, area_id: string) => ({ entity_id, area_id, labels: ['bedtime'] });
	it('are found like the input_booleans, and win where a room has both (a house moving to them)', () => {
		const toggles = discoverBedtimeToggles({
			entities: {
				'input_boolean.suite_bedtime': entry('input_boolean.suite_bedtime', 'suite'),
				'switch.suite_bedtime': entry('switch.suite_bedtime', 'suite'),
				'input_boolean.den_bedtime': entry('input_boolean.den_bedtime', 'den'),
				'switch.kids_bedtime': entry('switch.kids_bedtime', 'kids'),
				'light.suite': { entity_id: 'light.suite', area_id: 'suite', labels: ['bedtime'] },
			},
		});
		expect(toggles).toEqual({
			suite: 'switch.suite_bedtime',
			den: 'input_boolean.den_bedtime',
			kids: 'switch.kids_bedtime',
		});
	});

	it("make Home Bedtime the integration's switch, else the house's own", () => {
		expect(homeBedtimeEntity({ 'switch.home_bedtime': {}, 'input_boolean.home_bedtime': {} })).toBe(
			'switch.home_bedtime',
		);
		expect(homeBedtimeEntity({ 'input_boolean.home_bedtime': {} })).toBe('input_boolean.home_bedtime');
		expect(homeBedtimeEntity({})).toBe('switch.home_bedtime');
		expect(bedtimeService('input_boolean.den_bedtime', true)).toEqual(['input_boolean', 'turn_on']);
		expect(bedtimeService('switch.home_bedtime', false)).toEqual(['switch', 'turn_off']);
	});
});
