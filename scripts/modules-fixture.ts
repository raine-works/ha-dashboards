// The dashboards' modules for the integration's setup tools, which run inside Home Assistant (Python):
// - custom_components/raineworks_dashboards/modules.json: each module's id, name, what it shows and what
//   it needs (lib/modules.ts's words), shipped with the integration, so its capability report says the
//   same as the docs and the dashboards;
// - tests/fixtures/modules.json: made-up houses with what the TypeScript makes of them (each module's
//   state, the parsed house settings, which settings were understood), which the Python port of
//   detection (modules.py) is tested against.
// `bun scripts/modules-fixture.ts` writes both; modules-fixture.test.ts fails when either says something else.
import { resolve } from 'node:path';
import { checkHouseSettings } from '../packages/mcp/src/tools';
import { parseHouseConfig } from '../packages/ui/src/lib/house-config';
import { MODULES, type ModuleHass, moduleReport } from '../packages/ui/src/lib/modules';

export const MODULES_JSON = resolve(import.meta.dir, '../custom_components/raineworks_dashboards/modules.json');
export const FIXTURE = resolve(import.meta.dir, '../tests/fixtures/modules.json');

type Row = Record<string, unknown>;
type House = {
	states?: Record<string, Row>;
	entities?: Record<string, Row>;
	devices?: Record<string, Row>;
	areas?: Record<string, Row>;
	services?: Record<string, Record<string, Row>>;
	config?: { components?: string[] };
};

const state = (entity_id: string, attributes: Row = {}, value = 'on') => ({ entity_id, state: value, attributes });
const states = (...list: ReturnType<typeof state>[]) => Object.fromEntries(list.map((s) => [s.entity_id, s]));
const entry = (entity_id: string, extra: Row = {}) => ({ entity_id, labels: [], hidden: false, ...extra });
const entries = (...list: ReturnType<typeof entry>[]) => Object.fromEntries(list.map((e) => [e.entity_id, e]));
const WITH_ASSIST = { components: ['assist_pipeline'] };

