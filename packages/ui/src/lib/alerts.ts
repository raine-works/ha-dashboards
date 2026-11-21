import type { HassEntity } from '../types/homeassistant';
import type { CameraDevice } from './cameras';
import type { EntityWatch } from './hass-store';
import { isUnavailable } from './values';

export type OpeningKind = 'door' | 'window' | 'garage' | 'opening';

export interface Opening {
	entityId: string;
	name: string;
	kind: OpeningKind;
	isOpen: boolean;
	/** False while the sensor is unavailable/unknown. */
	available: boolean;
	/** ISO time of the last open/close change. */
	since: string;
	/** A cover that can be closed from the dashboard (a garage door); contact sensors can't. */
	closable: boolean;
	/** A cover on its way closed (it no longer counts as open). */
	isClosing: boolean;
}

// cover supported_features bit for close_cover
const COVER_CLOSE = 2;

const BINARY_SENSOR_KINDS: Record<string, OpeningKind> = {
	door: 'door',
	window: 'window',
	garage_door: 'garage',
	opening: 'opening',
};
const COVER_KINDS: Record<string, OpeningKind> = {
	door: 'door',
	gate: 'door',
	garage: 'garage',
	window: 'window',
};

/**
 * How old an event can be and still alert. A page that slept (a phone app in the background, a
 * laptop's tab) wakes with the states it saw hours ago, so the first update after it looks like
 * every door that opened and every ring since: only events this recent alert.
 */
export const RECENT_EVENT_MS = 60_000;

/**
 * Home Assistant's time now, from its states: the latest `last_updated` (something in the house
 * updates several times a second). Its own clock, so a device whose clock is off still alerts.
 */
export function serverNow(states: Record<string, HassEntity> | undefined): number {
	let latest = 0;
	for (const entity of Object.values(states ?? {})) {
		const at = Date.parse(entity.last_updated);
		if (at > latest) latest = at;
	}
	return latest;
}

/** An event at `time` (ISO) happened within `RECENT_EVENT_MS` of `now`. */
export const isRecent = (time: string | undefined, now: number) => !!time && Date.parse(time) >= now - RECENT_EVENT_MS;
// "Front Entry Contact" → "Front Entry"
const NAME_SUFFIX = / (contact|sensor|contact sensor)$/i;

/** Display name for a sensor: friendly name without a trailing "Contact"/"Sensor". */
export function sensorName(entity: HassEntity | undefined, entityId: string): string {
	return (entity?.attributes.friendly_name || entityId).replace(NAME_SUFFIX, '');
}

/** A door, window or garage door: a binary sensor or cover with an opening's device class. */
export function isOpeningEntity(entity: HassEntity): boolean {
	const id = entity.entity_id;
	const deviceClass = (entity.attributes.device_class as string | undefined) ?? '';
	if (id.startsWith('binary_sensor.')) return !!BINARY_SENSOR_KINDS[deviceClass];
	return id.startsWith('cover.') && !!COVER_KINDS[deviceClass];
}

/**
 * A `watch` for selectors over `discoverOpenings`: by device class, read from the latest states, so
 * the house's motion, occupancy and connectivity sensors (several updates a second between them)
 * skip them. An entity gone from the states counts, so a removed door still leaves the list.
 */
export const openingsWatch =
	(states: () => Record<string, HassEntity> | undefined): EntityWatch =>
	(id) => {
		if (!id.startsWith('binary_sensor.') && !id.startsWith('cover.')) return false;
		const entity = states()?.[id];
		return !entity || isOpeningEntity(entity);
	};

