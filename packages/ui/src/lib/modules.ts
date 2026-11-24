/**
 * The dashboards' modules: each feature the dashboards can show, what it needs from Home Assistant,
 * and how to tell whether this house has it. One list for three jobs:
 * - the dashboards show a feature only while it's detected and not turned off (`ModuleGate`,
 *   `useModule()` in context/Modules.tsx);
 * - the house settings turn one off (`modules: { holidays: false }` in house.yaml);
 * - the capability report (`moduleReport()`), for the docs and the setup tools, says which are on,
 *   which are off and what each missing one needs.
 *
 * Detection is cheap and synchronous: a scan of the states and registries the frontend already has.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { discoverBedtimeToggles } from './bedtime';
import { discoverWindowCovers } from './covers';
import { discoverDiffusers } from './diffusers';
import { discoverFans } from './fans';
import type { EntityWatch } from './hass-store';
import type { HouseConfig } from './house-config';
import { HOUSEHOLD_LIGHT_LABEL } from './lights';
import { discoverPeople } from './people';
import { discoverPets } from './pets';
import { discoverPrinters } from './printer';
import { findAlarmPanel } from './security';
import { discoverTvs } from './tv';

/** A module's id: the key a house setting turns it off with (`modules: { holidays: false }`). */
export type ModuleId =
	| 'lighting'
	| 'bedtime'
	| 'security'
	| 'alarm'
	| 'cameras'
	| 'climate'
	| 'thermostat_presets'
	| 'covers'
	| 'fans'
	| 'diffusers'
	| 'weather'
	| 'calendar'
	| 'todo'
	| 'notifications'
	| 'people'
	| 'pets'
	| 'music'
	| 'tvs'
	| 'messages'
	| 'printer'
	| 'laundry'
	| 'energy'
	| 'daily'
	| 'assist'
	| 'holidays'
	| 'guest_wifi';

/** The parts of `hass` detection reads. */
export type ModuleHass = Pick<HomeAssistant, 'states' | 'entities' | 'devices' | 'areas' | 'services' | 'config'>;

/** What a module's detection sees: Home Assistant and the house settings. */
export interface ModuleContext {
	/** The states, registries, services and config. */
	hass: ModuleHass;
	/** The house settings (they name some modules' entities, and turn modules off). */
	house: HouseConfig;
}

/** A feature the dashboards can show. */
export interface DashboardModule {
	/** Its id. */
	id: ModuleId;
	/** Its name in the capability report ("Curtains & blinds"). */
	name: string;
	/** What it shows. */
	description: string;
	/** What it needs from Home Assistant, in words (the capability report, the docs). */
	needs: string;
	/** The domains its detection reads (`useHassSelector`'s `watch`). */
	watch: readonly string[];
	/**
	 * Whether this house has what it needs. Absent: the feature finds what it needs itself as it's
	 * shown (the energy settings, a websocket call), so it counts as there.
	 */
	detect?: (ctx: ModuleContext) => boolean;
}

const hasDomain = (states: Record<string, HassEntity | undefined>, domain: string) => {
	const prefix = `${domain}.`;
	for (const id in states) if (id.startsWith(prefix)) return true;
	return false;
};
const hasService = (hass: ModuleHass, domain: string, service?: string) =>
	!!hass.services?.[domain] && (!service || !!hass.services[domain]?.[service]);
const states = (hass: ModuleHass) => hass.states as Record<string, HassEntity>;
const registries = (hass: ModuleHass) => ({ entities: hass.entities, devices: hass.devices, areas: hass.areas });

