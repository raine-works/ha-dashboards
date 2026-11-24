/**
 * Bedtime: each room's bedtime toggle and Home Bedtime, the rooms a member can put to bed, and
 * what Home Bedtime's routine does, as its confirm dialog lists it.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { isHouseholdMember } from './household';
import { entityArea } from './lights';
import { householdPerson } from './people';

/**
 * HA label on each room's bedtime toggle, in its room's area: the raineworks_dashboards
 * integration's `switch`, else a house's own `input_boolean` (before the integration had them).
 */
export const BEDTIME_LABEL = 'bedtime';
/** The whole house's bedtime toggle: on once every room is, and turning it on turns them all on. */
// house-audit: discovery (the integration's own Home Bedtime switch)
export const HOME_BEDTIME = 'switch.home_bedtime';
/** A house's own, before the integration's. */
// house-audit: discovery
export const FORMER_HOME_BEDTIME = 'input_boolean.home_bedtime';

/** The domains a bedtime toggle can be (a `watch`). */
export const BEDTIME_DOMAINS = ['switch', 'input_boolean'] as const;

/** Home Bedtime in this house: the integration's switch, else a house's own input_boolean. */
export function homeBedtimeEntity(states: Record<string, unknown> | undefined): string {
	return states?.[HOME_BEDTIME] || !states?.[FORMER_HOME_BEDTIME] ? HOME_BEDTIME : FORMER_HOME_BEDTIME;
}

/** Whether an entity is Home Bedtime (either kind). */
export const isHomeBedtime = (entityId: string) => entityId === HOME_BEDTIME || entityId === FORMER_HOME_BEDTIME;

/** `turn_on` / `turn_off` for a bedtime toggle, in its own domain. */
export const bedtimeService = (entityId: string, on: boolean): [string, string] => [
	entityId.slice(0, entityId.indexOf('.')),
	on ? 'turn_on' : 'turn_off',
];

/** A room (an area) with a bedtime toggle. */
export interface BedtimeRoom {
	areaId: string;
	/** The area's name ("Sam's Room"). */
	name: string;
	/** Its bedtime toggle. */
	entityId: string;
}

/**
 * Each area's bedtime toggle: labeled `switch`es (the integration's) or `input_boolean`s with an area
 * (their own, else their device's); a switch wins where an area has both (a house moving to them).
 */
export function discoverBedtimeToggles(hass: Pick<HomeAssistant, 'entities' | 'devices'>): Record<string, string> {
	const byArea: Record<string, string> = {};
	for (const entry of Object.values(hass.entities ?? {})) {
		const isSwitch = entry.entity_id.startsWith('switch.');
		if (!(isSwitch || entry.entity_id.startsWith('input_boolean.')) || entry.hidden) continue;
		if (!entry.labels?.includes(BEDTIME_LABEL)) continue;
		const areaId = entityArea(hass, entry.entity_id);
		if (!areaId) continue;
		if (!byArea[areaId] || (isSwitch && !byArea[areaId].startsWith('switch.'))) byArea[areaId] = entry.entity_id;
	}
	return byArea;
}

