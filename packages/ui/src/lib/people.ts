/**
 * The household's people: where each is (zone, position, distance from home), their phone's
 * battery, who's signed in, and street names for people outside every zone.
 *
 * @module
 */
import type { HassEntity } from '../types/homeassistant';
import type { EntityWatch } from './hass-store';
import { isHouseholdMember } from './household';

/** A zone a person is in. */
export interface PersonZone {
	/** The `zone.*` entity id (empty when the state names a zone that isn't there). */
	entityId: string;
	/** The zone's name. */
	name: string;
}

/** A person's phone battery. */
export interface PersonBattery {
	/** 0–100 */
	level: number;
	/** Charging (or full and still plugged in). */
	charging: boolean;
	/** Battery is reported full (iOS "Full"); counts as charging when still plugged in. */
	full: boolean;
}

/** A person as the dashboards show them (`getPersonView`). */
export interface PersonView {
	/** Their `person.*` entity id. */
	entityId: string;
	/** Their friendly name. */
	name: string;
	/** First word of the friendly name, for tight spaces. */
	shortName: string;
	/** One or two letters for an avatar without a picture. */
	initials: string;
	/** Their picture's URL. */
	picture?: string;
	/** Home Assistant has them home. */
	isHome: boolean;
	/** Smallest zone the person is in (home included), or null when away from every zone. */
	zone: PersonZone | null;
	/** Zone name, "Away" or "Unknown". */
	locationLabel: string;
	/** Their latitude, when known. */
	latitude: number | null;
	/** Their longitude, when known. */
	longitude: number | null;
	/** Straight-line distance from zone.home in meters, when both positions are known. */
	distanceFromHome: number | null;
	/** Their phone's battery, when it reports one. */
	battery: PersonBattery | null;
	/** When the tracker last reported (ISO timestamp). */
	updated: string;
}

const num = (value: unknown): number | null => {
	const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
	return Number.isFinite(n) ? n : null;
};