/** Every module, in the order the report lists them. */
export const MODULES: readonly DashboardModule[] = [
	{
		id: 'lighting',
		name: 'Lighting',
		description: 'A tile per room by floor (its lights, scenes, dimmers and colors a tap away) and All off',
		needs: `Lights labeled "Household Light" (${HOUSEHOLD_LIGHT_LABEL}) in areas on floors; Stateful Scenes for scenes`,
		watch: ['light', 'switch'],
		detect: ({ hass }) =>
			Object.values(hass.entities ?? {}).some((entry) => entry.labels?.includes(HOUSEHOLD_LIGHT_LABEL)),
	},
	{
		id: 'bedtime',
		name: 'Bedtime',
		description: "Each room's bedtime toggle and Home Bedtime, asking before lights come on in a room asleep",
		needs:
			'The integration\'s Bedtime rooms (its options), or input_booleans labeled "bedtime" in each room\'s area with input_boolean.home_bedtime',
		watch: ['input_boolean', 'switch'],
		detect: ({ hass }) => Object.keys(discoverBedtimeToggles(registries(hass))).length > 0,
	},
	{
		id: 'security',
		name: 'Security',
		description: 'Door locks with their contact sensors, garage doors, and every opening left open',
		needs: 'lock.* entities, garage covers, door/window binary sensors',
		watch: ['lock', 'cover', 'binary_sensor'],
		detect: ({ hass }) => hasDomain(hass.states, 'lock') || hasDomain(hass.states, 'cover'),
	},
	{
		id: 'alarm',
		name: 'Alarm',
		description: 'Arm and disarm with a PIN pad, exit and entry countdowns, and the arming check',
		needs: 'The Alarmo integration (an alarm_control_panel and the alarmo.arm action)',
		watch: ['alarm_control_panel'],
		detect: ({ hass, house }) => !!findAlarmPanel(hass, hass.states, house.alarmPanel) && hasService(hass, 'alarmo'),
	},
	{
		id: 'cameras',
		name: 'Cameras',
		description: 'Live views (WebRTC), snapshots, smart detections, talkback and recorded clips',
		needs: 'camera.* entities; UniFi Protect for detections, talkback and clips',
		watch: ['camera'],
		detect: ({ hass }) => hasDomain(hass.states, 'camera'),
	},
	{
		id: 'climate',
		name: 'Thermostats',
		description: "Each thermostat's setpoint and mode",
		needs: 'climate.* entities (house.yaml `thermostats` to pick and name them)',
		watch: ['climate'],
		detect: ({ hass, house }) => !!house.thermostats?.length || hasDomain(hass.states, 'climate'),
	},
	{
		id: 'thermostat_presets',
		name: 'Thermostat presets',
		description: 'A house-wide Home / Away / Sleep preset over the thermostats',
		needs: 'input_select.thermostat_preset and script.adjust_thermostat_temperature, with the preset automation',
		watch: ['input_select'],
		detect: ({ hass }) => !!hass.states['input_select.thermostat_preset'],
	},
	{
		id: 'covers',
		name: 'Curtains & blinds',
		description: 'Every curtain, blind and shade, with positions estimated while they move',
		needs: 'cover.* entities with device class curtain, blind, shade or shutter',
		watch: ['cover'],
		detect: ({ hass }) => discoverWindowCovers(registries(hass), states(hass)).length > 0,
	},
	{
		id: 'fans',
		name: 'Fans',
		description: 'Every fan: speed, oscillation and presets',
		needs: 'fan.* entities',
		watch: ['fan'],
		detect: ({ hass }) => discoverFans(registries(hass), states(hass)).length > 0,
	},
	{
		id: 'diffusers',
		name: 'Scent diffusers',
		description: 'Whole-home diffusers: oil, fragrance and Quick scent',
		needs: 'The EverScent integration (raine-works/ha-everscent)',
		watch: ['switch', 'sensor', 'binary_sensor', 'button'],
		detect: ({ hass }) => discoverDiffusers(registries(hass), states(hass)).length > 0,
	},
	{
		id: 'weather',
		name: 'Weather',
		description: 'Now in the header; hourly charts, details and the 10-day forecast in its dialog',
		needs: 'A weather.* entity with forecasts',
		watch: ['weather'],
		detect: ({ hass, house }) => (house.weather ? !!hass.states[house.weather] : hasDomain(hass.states, 'weather')),
	},
	{
		id: 'calendar',
		name: 'Calendar',
		description: 'The next event in the header; a month grid and day agenda',
		needs: 'calendar.* entities',
		watch: ['calendar'],
		detect: ({ hass }) => hasDomain(hass.states, 'calendar'),
	},
	{
		id: 'todo',
		name: 'To-do',
		description: 'To-do lists with swipes, drag to reorder, due dates and assignment to household members',
		needs: 'todo.* entities (Local To-do, Shopping list…)',
		watch: ['todo'],
		detect: ({ hass }) => hasDomain(hass.states, 'todo'),
	},
	{
		id: 'notifications',
		name: 'Notifications',
		description: "Home Assistant's persistent notifications, swiped away",
		needs: 'Nothing: part of Home Assistant',
		watch: [],
	},
	{
		id: 'people',
		name: 'People',
		description: "Who's home in the header; a map of everyone with their phones' batteries",
		needs: 'person.* entities with a device tracker (the Companion app)',
		watch: ['person'],
		detect: ({ hass }) => discoverPeople(states(hass)).length > 0,
	},
	{
		id: 'pets',
		name: 'Pets',
		description: 'Litter-Robot and Feeder-Robot: visits, weight and food charts, Cycle and Give snack',
		needs: 'The Litter-Robot integration, with a person.* per pet',
		watch: ['person', 'sensor'],
		detect: ({ hass }) => discoverPets(states(hass)).length > 0,
	},
	{
		id: 'music',
		name: 'Music',
		description: 'Now playing, browse and search, the queue, speaker groups, live inputs and Party mode',
		needs: 'The Music Assistant integration',
		watch: ['media_player'],
		detect: ({ hass }) => Object.values(hass.states).some((s) => s?.attributes?.mass_player_type != null),
	},
	{
		id: 'tvs',
		name: 'TVs',
		description: "Power, what's on with its poster, volume, the TV's apps and inputs, and a remote",
		needs: 'The Raineworks TV integration (raine-works/ha-googletv)',
		watch: ['media_player'],
		detect: ({ hass }) => discoverTvs(states(hass), hass).length > 0,
	},
	{
		id: 'messages',
		name: 'Messages',
		description: 'Announce on the speakers (typed or recorded), message phones, print notes',
		needs: 'Music Assistant speakers, or script.notify_people for phones, or a receipt printer',
		watch: ['media_player'],
		detect: (ctx) =>
			!!MODULES.find((m) => m.id === 'music')?.detect?.(ctx) ||
			hasService(ctx.hass, 'script', 'notify_people') ||
			discoverPrinters(registries(ctx.hass)).length > 0,
	},
	{
		id: 'printer',
		name: 'Receipt printer',
		description: 'Print to-do lists and notes',
		needs: 'An ESC/POS printer (the escpos_printer notify platform)',
		watch: ['sensor', 'binary_sensor'],
		detect: ({ hass }) => discoverPrinters(registries(hass)).length > 0,
	},
	{
		id: 'laundry',
		name: 'Laundry',
		description: 'The washer and dryer in the header while they run, and a toast when one is done',
		needs: 'house.yaml `laundry`: each machine’s machine state, job state and time remaining sensors (SmartThings)',
		watch: ['sensor'],
		detect: ({ hass, house }) =>
			[house.laundry.washer, house.laundry.dryer].some((machine) => machine && hass.states[machine.machineState]),
	},
	{
		id: 'energy',
		name: 'Energy',
		description: 'Live draw split by circuit, today / week / month charts, and where it went',
		needs: "Home Assistant's Energy settings with a grid meter (and devices for circuits)",
		watch: [],
	},
	{
		id: 'daily',
		name: 'Daily',
		description: "The daily brief (weather, today's events, the news), a daily affirmation and a scripture study",
		needs:
			'The daily brief package: sensor.daily_brief and script.daily_brief_generate (an AI task and a conversation agent that can search)',
		watch: ['sensor'],
		detect: ({ hass }) => !!hass.states['sensor.daily_brief'] && hasService(hass, 'script', 'daily_brief_generate'),
	},
	{
		id: 'assist',
		name: 'Assist',
		description: "Voice and typed commands through Home Assistant's preferred Assist pipeline, with the glow",
		needs: 'An Assist pipeline with speech to text (and text to speech for spoken answers)',
		watch: [],
		detect: ({ hass }) => !hass.config?.components || hass.config.components.includes('assist_pipeline'),
	},
	{
		id: 'holidays',
		name: 'Holidays',
		description: 'Easter eggs in the days around each holiday and on birthdays: characters, confetti, sounds',
		needs: 'Nothing (birthdays: a calendar named "Birthdays")',
		watch: [],
	},
	{
		id: 'guest_wifi',
		name: 'Guest Wi-Fi',
		description: "The guest network's QR code, on the wall panels",
		needs: 'house.yaml `guest_wifi_qr`: an image entity with the QR code (UniFi’s, enabled)',
		watch: ['image'],
		detect: ({ hass, house }) => !!house.guestWifiQr && !!hass.states[house.guestWifiQr],
	},
];