/** Doors, windows and garage doors: binary sensors and covers by device class. */
export function discoverOpenings(states: Record<string, HassEntity>): Opening[] {
	const openings: Opening[] = [];
	for (const id in states) {
		// A domain test first: the house's thousand-odd other entities cost nothing more
		const domain = id.startsWith('binary_sensor.') ? 'binary_sensor' : id.startsWith('cover.') ? 'cover' : undefined;
		if (!domain) continue;
		const entity = states[id];
		const deviceClass = entity.attributes.device_class as string | undefined;
		const kind =
			domain === 'binary_sensor'
				? BINARY_SENSOR_KINDS[deviceClass ?? '']
				: domain === 'cover'
					? COVER_KINDS[deviceClass ?? '']
					: undefined;
		if (!kind) continue;

		const isOpen = domain === 'cover' ? entity.state === 'open' || entity.state === 'opening' : entity.state === 'on';
		openings.push({
			entityId: entity.entity_id,
			name: sensorName(entity, entity.entity_id),
			kind,
			isOpen,
			available: !isUnavailable(entity.state),
			since: entity.last_changed,
			closable:
				domain === 'cover' &&
				((typeof entity.attributes.supported_features === 'number' ? entity.attributes.supported_features : 0) &
					COVER_CLOSE) !==
					0,
			isClosing: domain === 'cover' && entity.state === 'closing',
		});
	}
	return openings.sort((a, b) => a.name.localeCompare(b.name));
}

/** Whether `PanelAlerts` follows this entity: an opening, a doorbell or an alarm panel. */
export function isAlertEntity(entity: HassEntity): boolean {
	const id = entity.entity_id;
	if (id.startsWith('event.'))
		return (
			entity.attributes.device_class === 'doorbell' ||
			!!(entity.attributes.event_types as string[] | undefined)?.includes('ring')
		);
	return id.startsWith('alarm_control_panel.') || isOpeningEntity(entity);
}

const ALERT_DOMAINS = ['binary_sensor.', 'cover.', 'event.', 'alarm_control_panel.'];

/** A `watch` for the alerts' selector: by device class, as `openingsWatch`. */
export const alertsWatch =
	(states: () => Record<string, HassEntity> | undefined): EntityWatch =>
	(id) => {
		if (!ALERT_DOMAINS.some((domain) => id.startsWith(domain))) return false;
		const entity = states()?.[id];
		return !entity || isAlertEntity(entity);
	};

/**
 * Openings that went from closed to open between two snapshots, just now (`now`: Home Assistant's
 * time, `serverNow()`). Ignores first sightings, transitions out of unavailable and openings from
 * before a page slept, so reconnects, restarts and waking up don't raise alerts.
 */
export function newlyOpened(previous: Opening[] | undefined, current: Opening[], now: number): Opening[] {
	if (!previous) return [];
	const before = new Map(previous.map((o) => [o.entityId, o]));
	return current.filter((o) => {
		const was = before.get(o.entityId);
		return o.isOpen && was?.available === true && !was.isOpen && isRecent(o.since, now);
	});
}

export interface Doorbell {
	entityId: string;
	/** Event entity state: ISO time of the last event, or unknown. */
	lastEvent: string;
	eventType?: string;
}

/** Doorbell event entities (UniFi Protect et al. expose `device_class: doorbell`). */
export function discoverDoorbells(states: Record<string, HassEntity>): Doorbell[] {
	return Object.values(states)
		.filter(
			(e) =>
				e.entity_id.startsWith('event.') &&
				(e.attributes.device_class === 'doorbell' ||
					(e.attributes.event_types as string[] | undefined)?.includes('ring')),
		)
		.map((e) => ({ entityId: e.entity_id, lastEvent: e.state, eventType: e.attributes.event_type as string }));
}

/**
 * Doorbells whose event state moved to a new ring since the previous snapshot, rung just now
 * (`now`: Home Assistant's time), so a page waking up doesn't ring for one from hours ago.
 */
export function newRings(previous: Doorbell[] | undefined, current: Doorbell[], now: number): Doorbell[] {
	if (!previous) return [];
	const before = new Map(previous.map((d) => [d.entityId, d.lastEvent]));
	return current.filter(
		(d) =>
			before.has(d.entityId) &&
			before.get(d.entityId) !== d.lastEvent &&
			!isUnavailable(d.lastEvent) &&
			(d.eventType === undefined || d.eventType === 'ring') &&
			isRecent(d.lastEvent, now),
	);
}