/** Made-up houses, each turning on (or not) a few modules' detection paths. */
const HOUSES: { name: string; hass: House; house?: unknown }[] = [
	{ name: 'nothing at all', hass: { states: {}, entities: {}, devices: {}, areas: {}, services: {}, config: {} } },
	{
		name: 'a little of everything',
		hass: {
			states: states(
				state('light.desk'),
				state('lock.front', {}, 'locked'),
				state('camera.porch'),
				state('climate.hall', {}, 'heat'),
				state('input_select.thermostat_preset', {}, 'home'),
				state('cover.office', { device_class: 'blind' }, 'open'),
				state('fan.tower'),
				state('switch.mechanical_power'),
				state('weather.home', {}, 'sunny'),
				state('calendar.family', {}, 'off'),
				state('todo.chores', {}, '2'),
				state('person.alex', { device_trackers: ['device_tracker.alex_phone'] }, 'home'),
				state('person.whiskers', { device_trackers: [] }, 'unknown'),
				state('sensor.whiskers_weight', {}, '4.2'),
				state('media_player.kitchen', { mass_player_type: 'player' }, 'idle'),
				state('media_player.den_tv', { device_class: 'tv' }, 'off'),
				state('alarm_control_panel.house', {}, 'disarmed'),
				state('sensor.daily_brief', {}, '2026-11-26T07:00:00'),
			),
			entities: entries(
				entry('light.desk', { labels: ['household_light'], area_id: 'office' }),
				entry('switch.office_bedtime', { labels: ['bedtime'], area_id: 'office' }),
				entry('switch.mechanical_power', { platform: 'everscent', device_id: 'diffuser' }),
				entry('notify.kitchen_printer', { platform: 'escpos_printer', device_id: 'printer' }),
				entry('media_player.den_tv', { platform: 'googletv' }),
				entry('alarm_control_panel.house', { platform: 'alarmo' }),
			),
			devices: { diffuser: { id: 'diffuser', name: 'Mechanical', area_id: null }, printer: { id: 'printer' } },
			areas: { office: { area_id: 'office', name: 'Office', floor_id: 'main' } },
			services: { alarmo: { arm: {} }, script: { notify_people: {}, daily_brief_generate: {} } },
			config: WITH_ASSIST,
		},
	},
	{
		name: 'hidden, wrong kinds and missing pieces',
		hass: {
			states: states(
				state('cover.garage', { device_class: 'garage' }, 'closed'),
				state('cover.hidden_blind', { device_class: 'blind' }, 'open'),
				state('fan.hidden'),
				state('switch.other_power'),
				state('switch.hidden_power'),
				state('person.sam', {}, 'home'),
				state('media_player.box', { device_class: 'tv', mass_player_type: 'player' }, 'off'),
				state('media_player.hidden_tv', { device_class: 'tv' }, 'off'),
				state('media_player.other_tv', { device_class: 'tv' }, 'off'),
				state('media_player.speaker', { mass_player_type: null }, 'idle'),
				state('alarm_control_panel.other', {}, 'disarmed'),
				state('sensor.daily_brief', {}, 'unknown'),
			),
			entities: entries(
				entry('light.indicator', { labels: [], hidden: true }),
				entry('input_boolean.no_area_bedtime', { labels: ['bedtime'] }),
				entry('switch.hidden_bedtime', { labels: ['bedtime'], hidden: true, area_id: 'den' }),
				entry('cover.hidden_blind', { hidden: true }),
				entry('fan.hidden', { hidden: true }),
				entry('switch.other_power', { platform: 'tplink' }),
				entry('switch.hidden_power', { platform: 'everscent', hidden: true }),
				entry('notify.hidden_printer', { platform: 'escpos_printer', hidden: true }),
				entry('media_player.hidden_tv', { platform: 'googletv', hidden: true }),
				entry('media_player.other_tv', { platform: 'cast' }),
			),
			devices: {},
			areas: { den: { area_id: 'den', name: 'Den' } },
			// Alarmo isn't installed; the daily brief's script is missing
			services: { script: {} },
			config: { components: ['light'] },
		},
	},
	{
		name: 'found by device, a group, labeled TVs and settings',
		hass: {
			states: states(
				state('cover.curtains', { device_class: 'curtain', entity_id: ['cover.left', 'cover.right'] }, 'open'),
				state('cover.left', { device_class: 'curtain' }, 'open'),
				state('cover.right', { device_class: 'curtain' }, 'open'),
				state('media_player.labeled_tv', { device_class: 'tv' }, 'off'),
				state('media_player.unlabeled_tv', { device_class: 'tv' }, 'off'),
				state('sensor.washer_machine_state', {}, 'run'),
				state('image.guest_wifi'),
				state('weather.other', {}, 'rainy'),
			),
			entities: entries(
				entry('input_boolean.den_bedtime', { labels: ['bedtime'], device_id: 'den_switch' }),
				entry('media_player.labeled_tv', { platform: 'googletv', labels: ['household_tv'] }),
				entry('media_player.unlabeled_tv', { platform: 'googletv' }),
			),
			devices: { den_switch: { id: 'den_switch', area_id: 'den' } },
			areas: { den: { area_id: 'den', name: 'Den' } },
			services: { alarmo: { arm: {} } },
		},
		house: {
			alarm_panel: 'alarm_control_panel.configured',
			thermostats: ['climate.upstairs'],
			weather: 'weather.home',
			laundry: {
				washer: {
					machine_state: 'sensor.washer_machine_state',
					job_state: 'sensor.washer_job_state',
					time_remaining: 'sensor.washer_time_remaining',
				},
			},
			guest_wifi_qr: 'image.guest_wifi',
			modules: { holidays: false, covers: false, tvs: 'no' },
		},
	},
	{
		// JavaScript counts an empty object or list as there: Alarmo with no actions listed is still Alarmo,
		// and an empty components list is a list without Assist
		name: 'empty but there',
		hass: {
			states: states(state('alarm_control_panel.house', {}, 'disarmed')),
			entities: {},
			services: { alarmo: {}, script: { notify_people: {} } },
			config: { components: [] },
		},
	},
];

