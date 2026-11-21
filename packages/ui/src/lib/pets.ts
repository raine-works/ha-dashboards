import type { HassEntity } from '../types/homeassistant';
import type { EntityWatch } from './hass-store';
import { initialsFor } from './people';
import { dayKey, formatTime, startOfDay } from './time';
import { isUnavailable } from './values';

/** Matches the Badge/Progress status variants. */
export type Tone = 'success' | 'info' | 'warning' | 'destructive' | 'muted';

export interface Measurement {
	value: number;
	unit: string;
}

export interface PetView {
	/** The pet's `person.*` entity (no device trackers). */
	entityId: string;
	/** The id shared by its sensors: `sensor.<id>_visits_today`, `sensor.<id>_weight`. */
	id: string;
	name: string;
	initials: string;
	picture?: string;
	/** Litter box visits since midnight. */
	visitsToday: number | null;
	weight: Measurement | null;
}

export interface LitterBoxView {
	entityId: string;
	name: string;
	/** Litter-Robot status code (`rdy`, `ccp`, `dfs`, ...). */
	status: string;
	statusLabel: string;
	tone: Tone;
	/** Percent full. */
	wasteDrawer: number | null;
	wasteTone: Tone;
	/** Percent of litter left. */
	litterLevel: number | null;
	litterTone: Tone;
	/** Running a clean cycle, or about to (the vacuum's `cleaning`, or a cleaning status code). */
	cycling: boolean;
	/** Home Assistant can reach it (a clean cycle can start). */
	available: boolean;
	/** `button.<device>_reset` (Litter-Robot 4), if it has one. */
	resetButton: string | null;
	/** The reset button's state: when it was last pressed. */
	lastReset: string | null;
}

export interface FeederView {
	/** The food level sensor; its prefix names the device. */
	entityId: string;
	name: string;
	/** Percent of food left in the hopper. */
	foodLevel: number | null;
	foodTone: Tone;
	lastFeeding: string | null;
	nextFeeding: string | null;
	dispensedToday: Measurement | null;
	/** `sensor.<device>_food_dispensed_today`, for its daily statistics (null without one). */
	dispensedId: string | null;
	snackButton: string | null;
	/** When the snack button was last pressed (a button's state is its last press). */
	lastSnack: string | null;
}

const UNAVAILABLE = new Set(['unavailable', 'unknown', '']);

const num = (entity: HassEntity | undefined): number | null => {
	if (!entity || UNAVAILABLE.has(entity.state)) return null;
	const n = Number.parseFloat(entity.state);
	return Number.isFinite(n) ? n : null;
};

const measurement = (entity: HassEntity | undefined): Measurement | null => {
	const value = num(entity);
	return value == null ? null : { value, unit: String(entity?.attributes.unit_of_measurement ?? '') };
};

const timestamp = (entity: HassEntity | undefined): string | null =>
	entity && !UNAVAILABLE.has(entity.state) && Number.isFinite(Date.parse(entity.state)) ? entity.state : null;

/** "Litter Robot Litter box" → "Litter Robot"; "Feeder Robot  Food level" → "Feeder Robot". */
const deviceName = (entity: HassEntity | undefined, suffix: RegExp, fallback: string) =>
	(entity?.attributes.friendly_name ?? fallback).replace(suffix, '').replace(/\s+/g, ' ').trim() || fallback;

/**
 * Pets: `person.*` entities without device trackers that have Litter-Robot per-pet sensors
 * (`sensor.<id>_visits_today` or `sensor.<id>_weight`), sorted by name.
 */
const PET_CARE_SENSOR =
	/^sensor\..+_(visits_today|weight|status_code|waste_drawer|litter_level|food_level|last_feeding|next_feeding|food_dispensed_today)$/;
/** What the pet discovery functions read (pets, Litter-Robots, Feeder-Robots). */
export const PET_CARE_WATCH: EntityWatch = (id) => /^(person|vacuum|button)\./.test(id) || PET_CARE_SENSOR.test(id);

