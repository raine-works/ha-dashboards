import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { isOpeningEntity, sensorName } from './alerts';
import type { EntityWatch } from './hass-store';
import { entityArea } from './lights';
import type { Beep, Chime } from './tones';
import { isUnavailable } from './values';

/**
 * A `watch` for the locks with their contact sensors and the garage bays (what SecuritySection
 * discovers): locks, garage covers and door sensors by device class, read from the latest states,
 * so the house's other binary sensors (motion, occupancy, connectivity: several updates a second)
 * skip the scan. An entity gone from the states counts.
 */
export const securityWatch =
	(states: () => Record<string, HassEntity> | undefined): EntityWatch =>
	(id) => {
		if (id.startsWith('lock.')) return true;
		const deviceClass = id.startsWith('cover.') ? 'garage' : id.startsWith('binary_sensor.') ? 'door' : undefined;
		if (!deviceClass) return false;
		const entity = states()?.[id];
		return !entity || entity.attributes.device_class === deviceClass;
	};

export interface DoorLock {
	/** `lock.*` */
	id: string;
	/** "Front" for the "Front Entry" lock. */
	name: string;
	/** The door's contact sensor (`binary_sensor`, device class door, in the lock's area). */
	contactId?: string;
}

export interface GarageBay {
	/** `cover.*` with device class garage. */
	id: string;
	/** "West Bay" for the "West Bay Garage Door". */
	name: string;
}

const visible = (hass: Pick<HomeAssistant, 'entities'>, id: string) => !hass.entities?.[id]?.hidden;
const nameOf = (state: HassEntity) => (state.attributes.friendly_name as string | undefined) ?? state.entity_id;
/** Drop a trailing word the card's context already says ("Front Entry" in a lock card is "Front"). */
const shorten = (name: string, suffix: RegExp) => name.replace(suffix, '').trim() || name;

/**
 * Every visible `lock.*`, by entity id, each with the door contact sensor in its area: a new lock
 * shows up on every panel without a code change.
 */
export function discoverDoorLocks(
	hass: Pick<HomeAssistant, 'entities' | 'devices'>,
	states: Record<string, HassEntity>,
): DoorLock[] {
	const contacts = Object.values(states).filter(
		(s) =>
			s.entity_id.startsWith('binary_sensor.') && s.attributes.device_class === 'door' && visible(hass, s.entity_id),
	);
	return Object.values(states)
		.filter((s) => s.entity_id.startsWith('lock.') && visible(hass, s.entity_id))
		.sort((a, b) => a.entity_id.localeCompare(b.entity_id))
		.map((lock) => {
			const area = entityArea(hass, lock.entity_id);
			const contact = area ? contacts.find((c) => entityArea(hass, c.entity_id) === area) : undefined;
			return {
				id: lock.entity_id,
				name: shorten(nameOf(lock), /\s+(entry|door|lock)$/i),
				contactId: contact?.entity_id,
			};
		});
}

/** Every visible garage door (`cover.*`, device class garage), by entity id. */
export function discoverGarageBays(
	hass: Pick<HomeAssistant, 'entities'>,
	states: Record<string, HassEntity>,
): GarageBay[] {
	return Object.values(states)
		.filter(
			(s) => s.entity_id.startsWith('cover.') && s.attributes.device_class === 'garage' && visible(hass, s.entity_id),
		)
		.sort((a, b) => a.entity_id.localeCompare(b.entity_id))
		.map((cover) => ({ id: cover.entity_id, name: shorten(nameOf(cover), /\s+garage(\s+door)?$/i) }));
}

export type LockStatus = 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'jammed' | 'offline';

/**
 * A house's own list of locks whose last lock failed, before the integration had fault sensors: a
 * UI helper holding a JSON list of lock entity ids.
 */
export const LOCK_FAULTS_ENTITY = 'input_text.lock_faults';

/**
 * A lock's fault sensor, the raineworks_dashboards integration's: on when its last lock failed (it
 * went from locking back to unlocked, or jammed), off once it locks.
 */
export const lockFaultEntity = (lockId: string) => `binary_sensor.${lockId.slice(lockId.indexOf('.') + 1)}_fault`;

/** Locks whose last lock failed: those whose fault sensor is on, and those on the house's own list. */
export function lockFaultsIn(states: Record<string, HassEntity | undefined>, locks: string[]): Set<string> {
	const faults = lockFaults(states[LOCK_FAULTS_ENTITY]);
	for (const lock of locks) if (states[lockFaultEntity(lock)]?.state === 'on') faults.add(lock);
	return faults;
}

export function lockFaults(entity: HassEntity | undefined): Set<string> {
	try {
		const faults: unknown = JSON.parse(entity?.state ?? '[]');
		return new Set(Array.isArray(faults) ? faults.filter((id): id is string => typeof id === 'string') : []);
	} catch {
		return new Set();
	}
}