/** "AB" from "Alex Brown" (first and last words), "AL" from "Alex", "?" from nothing. */
export function initialsFor(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '?';
	return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`).toUpperCase();
}

/** Great-circle distance in meters. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

/** "0.4 mi" / "12 mi" (imperial) or "650 m" / "12 km" (metric). */
export function formatDistance(meters: number, imperial: boolean): string {
	if (imperial) {
		const miles = meters / 1609.344;
		return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
	}
	if (meters < 1000) return `${Math.round(meters)} m`;
	const km = meters / 1000;
	return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** "Just now", "5 min ago", "3 hr ago", "2 days ago". */
export function formatAgo(iso: string, now: number): string {
	const minutes = Math.floor((now - Date.parse(iso)) / 60_000);
	if (!Number.isFinite(minutes) || minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hr ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Battery for a tracker. Companion app trackers (`device_tracker.<device>`) come with
 * `sensor.<device>_battery_level` and `sensor.<device>_battery_state` (Android: charging /
 * discharging / full / not_charging; iOS: Charging / Not Charging / Full). Falls back to the
 * tracker's own battery attributes.
 */
export function batteryForTracker(
	trackerId: string | undefined,
	states: Record<string, HassEntity>,
): PersonBattery | null {
	if (!trackerId) return null;
	const device = trackerId.split('.')[1];
	const tracker = states[trackerId];
	const level = num(states[`sensor.${device}_battery_level`]?.state) ?? num(tracker?.attributes.battery_level);
	if (level == null) return null;

	const rawState = states[`sensor.${device}_battery_state`]?.state ?? tracker?.attributes.battery_status;
	const batteryState = String(rawState ?? '')
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	const full = batteryState === 'full';
	const charging = batteryState === 'charging' || (full && states[`sensor.${device}_charger_type`]?.state !== 'none');
	return { level: Math.round(level), charging, full };
}

/** The smallest (most specific) zone listed in `in_zones`, else the zone named by the state. */
function zoneFor(person: HassEntity, states: Record<string, HassEntity>): PersonZone | null {
	const zoneName = (z: HassEntity) => z.attributes.friendly_name ?? z.entity_id.split('.')[1];
	const inZones = (Array.isArray(person.attributes.in_zones) ? person.attributes.in_zones : [])
		.map((id) => states[String(id)])
		.filter((z): z is HassEntity => Boolean(z))
		.sort((a, b) => (num(a.attributes.radius) ?? 0) - (num(b.attributes.radius) ?? 0));
	if (inZones[0]) return { entityId: inZones[0].entity_id, name: zoneName(inZones[0]) };

	if (person.state === 'home') return { entityId: 'zone.home', name: 'Home' };
	if (['not_home', 'unknown', 'unavailable'].includes(person.state)) return null;
	const byName = Object.values(states).find(
		(s) => s.entity_id.startsWith('zone.') && zoneName(s).toLowerCase() === person.state.toLowerCase(),
	);
	return { entityId: byName?.entity_id ?? '', name: byName ? zoneName(byName) : person.state };
}

/** A `person.*` entity as a `PersonView`, its battery from its tracker (the `source`, else the first). */
export function getPersonView(person: HassEntity, states: Record<string, HassEntity>): PersonView {
	const name = person.attributes.friendly_name ?? person.entity_id.split('.')[1];
	const trackers = Array.isArray(person.attributes.device_trackers) ? person.attributes.device_trackers : [];
	const source = typeof person.attributes.source === 'string' ? person.attributes.source : String(trackers[0] ?? '');
	const zone = zoneFor(person, states);
	const isHome = person.state === 'home';

	const latitude = num(person.attributes.latitude);
	const longitude = num(person.attributes.longitude);
	const home = states['zone.home'];
	const homeLat = num(home?.attributes.latitude);
	const homeLon = num(home?.attributes.longitude);
	const distanceFromHome =
		latitude != null && longitude != null && homeLat != null && homeLon != null
			? haversineMeters(homeLat, homeLon, latitude, longitude)
			: null;

	let locationLabel = 'Unknown';
	if (zone) locationLabel = zone.name;
	else if (person.state === 'not_home') locationLabel = 'Away';

	return {
		entityId: person.entity_id,
		name,
		shortName: name.split(/\s+/)[0] ?? name,
		initials: initialsFor(name),
		picture: person.attributes.entity_picture,
		isHome,
		zone,
		locationLabel,
		latitude,
		longitude,
		distanceFromHome,
		battery: batteryForTracker(source || undefined, states),
		updated: states[source]?.last_updated ?? person.last_updated,
	};
}

const PHONE_SENSOR = /^sensor\..+_(battery_level|battery_state|charger_type)$/;
/** What `discoverPeople` reads: people, zones, trackers and the Companion app's battery sensors. */
export const PEOPLE_WATCH: EntityWatch = (id) => /^(person|zone|device_tracker)\./.test(id) || PHONE_SENSOR.test(id);

/**
 * The household (`isHouseholdMember()`: the integration's list, else every person with a device
 * tracker, which skips the admin account and pets), sorted by name.
 */
export function discoverPeople(states: Record<string, HassEntity>): PersonView[] {
	return Object.values(states)
		.filter(isHouseholdMember)
		.map((s) => getPersonView(s, states))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The household member signed in as `userId`: the household person (`isHouseholdMember()`) whose
 * `user_id` it is; undefined for an account that isn't a household member (the
 * admin account, the wall panels' user).
 */
export function householdPerson(
	states: Record<string, HassEntity>,
	userId: string | undefined,
): HassEntity | undefined {
	if (!userId) return undefined;
	return Object.values(states).find((s) => isHouseholdMember(s) && s.attributes.user_id === userId);
}

/** The first name of the household member signed in as `userId` (`householdPerson()`), else undefined. */
export function householdFirstName(states: Record<string, HassEntity>, userId: string | undefined): string | undefined {
	const person = householdPerson(states, userId);
	const name = String(person?.attributes.friendly_name ?? '').trim();
	return name ? name.split(/\s+/)[0] : undefined;
}

/** Everyone with a known position. */
export function locatedPeople(people: PersonView[]): (PersonView & { latitude: number; longitude: number })[] {
	return people.filter(
		(p): p is PersonView & { latitude: number; longitude: number } => p.latitude != null && p.longitude != null,
	);
}

// Reverse geocoding (OpenStreetMap Nominatim) for people outside every zone -------------

/** The parts of a Nominatim reverse lookup's `address` that `formatPlace` reads. */
export interface NominatimAddress {
	road?: string;
	neighbourhood?: string;
	suburb?: string;
	hamlet?: string;
	village?: string;
	town?: string;
	city?: string;
	county?: string;
	state?: string;
	[key: string]: string | undefined;
}

/** "Main Street, Orem" — the street (or neighborhood) and the town. */
export function formatPlace(address: NominatimAddress, placeName?: string): string | null {
	const town = address.city ?? address.town ?? address.village ?? address.hamlet ?? address.county;
	const local = placeName ?? address.road ?? address.neighbourhood ?? address.suburb;
	const parts = [local, town].filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i);
	return parts.length ? parts.join(', ') : null;
}

// A failed lookup waits this long before it's tried again
const GEOCODE_RETRY_MS = 5 * 60_000;
const placeCache = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

/**
 * Street and town for a position, cached per ~100 m cell. Requests are serialized at
 * ≥1 s apart to respect Nominatim's usage policy.
 * @returns Null when the lookup fails (never rejects); a failed cell is asked again after five minutes.
 */
export function reverseGeocode(lat: number, lon: number, fetcher: typeof fetch = fetch): Promise<string | null> {
	const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
	const cached = placeCache.get(key);
	if (cached) return cached;

	const request = queue.then(async () => {
		try {
			const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lon}`;
			const res = await fetcher(url, { headers: { Accept: 'application/json' } });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { name?: string; address?: NominatimAddress };
			return formatPlace(body.address ?? {}, body.name || undefined);
		} catch {
			// Retried after a while, not on every render: Nominatim down shouldn't get a request a second
			setTimeout(() => placeCache.delete(key), GEOCODE_RETRY_MS);
			return null;
		}
	});
	queue = request.then(() => new Promise((r) => setTimeout(r, 1000)));
	placeCache.set(key, request);
	return request;
}

/**
 * Groups of items whose points (screen pixels) are within `radius` of a group's first item, in
 * order: what overlaps on the map at the current zoom becomes one marker.
 */
export function groupNearby<T>(items: T[], point: (item: T) => { x: number; y: number }, radius: number): T[][] {
	const groups: { at: { x: number; y: number }; items: T[] }[] = [];
	for (const item of items) {
		const p = point(item);
		const group = groups.find((g) => Math.hypot(g.at.x - p.x, g.at.y - p.y) <= radius);
		if (group) group.items.push(item);
		else groups.push({ at: p, items: [item] });
	}
	return groups.map((g) => g.items);
}