/** House settings, well and badly written, for the parser and the settings check. */
const SETTINGS: unknown[] = [
	undefined,
	'not a mapping',
	['a', 'list'],
	{},
	{
		announce_speaker: ' media_player.kitchen ',
		weather: 'weather.home',
		alarm_panel: 'alarm_control_panel.alarmo',
		thermostats: [{ entity: 'climate.main', name: 'Main Floor' }, 'climate.upstairs', { entity: 'light.nope' }, 42],
		laundry: {
			washer: {
				name: 'Washer',
				machine_state: 'sensor.w_machine',
				job_state: 'sensor.w_job',
				time_remaining: 'sensor.w_time',
			},
			dryer: { machine_state: 'sensor.d_machine', job_state: 'sensor.d_job' },
		},
		guest_wifi_qr: 'image.guest',
		live_inputs: [
			{ name: 'Turntable', uri: 'sendspin_source://audio_source/abc', signal: 'binary_sensor.signal' },
			{ name: 'No uri' },
			{ name: 'Tape', uri: 'x://tape', signal: 'sensor.wrong_domain' },
		],
		tts: { engine: 'tts.grok', voice: ' eve ', streaming: true, fallback: 'tts.google' },
		birthday_calendar: 'calendar.birthdays',
		bedtime_routines: {
			'switch.den_bedtime': {
				zone: 'Den',
				steps: [
					{ kind: 'fan', text: 'Tower fan on', actions: ['fan.turn_on', 7] },
					{ kind: 'dance', text: 'Not a kind' },
					{ kind: 'lights' },
				],
			},
			'input_boolean.nursery_bedtime': { zone: 'Nursery' },
			'light.not_a_toggle': { zone: 'Nope', steps: [] },
			'switch.no_zone': { steps: [] },
		},
		modules: { holidays: false, music: true, cameras: 'no' },
	},
	{
		announce_speaker: 'light.kitchen',
		weather: 'weather.home\n',
		guest_wifi_qr: 'Image.Guest',
		alarm_panel: '',
		thermostats: 'climate.main',
		laundry: 'washer',
		live_inputs: { name: 'Turntable' },
		tts: { streaming: 'yes', engine: 'tts.' },
		bedtime_routines: ['switch.den_bedtime'],
		modules: ['holidays'],
		unknown_setting: true,
		nothing: null,
	},
];

/** What the integration ships: each module's words, in the report's order. */
export const moduleWords = () => MODULES.map(({ id, name, description, needs }) => ({ id, name, description, needs }));

/** The made-up houses and settings, with what the dashboards make of them. */
export function moduleCases() {
	return {
		houses: HOUSES.map(({ name, hass, house }) => ({
			name,
			hass,
			house: house ?? {},
			states: Object.fromEntries(
				moduleReport({ hass: hass as unknown as ModuleHass, house: parseHouseConfig(house ?? {}) }).map((row) => [
					row.id,
					row.state,
				]),
			),
		})),
		settings: SETTINGS.map((raw) => ({
			raw: raw ?? null,
			// As JSON writes it: unset values left out
			parsed: JSON.parse(JSON.stringify(parseHouseConfig(raw))),
			check: checkHouseSettings(raw ?? {}),
		})),
	};
}

/** The two files' content, by path, as `bun scripts/modules-fixture.ts` writes them. */
export const moduleFiles = () => ({ [MODULES_JSON]: moduleWords(), [FIXTURE]: moduleCases() });

if (import.meta.main) {
	const files = moduleFiles();
	for (const [path, content] of Object.entries(files)) await Bun.write(path, `${JSON.stringify(content)}\n`);
	// In the repository's JSON style, so `bun run lint` passes them as written
	Bun.spawnSync(['bun', 'x', 'biome', 'format', '--write', ...Object.keys(files)], { stdout: 'ignore' });
	console.log(
		`${MODULES_JSON}: ${MODULES.length} modules\n${FIXTURE}: ${HOUSES.length} houses, ${SETTINGS.length} settings`,
	);
}