/**
 * What a lock button shows: the reported state, or the action on its way (`pending`). A lock
 * Home Assistant can't reach (unavailable, unknown) is `offline`, never "Unlocked": the panel
 * mustn't claim a door is unlocked when it doesn't know.
 */
export function lockStatus(state: string | undefined, pending?: 'locking' | 'unlocking', fault = false): LockStatus {
	if (state === 'jammed') return 'jammed';
	if (!state || isUnavailable(state)) return 'offline';
	if (pending) return pending;
	// A deadbolt that failed to lock (the Level Bolts report it only as unlocked again), until it locks
	if (fault && state === 'unlocked') return 'jammed';
	if (state === 'locking' || state === 'unlocking' || state === 'locked') return state;
	// unlocked, open, opening: not locked
	return 'unlocked';
}

/** `stopped`: stopped partway (open, between 1% and 99%). */
export type GarageStatus = 'open' | 'stopped' | 'closed' | 'opening' | 'closing' | 'offline';

/** An action on its way to a garage door: a move, or a stop. */
export type GaragePending = 'opening' | 'closing' | 'stopping';

/**
 * What a garage bay shows: the reported state or the move on its way (a stop on its way leaves the
 * reported move showing), `stopped` when it's open partway (`current_position`), and `offline` when
 * unreachable.
 */
export function garageStatus(state: string | undefined, pending?: GaragePending, position?: unknown): GarageStatus {
	if (!state || isUnavailable(state)) return 'offline';
	if (state === 'opening' || state === 'closing') return state;
	if (pending === 'opening' || pending === 'closing') return pending;
	if (state === 'open' && typeof position === 'number' && position > 0 && position < 100) return 'stopped';
	return state === 'open' ? 'open' : 'closed';
}

/** Whether Home Assistant has reported the pending action done. */
export function garagePendingDone(pending: GaragePending, state: string | undefined): boolean {
	if (pending === 'stopping') return state !== 'opening' && state !== 'closing';
	return pending === 'opening' ? state === 'open' : state === 'closed';
}

/** One countdown chime, and the wait until the next. */
export type CountdownBeep = Beep;

// The exit delay: a single soft E6, struck and left to ring
export const ARMING_CHIME: Chime = { notes: [{ frequency: 1318.5 }], decayMs: 90, lengthMs: 350 };
// The entry delay: a rising E6 → A6 pair, asking for attention without alarming
export const ENTRY_CHIME: Chime = {
	notes: [{ frequency: 1318.5 }, { frequency: 1760, atMs: 110 }],
	decayMs: 100,
	lengthMs: 450,
};

// The PIN pad's keys: a short tick of the same voice, digits a G6, delete a lower C6 so it sounds different
export const KEY_CHIME: Chime = { notes: [{ frequency: 1568 }], decayMs: 30, lengthMs: 120 };
export const DELETE_CHIME: Chime = { notes: [{ frequency: 1046.5 }], decayMs: 30, lengthMs: 120 };

// The last stretch of a delay chimes faster, like an alarm keypad's
const FINAL_STRETCH_MS = 10_000;

/**
 * The wall panel's audible countdown while Alarmo's exit delay (`arming`) or entry delay
 * (`pending`) runs: arming a soft chime a second, the entry delay a rising two-note chime a second,
 * each twice as fast in the last 10s. Null once the delay is over or for any other state (a triggered
 * alarm has its siren).
 */
export function countdownBeep(state: string | undefined, remainingMs: number): CountdownBeep | null {
	if (remainingMs <= 0) return null;
	const nextInMs = remainingMs <= FINAL_STRETCH_MS ? 500 : 1000;
	if (state === 'arming') return { chime: ARMING_CHIME, nextInMs };
	if (state === 'pending') return { chime: ENTRY_CHIME, nextInMs };
	return null;
}

/**
 * Everything the security system relies on carries this label in Home Assistant ("Alarm System"):
 * the sensors Alarmo watches, the door locks and the sirens. Label a new one there (and add it to
 * Alarmo, for a sensor) and the arming check covers it.
 */
export const ALARM_SYSTEM_LABEL = 'alarm_system';

/** What `alarmSystemParts` reads: the sensors, locks and sirens, and the locks' faults. */
export const ALARM_SYSTEM_WATCH: EntityWatch = (id) =>
	id === LOCK_FAULTS_ENTITY || id.startsWith('binary_sensor.') || id.startsWith('lock.') || id.startsWith('siren.');

export type SystemPartKind = 'sensor' | 'lock' | 'siren';

/**
 * `ok`: working (a lock that's locked or on its way; a siren that can sound; a sensor reporting).
 * `open` and `unlocked` are normal states, not faults: Alarmo refuses an open door itself, and
 * arming locks the doors. `offline`, `jammed` and `tampered` mean the alarm can't rely on it.
 */
export type SystemPartStatus = 'ok' | 'open' | 'unlocked' | 'offline' | 'jammed' | 'tampered';

