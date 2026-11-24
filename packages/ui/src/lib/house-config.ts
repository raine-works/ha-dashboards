/**
 * The house's settings: what every dashboard needs to know about this house that discovery can't
 * tell (which speaker announces, which voice speaks, which sensors are the washer's). One object for
 * the whole page, given to every card as its `house` option (`house: !include ../house.yaml` in each
 * dashboards/*.yaml), so the source names no entity of its own. Anything left out falls back to
 * discovery, or leaves its feature off: a house with no settings at all still gets a dashboard.
 * Libraries read it with `houseConfig()`, components with `useHouseConfig()` (context/HouseConfig.tsx).
 *
 * @module
 */
import { BEDTIME_STEP_KINDS, type BedtimeRoutine, type BedtimeStepKind } from './bedtime';
import { deepEqual } from './hass-store';
import type { LiveInput } from './music';

/** A washer's or dryer's sensors (SmartThings: machine state, job state, time remaining). */
export interface ApplianceEntities {
	/** What the header calls it ("Washer"). */
	name: string;
	/** Entity ids of its machine state, job state and time remaining sensors. */
	machineState: string;
	jobState: string;
	timeRemaining: string;
}

/** A thermostat the climate card shows, from the house settings. */
export interface ThermostatZone {
	entityId: string;
	/** What the climate card calls it ("Main Floor"); else the entity's own name. */
	name?: string;
}

/** How the house speaks (announcements, Assist's answers). */
export interface HouseTts {
	/** The house's text-to-speech entity; else the first `tts.*` Home Assistant has. */
	engine?: string;
	/** Its voice, named on every call so a change of the engine's default never changes it. */
	voice?: string;
	/**
	 * The engine speaks an answer as it's written (Home Assistant's streaming TTS), so Assist runs
	 * speak through it themselves.
	 */
	streaming: boolean;
	/** Spoken with when the engine fails (an outage, a limit reached). */
	fallback?: string;
}

/**
 * The house's settings, parsed (`parseHouseConfig`): `laundry`, `liveInputs`, `tts`, `bedtimeRoutines` and
 * `modules` are always there (empty when unset), the rest optional.
 */
export interface HouseConfig {
	/** The speaker that announces for the house (the kitchen timer, the Daily dialog's first pick). */
	announceSpeaker?: string;
	/** The weather entity; else the first `weather.*`. */
	weather?: string;
	/** The alarm panel; else the first Alarmo panel, else the first `alarm_control_panel.*`. */
	alarmPanel?: string;
	/** The thermostats the climate card shows; else every visible `climate.*`. */
	thermostats?: ThermostatZone[];
	/** The washer and dryer; none = no laundry in the header. */
	laundry: { washer?: ApplianceEntities; dryer?: ApplianceEntities };
	/** The guest Wi-Fi's QR code image (UniFi's, per WLAN); none = no Guest Wi-Fi item. */
	guestWifiQr?: string;
	/** Live audio inputs Music Assistant plays (a turntable). */
	liveInputs: LiveInput[];
	/** The house's voice. */
	tts: HouseTts;
	/** The birthdays calendar; else the one named "Birthdays". */
	birthdayCalendar?: string;
	/**
	 * Each room's bedtime extras, by toggle: what its routine does beyond what it turns off by label
	 * (a fan turned on, a speaker in the next room), and the zone its confirm names. The confirm lists
	 * the labeled lights, TVs, speakers and curtains itself (`bedtimeRoutineFor()` in lib/bedtime.ts).
	 */
	bedtimeRoutines: Record<string, BedtimeRoutine>;
	/** Modules turned off (`false`), by id (lib/modules.ts); the rest are on while detected. */
	modules: Record<string, boolean>;
}

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const entityOf = (value: unknown, domain?: string) => {
	const id = text(value);
	if (!id || !/^[a-z_]+\.[a-z0-9_]+$/.test(id)) return undefined;
	return !domain || id.startsWith(`${domain}.`) ? id : undefined;
};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function appliance(value: unknown, name: string): ApplianceEntities | undefined {
	if (!isObject(value)) return undefined;
	const machineState = entityOf(value.machine_state, 'sensor');
	const jobState = entityOf(value.job_state, 'sensor');
	const timeRemaining = entityOf(value.time_remaining, 'sensor');
	if (!machineState || !jobState || !timeRemaining) return undefined;
	return { name: text(value.name) ?? name, machineState, jobState, timeRemaining };
}