/** Every room with a bedtime toggle, by name. */
export function bedtimeRooms(hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>): BedtimeRoom[] {
	return Object.entries(discoverBedtimeToggles(hass))
		.map(([areaId, entityId]) => ({ areaId, entityId, name: hass.areas?.[areaId]?.name ?? areaId }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The signed-in household member's room, as its area id: their person entity's area in Home Assistant. */
export function memberArea(hass: Pick<HomeAssistant, 'entities' | 'devices' | 'states' | 'user'>): string | undefined {
	const person = householdPerson(hass.states, hass.user?.id);
	return person ? entityArea(hass, person.entity_id) : undefined;
}

/**
 * The signed-in household member's room: their person entity's area in Home Assistant (a parent's might be
 * the Master Suite, whose toggle covers the Ensuite too), with its bedtime toggle; none for an
 * account that isn't a member, a member without a room, or a room without a toggle.
 */
export function memberBedtimeRoom(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'states' | 'user'>,
): BedtimeRoom | undefined {
	const areaId = memberArea(hass);
	return areaId ? bedtimeRooms(hass).find((room) => room.areaId === areaId) : undefined;
}

/** A room besides the signed-in member's own, as their bedtime dialog shows it (`otherBedtimeRooms`). */
export interface OtherBedtimeRoom extends BedtimeRoom {
	/** Its bedtime is on already. */
	on: boolean;
	/** First names of its household members at home: with anyone home, it's theirs to start. */
	home: string[];
	/** First names of its household members away. */
	away: string[];
	/** Can be put to bed from here: still off, and nobody assigned to it is home. */
	pickable: boolean;
}

/**
 * Every room besides the signed-in member's own, for their bedtime dialog: whether it's in bedtime
 * already, and who's home and away there (household members, `isHouseholdMember()`, assigned by their
 * person's area). One still off whose people are all away (or that has none) can be put to bed along
 * with the member's own; one with someone home is theirs to start, so it only shows its state.
 */
export function otherBedtimeRooms(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'states' | 'user'>,
): OtherBedtimeRoom[] {
	const own = memberBedtimeRoom(hass)?.areaId;
	const household = Object.values(hass.states).filter(isHouseholdMember);
	const firstName = (p: HassEntity) => String(p.attributes.friendly_name ?? p.entity_id).split(/\s+/)[0] ?? '';
	return bedtimeRooms(hass).flatMap((room) => {
		if (room.areaId === own) return [];
		const people = household.filter((p) => entityArea(hass, p.entity_id) === room.areaId);
		const home = people
			.filter((p) => p.state === 'home')
			.map(firstName)
			.sort();
		const away = people
			.filter((p) => p.state !== 'home')
			.map(firstName)
			.sort();
		const on = hass.states[room.entityId]?.state === 'on';
		return [{ ...room, on, home, away, pickable: !on && home.length === 0 }];
	});
}

/**
 * The room in bedtime (its own toggle on; Home Bedtime alone doesn't count) holding any of these
 * entities (lights, a scene's switch), by their area: turning them on there asks first.
 */
export function bedtimeRoomOf(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>,
	states: Record<string, HassEntity>,
	entityIds: string[],
): BedtimeRoom | undefined {
	const asleep = bedtimeRooms(hass).filter((room) => states[room.entityId]?.state === 'on');
	if (asleep.length === 0) return undefined;
	for (const id of entityIds) {
		const areaId = entityArea(hass, id);
		const room = asleep.find((r) => r.areaId === areaId);
		if (room) return room;
	}
	return undefined;
}

/** What a step can be about, for its icon. */
export const BEDTIME_STEP_KINDS = [
	'rooms',
	'lights',
	'media',
	'speaker',
	'fan',
	'covers',
	'locks',
	'climate',
	'alert',
	'panels',
] as const;

/** What a step is about, for its icon. */
export type BedtimeStepKind = (typeof BEDTIME_STEP_KINDS)[number];

/** One thing a bedtime routine does, as its confirm dialog says it. */
export interface BedtimeStep {
	kind: BedtimeStepKind;
	/** The step in a sentence ("Closes every curtain, blind and garage door"). */
	text: string;
	/**
	 * The Home Assistant actions that do it in the routine's automation (`light.turn_off`, ...); a
	 * test checks they're exactly the actions the automation runs, so this list can't fall behind it.
	 * Empty for what another automation does (the LEDs, the rooms put to bed).
	 */
	actions: string[];
}

/** What a bedtime toggle's routine does, as its confirm dialog lists it. */
export interface BedtimeRoutine {
	/** The zone it's for, as its dialog names it ("Master Suite and Ensuite"). */
	zone: string;
	/** Its steps, in the order they happen. */
	steps: BedtimeStep[];
}

/**
 * What Home Bedtime does when it turns on: automations/bedtime_home.yaml, plus the rooms put to bed
 * (the integration keeps them in step) and the dimmed status lights (the integration's Bedtime option). Kept in step by
 * bedtime-routines.test.ts.
 */
export const HOME_ROUTINE: BedtimeRoutine = {
	zone: 'The whole house',
	steps: [
		{ kind: 'rooms', text: 'Puts every room still awake to bed, each with its own routine', actions: [] },
		{
			kind: 'lights',
			text: 'Turns off every household light and TV, and stops the music',
			actions: ['light.turn_off', 'media_player.turn_off', 'media_player.media_stop'],
		},
		{ kind: 'covers', text: 'Closes every curtain, blind and garage door', actions: ['cover.close_cover'] },
		{
			kind: 'locks',
			text: 'Locks the outside doors (an open door locks once it closes)',
			actions: ['script.turn_on'],
		},
		{ kind: 'climate', text: 'Sets the thermostats to Sleep', actions: ['input_select.select_option'] },
		{
			kind: 'alert',
			text: "A minute later, tells everyone's phones about any door, window or garage still open",
			actions: ['script.notify_people'],
		},
		{ kind: 'panels', text: 'Dims the wall panel lights to 10% until bedtime ends', actions: [] },
	],
};