export interface SystemPart {
	id: string;
	kind: SystemPartKind;
	/** "Front Entry", "Kitchen Window", "Living Room camera", "Kitchen siren" */
	name: string;
	status: SystemPartStatus;
}

const KIND_ORDER: SystemPartKind[] = ['sensor', 'lock', 'siren'];

/** A part's name as people say it: the area in front when the name lacks it ("Siren" → "Kitchen siren"). */
function partName(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>,
	kind: SystemPartKind,
	state: HassEntity,
): string {
	// UniFi Protect's smart detection sensor is named after its camera
	const name = sensorName(state, state.entity_id).replace(/ person detected$/i, ' camera');
	const areaId = entityArea(hass, state.entity_id);
	const area = areaId ? hass.areas?.[areaId]?.name : undefined;
	if (kind !== 'siren' || !area || name.startsWith(area)) return name;
	return `${area} ${name.toLowerCase()}`;
}

function partStatus(kind: SystemPartKind, state: HassEntity, faults: Set<string>): SystemPartStatus {
	if (isUnavailable(state.state)) return 'offline';
	if (kind === 'lock') {
		const status = lockStatus(state.state, undefined, faults.has(state.entity_id));
		if (status === 'jammed' || status === 'unlocked') return status;
		return 'ok';
	}
	if (kind === 'sensor' && state.state === 'on') {
		if (state.attributes.device_class === 'tamper') return 'tampered';
		if (isOpeningEntity(state)) return 'open';
	}
	return 'ok';
}

/**
 * Every entity labeled Alarm System, with what it's doing: sensors, then locks, then sirens, each by
 * name. Hidden entities count too: the alarm still relies on them.
 */
export function alarmSystemParts(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>,
	states: Record<string, HassEntity>,
): SystemPart[] {
	const faults = lockFaultsIn(
		states,
		Object.keys(states).filter((id) => id.startsWith('lock.')),
	);
	const parts: SystemPart[] = [];
	for (const entry of Object.values(hass.entities ?? {})) {
		if (!entry.labels?.includes(ALARM_SYSTEM_LABEL)) continue;
		const domain = entry.entity_id.split('.')[0];
		const kind: SystemPartKind | undefined =
			domain === 'lock' ? 'lock' : domain === 'siren' ? 'siren' : domain === 'binary_sensor' ? 'sensor' : undefined;
		const state = states[entry.entity_id];
		if (!kind) continue;
		parts.push(
			state
				? { id: entry.entity_id, kind, name: partName(hass, kind, state), status: partStatus(kind, state, faults) }
				: { id: entry.entity_id, kind, name: entry.name ?? entry.entity_id, status: 'offline' },
		);
	}
	return parts.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
}

/** Parts the alarm can't rely on: offline, jammed or tampered with. */
export function systemProblems(parts: SystemPart[]): SystemPart[] {
	return parts.filter((p) => p.status === 'offline' || p.status === 'jammed' || p.status === 'tampered');
}

const KIND_WORDS: Record<SystemPartKind, string> = { sensor: 'sensor', lock: 'lock', siren: '' };

/** "Front Entry lock is offline", "Kitchen siren is offline", "Keypad was tampered with" */
export function describeProblem(part: SystemPart): string {
	const word = KIND_WORDS[part.kind];
	// "Front Entry lock", "Front Entry sensor" (a door has both), but "Living Room camera", "Kitchen siren"
	const subject = word && !/ (camera|lock|sensor)$/i.test(part.name) ? `${part.name} ${word}` : part.name;
	if (part.status === 'jammed') return `${subject} is jammed`;
	if (part.status === 'tampered') return `${part.name.replace(/ tamper$/i, '')} was tampered with`;
	return `${subject} is offline`;
}

export interface SystemGroup {
	kind: SystemPartKind;
	/** Working (not offline, jammed or tampered with). */
	ready: number;
	total: number;
}

/** The snapshot by kind, in `KIND_ORDER`, leaving out kinds with none. */
export function systemGroups(parts: SystemPart[]): SystemGroup[] {
	const problems = new Set(systemProblems(parts).map((p) => p.id));
	return KIND_ORDER.map((kind) => {
		const ofKind = parts.filter((p) => p.kind === kind);
		return { kind, total: ofKind.length, ready: ofKind.filter((p) => !problems.has(p.id)).length };
	}).filter((g) => g.total > 0);
}

/**
 * The house's alarm panel: the house settings' `alarm_panel`, else the first Alarmo panel (the
 * keypad arms through `alarmo.arm`), else the first `alarm_control_panel.*`.
 */
export function findAlarmPanel(
	hass: Pick<HomeAssistant, 'entities'>,
	states: Record<string, unknown>,
	configured: string | undefined,
): string | undefined {
	if (configured) return configured;
	const panels = Object.keys(states)
		.filter((id) => id.startsWith('alarm_control_panel.'))
		.sort();
	return panels.find((id) => hass.entities?.[id]?.platform === 'alarmo') ?? panels[0];
}