function routine(value: unknown): BedtimeRoutine | undefined {
	if (!isObject(value)) return undefined;
	const zone = text(value.zone);
	if (!zone) return undefined;
	const steps = list(value.steps).flatMap((step) => {
		if (!isObject(step)) return [];
		const kind = text(step.kind) as BedtimeStepKind | undefined;
		const line = text(step.text);
		// An unknown kind would have no icon
		if (!kind || !BEDTIME_STEP_KINDS.includes(kind) || !line) return [];
		const actions = list(step.actions).filter((a): a is string => typeof a === 'string');
		return [{ kind, text: line, actions }];
	});
	return { zone, steps };
}

/**
 * The card's `house` option (snake_case YAML) as the house's settings: anything missing or not the
 * right shape is left out (falling back to discovery), never an error, so a typo costs one feature
 * and not the dashboard.
 */
export function parseHouseConfig(raw: unknown): HouseConfig {
	const config = isObject(raw) ? raw : {};
	const tts = isObject(config.tts) ? config.tts : {};
	const laundry = isObject(config.laundry) ? config.laundry : {};
	const thermostats = list(config.thermostats).flatMap((zone) => {
		const entityId = entityOf(isObject(zone) ? zone.entity : zone, 'climate');
		return entityId ? [{ entityId, name: isObject(zone) ? text(zone.name) : undefined }] : [];
	});
	const routines: Record<string, BedtimeRoutine> = {};
	if (isObject(config.bedtime_routines))
		for (const [toggle, value] of Object.entries(config.bedtime_routines)) {
			const parsed = (entityOf(toggle, 'switch') || entityOf(toggle, 'input_boolean')) && routine(value);
			if (parsed) routines[toggle] = parsed;
		}

	return {
		announceSpeaker: entityOf(config.announce_speaker, 'media_player'),
		weather: entityOf(config.weather, 'weather'),
		alarmPanel: entityOf(config.alarm_panel, 'alarm_control_panel'),
		thermostats: thermostats.length ? thermostats : undefined,
		laundry: { washer: appliance(laundry.washer, 'Washer'), dryer: appliance(laundry.dryer, 'Dryer') },
		guestWifiQr: entityOf(config.guest_wifi_qr, 'image'),
		liveInputs: list(config.live_inputs).flatMap((input) => {
			if (!isObject(input)) return [];
			const name = text(input.name);
			const uri = text(input.uri);
			return name && uri ? [{ name, uri, signal: entityOf(input.signal, 'binary_sensor') }] : [];
		}),
		tts: {
			engine: entityOf(tts.engine, 'tts'),
			voice: text(tts.voice),
			streaming: tts.streaming === true,
			fallback: entityOf(tts.fallback, 'tts'),
		},
		birthdayCalendar: entityOf(config.birthday_calendar, 'calendar'),
		bedtimeRoutines: routines,
		modules: isObject(config.modules)
			? Object.fromEntries(
					Object.entries(config.modules).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
				)
			: {},
	};
}

let current = parseHouseConfig(undefined);
const listeners = new Set<() => void>();
/** The card's `house` option and the integration's house settings, as given (YAML's shape). */
let fromCard: unknown;
let fromIntegration: unknown;

/** The house's settings (the card's `house` option over the integration's). */
export const houseConfig = () => current;

/**
 * The settings from both sources: the integration's (its options' House and Laundry) and the
 * card's `house` option (house.yaml), the card's winning key by key where both set one.
 */
export function mergeHouseSources(integration: unknown, card: unknown): Raw {
	return { ...(isObject(integration) ? integration : {}), ...(isObject(card) ? card : {}) };
}

function recompute() {
	const next = parseHouseConfig(mergeHouseSources(fromIntegration, fromCard));
	if (deepEqual(next, current)) return;
	current = next;
	for (const listener of listeners) listener();
}

/** Set from a card's `house` option; listeners hear only a real change. */
export function setHouseConfig(raw: unknown) {
	fromCard = raw;
	recompute();
}

/** Set from the integration's `raineworks_dashboards/info` (its `house`). */
export function setIntegrationHouse(raw: unknown) {
	fromIntegration = raw;
	recompute();
}

/** Call `listener` whenever the house settings change; returns the function that stops it. */
export function subscribeHouseConfig(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