/** The camera device sharing the doorbell's entity prefix (event.<prefix>_doorbell). */
export function cameraForDoorbell(doorbellEntityId: string, cameras: CameraDevice[]): CameraDevice | undefined {
	const objectId = doorbellEntityId.replace(/^event\./, '');
	return cameras.filter((c) => objectId.startsWith(c.id)).sort((a, b) => b.id.length - a.id.length)[0];
}

export interface AlarmPanel {
	entityId: string;
	name: string;
	state: string;
	/** Target mode while arming (Alarmo's arm_mode / next_state). */
	targetMode?: string;
	/** ISO time the state changed. */
	since?: string;
}

export type AlarmEventKind = 'triggered' | 'pending' | 'arming' | 'armed' | 'disarmed';

export interface AlarmEvent {
	panel: AlarmPanel;
	kind: AlarmEventKind;
	/** Human label for armed/arming modes, e.g. "Away". */
	modeLabel?: string;
}

/** An armed state as it's said: "Away", "Home". */
export const ALARM_MODE_LABELS: Record<string, string> = {
	armed_away: 'Away',
	armed_home: 'Home',
	armed_night: 'Night',
	armed_vacation: 'Vacation',
	armed_custom_bypass: 'Custom',
};

export function discoverAlarmPanels(states: Record<string, HassEntity>): AlarmPanel[] {
	return Object.values(states)
		.filter((e) => e.entity_id.startsWith('alarm_control_panel.'))
		.map((e) => ({
			entityId: e.entity_id,
			name: e.attributes.friendly_name || e.entity_id,
			state: e.state,
			targetMode: (e.attributes.arm_mode as string | undefined) || (e.attributes.next_state as string | undefined),
			since: e.last_changed,
		}));
}

/**
 * Alarm state changes worth announcing. Ignores first sightings and unavailability, and arming,
 * armed and disarmed from before a page slept (`now`: Home Assistant's time); a triggered alarm or
 * entry delay shows whenever it's seen, since it lasts until the state changes.
 */
export function alarmEvents(previous: AlarmPanel[] | undefined, current: AlarmPanel[], now: number): AlarmEvent[] {
	if (!previous) return [];
	const before = new Map(previous.map((p) => [p.entityId, p.state]));
	const events: AlarmEvent[] = [];
	for (const panel of current) {
		const was = before.get(panel.entityId);
		if (was === undefined || was === panel.state || isUnavailable(was) || isUnavailable(panel.state)) continue;
		const ongoing = panel.state === 'triggered' || panel.state === 'pending';
		if (!ongoing && !isRecent(panel.since, now)) continue;
		if (panel.state === 'triggered') events.push({ panel, kind: 'triggered' });
		else if (panel.state === 'pending') events.push({ panel, kind: 'pending' });
		else if (panel.state === 'arming')
			events.push({ panel, kind: 'arming', modeLabel: ALARM_MODE_LABELS[panel.targetMode ?? ''] });
		else if (panel.state.startsWith('armed_'))
			events.push({ panel, kind: 'armed', modeLabel: ALARM_MODE_LABELS[panel.state] });
		else if (panel.state === 'disarmed') events.push({ panel, kind: 'disarmed' });
	}
	return events;
}

const isOngoing = (state: string | undefined) => state === 'triggered' || state === 'pending';

/**
 * Panels that left a triggered alarm or an entry delay between two snapshots, whatever they went to.
 * Those toasts stay until the state changes, and the change that ends them isn't always announced
 * (unavailable, or from before a page slept), so they're dismissed by this instead.
 */
export function endedAlarms(previous: AlarmPanel[] | undefined, current: AlarmPanel[]): string[] {
	if (!previous) return [];
	const now = new Map(current.map((p) => [p.entityId, p.state]));
	return previous.filter((p) => isOngoing(p.state) && !isOngoing(now.get(p.entityId))).map((p) => p.entityId);
}