export function discoverPets(states: Record<string, HassEntity>): PetView[] {
	return Object.values(states)
		.filter((s) => {
			if (!s.entity_id.startsWith('person.')) return false;
			const trackers = s.attributes.device_trackers;
			if (Array.isArray(trackers) && trackers.length > 0) return false;
			const id = s.entity_id.slice('person.'.length);
			return Boolean(states[`sensor.${id}_visits_today`] || states[`sensor.${id}_weight`]);
		})
		.map((s) => {
			const id = s.entity_id.slice('person.'.length);
			const name = s.attributes.friendly_name ?? id;
			const visits = num(states[`sensor.${id}_visits_today`]);
			return {
				entityId: s.entity_id,
				id,
				name,
				initials: initialsFor(name),
				picture: s.attributes.entity_picture,
				visitsToday: visits == null ? null : Math.round(visits),
				weight: measurement(states[`sensor.${id}_weight`]),
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

// Status codes while a clean cycle is waiting, running or emptying
const CYCLE_STATUS = new Set(['ccp', 'cst', 'ec']);

// Litter-Robot status codes (labels from Home Assistant's litterrobot integration)
const LITTER_STATUS: Record<string, { label: string; tone: Tone }> = {
	rdy: { label: 'Ready', tone: 'success' },
	ccc: { label: 'Clean cycle complete', tone: 'success' },
	ccp: { label: 'Cleaning', tone: 'info' },
	cd: { label: 'Cat detected', tone: 'info' },
	cst: { label: 'Waiting to clean', tone: 'info' },
	csi: { label: 'Cat sensor interrupted', tone: 'info' },
	ec: { label: 'Emptying', tone: 'info' },
	pwru: { label: 'Powering up', tone: 'info' },
	pwrd: { label: 'Powering down', tone: 'info' },
	df1: { label: 'Drawer almost full (2 cycles left)', tone: 'warning' },
	df2: { label: 'Drawer almost full (1 cycle left)', tone: 'warning' },
	p: { label: 'Paused', tone: 'warning' },
	off: { label: 'Off', tone: 'warning' },
	br: { label: 'Bonnet removed', tone: 'destructive' },
	dfs: { label: 'Drawer full', tone: 'destructive' },
	sdf: { label: 'Drawer full', tone: 'destructive' },
	csf: { label: 'Cat sensor fault', tone: 'destructive' },
	scf: { label: 'Cat sensor fault', tone: 'destructive' },
	dhf: { label: 'Dump and home position fault', tone: 'destructive' },
	dpf: { label: 'Dump position fault', tone: 'destructive' },
	hpf: { label: 'Home position fault', tone: 'destructive' },
	otf: { label: 'Motor overloaded', tone: 'destructive' },
	pd: { label: 'Pinch detected', tone: 'destructive' },
	spf: { label: 'Pinch detected', tone: 'destructive' },
	offline: { label: 'Offline', tone: 'destructive' },
};

export function litterStatus(code: string | undefined): { label: string; tone: Tone } {
	if (!code || UNAVAILABLE.has(code)) return { label: 'Unknown', tone: 'muted' };
	return LITTER_STATUS[code] ?? { label: code.toUpperCase(), tone: 'muted' };
}

/** Waste drawer: amber from 80% full, red from 95%. */
export function wasteTone(percent: number | null): Tone {
	if (percent == null) return 'muted';
	if (percent >= 95) return 'destructive';
	if (percent >= 80) return 'warning';
	return 'success';
}

/** Supplies (litter, food): amber at 20% or less, red at 10% or less. */
export function supplyTone(percent: number | null): Tone {
	if (percent == null) return 'muted';
	if (percent <= 10) return 'destructive';
	if (percent <= 20) return 'warning';
	return 'success';
}

/** Litter-Robots: `vacuum.<device>_litter_box` with `sensor.<device>_status_code`, `_waste_drawer`, `_litter_level`. */
export function discoverLitterBoxes(states: Record<string, HassEntity>): LitterBoxView[] {
	return Object.values(states)
		.filter((s) => /^vacuum\..+_litter_box$/.test(s.entity_id))
		.map((s) => {
			const device = s.entity_id.slice('vacuum.'.length, -'_litter_box'.length);
			const status = states[`sensor.${device}_status_code`]?.state ?? '';
			const { label, tone } = litterStatus(status);
			const wasteDrawer = num(states[`sensor.${device}_waste_drawer`]);
			const litterLevel = num(states[`sensor.${device}_litter_level`]);
			const resetButton = `button.${device}_reset`;
			return {
				entityId: s.entity_id,
				name: deviceName(s, / litter box$/i, 'Litter Box'),
				status,
				statusLabel: label,
				tone,
				wasteDrawer,
				wasteTone: wasteTone(wasteDrawer),
				litterLevel,
				litterTone: supplyTone(litterLevel),
				cycling: s.state === 'cleaning' || CYCLE_STATUS.has(status),
				available: !isUnavailable(s.state),
				resetButton: states[resetButton] ? resetButton : null,
				lastReset: states[resetButton]?.state ?? null,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Feeder-Robots: `sensor.<device>_food_level` with `_last_feeding`, `_next_feeding`, `_food_dispensed_today`, `button.<device>_give_snack`. */
export function discoverFeeders(states: Record<string, HassEntity>): FeederView[] {
	return Object.values(states)
		.filter((s) => /^sensor\..+_food_level$/.test(s.entity_id))
		.map((s) => {
			const device = s.entity_id.slice('sensor.'.length, -'_food_level'.length);
			const snackButton = `button.${device}_give_snack`;
			const foodLevel = num(s);
			return {
				entityId: s.entity_id,
				name: deviceName(s, / food level$/i, 'Feeder'),
				foodLevel,
				foodTone: supplyTone(foodLevel),
				lastFeeding: timestamp(states[`sensor.${device}_last_feeding`]),
				nextFeeding: timestamp(states[`sensor.${device}_next_feeding`]),
				dispensedToday: measurement(states[`sensor.${device}_food_dispensed_today`]),
				dispensedId: states[`sensor.${device}_food_dispensed_today`] ? `sensor.${device}_food_dispensed_today` : null,
				snackButton: states[snackButton] ? snackButton : null,
				lastSnack: timestamp(states[snackButton]),
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Anything worth a glance: a litter box or feeder that isn't fine. */
export function petCareNeedsAttention(litterBoxes: LitterBoxView[], feeders: FeederView[]): boolean {
	const bad = (tone: Tone) => tone === 'warning' || tone === 'destructive';
	return (
		litterBoxes.some((l) => bad(l.tone) || bad(l.wasteTone) || bad(l.litterTone)) ||
		feeders.some((f) => bad(f.foodTone))
	);
}

/** "in 12 min", "in 5 hr", "in 2 days" (or "now" once it's due). */
export function formatUntil(iso: string, now: number): string {
	const minutes = Math.ceil((Date.parse(iso) - now) / 60_000);
	if (!Number.isFinite(minutes) || minutes <= 0) return 'now';
	if (minutes < 60) return `in ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `in ${hours} hr`;
	const days = Math.round(hours / 24);
	return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** "8:00 AM" (today), "Mon 8:00 AM" (another day). */
export function formatClockTime(iso: string, now: number): string {
	const date = new Date(iso);
	const time = formatTime(date);
	return new Date(now).toDateString() === date.toDateString()
		? time
		: `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
}

/** "11.6 lb" */
export function formatMeasurement(m: Measurement, digits = 1): string {
	const value = Number.isInteger(m.value) ? String(m.value) : m.value.toFixed(digits);
	return m.unit ? `${value} ${m.unit}` : value;
}

/** A pet's Litter-Robot sensors, whose statistics the charts read: visits a day and weight. */
export const petStatIds = (pet: Pick<PetView, 'id'>) => ({
	visits: `sensor.${pet.id}_visits_today`,
	weight: `sensor.${pet.id}_weight`,
});

/** `recorder/statistics_during_period` rows by statistic id (daily). */
export type DailyStatRows = Record<
	string,
	{ start: number; change?: number | null; mean?: number | null }[] | undefined
>;

/** A chart series: its key in the rows, the statistic it reads, and which number (a day's `change` or `mean`). */
export interface DailySeries {
	key: string;
	statId: string;
	type: 'change' | 'mean';
}

export type DailyRow = { start: number } & Record<string, number | null>;

/** The local midnights of the last `days` days, oldest first, today last. */
export function lastDays(days: number, now: Date): number[] {
	const today = startOfDay(now);
	return Array.from({ length: days }, (_, i) =>
		new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i)).getTime(),
	);
}

/**
 * A daily chart's rows: for each of the last `days` days, each series' value that day (visits'
 * `change`, weight's `mean`), matched by local day; null when there's no statistic for it.
 */
export function dailyRows(rows: DailyStatRows, series: DailySeries[], days: number, now: Date): DailyRow[] {
	const byDay = series.map((s) => new Map((rows[s.statId] ?? []).map((r) => [dayKey(new Date(r.start)), r[s.type]])));
	return lastDays(days, now).map((start) => {
		const key = dayKey(new Date(start));
		const row: DailyRow = { start };
		series.forEach((s, i) => {
			const value = byDay[i].get(key);
			row[s.key] = typeof value === 'number' && Number.isFinite(value) ? value : null;
		});
		return row;
	});
}