const BY_ID = new Map(MODULES.map((m) => [m.id, m]));

/**
 * The module with this id.
 * @throws When no module has it (a typed id always has one).
 */
export const moduleById = (id: ModuleId): DashboardModule => {
	const found = BY_ID.get(id);
	if (!found) throw new Error(`Unknown dashboard module: ${id}`);
	return found;
};

/** A module's state in a house (see `moduleState`). */
export type ModuleState = 'on' | 'missing' | 'off';

/**
 * A module's state in this house: `on`; `missing` (this house hasn't what it needs); `off` (turned
 * off in the house settings).
 */
export function moduleState(id: ModuleId, ctx: ModuleContext): ModuleState {
	const module = moduleById(id);
	if (ctx.house.modules[id] === false) return 'off';
	return !module.detect || module.detect(ctx) ? 'on' : 'missing';
}

/** Whether the dashboards show a module: detected and not turned off. */
export const isModuleOn = (id: ModuleId, ctx: ModuleContext) => moduleState(id, ctx) === 'on';

/** A module's row in the capability report: its `DashboardModule` words and its state in this house. */
export interface ModuleReportRow {
	/** The module's id. */
	id: ModuleId;
	/** Its name. */
	name: string;
	/** Its state in this house. */
	state: ModuleState;
	/** What it shows. */
	description: string;
	/** What it needs from Home Assistant. */
	needs: string;
}

/** Every module's state in this house, for the capability report. */
export const moduleReport = (ctx: ModuleContext): ModuleReportRow[] =>
	MODULES.map(({ id, name, description, needs }) => ({ id, name, description, needs, state: moduleState(id, ctx) }));

/** Whether an id is a module's (a house setting naming one that doesn't exist is ignored). */
export const isModuleId = (id: string): id is ModuleId => BY_ID.has(id as ModuleId);

/** What a `watch` for one module reads. */
export const moduleWatch = (id: ModuleId): EntityWatch => moduleById(id).watch;
