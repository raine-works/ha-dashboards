// The demo house: a made-up two-floor home with what most houses have (lights in rooms, two
// thermostats, a front door lock and its contact, a garage door, a blind, a fan, weather, two
// people, a to-do list and a calendar) and none of the integrations the optional modules need
// (Music Assistant, Alarmo, cameras, pets…), so it shows the dashboards as a new house first
// sees them. Everything in it is made up.
import type { HassArea, HassDeviceRegistryEntry, HassEntity, HassEntityRegistryEntry, HassFloor } from '@app/ui/types';

const NOW = new Date().toISOString();

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
	entity_id,
	state,
	attributes,
	last_changed: NOW,
	last_updated: NOW,
});

export const FLOORS: Record<string, HassFloor> = {
	upstairs: { floor_id: 'upstairs', name: 'Upstairs', level: 2 },
	main_floor: { floor_id: 'main_floor', name: 'Main Floor', level: 1 },
};

export const AREAS: Record<string, HassArea> = {
	living_room: { area_id: 'living_room', name: 'Living Room', floor_id: 'main_floor' },
	kitchen: { area_id: 'kitchen', name: 'Kitchen', floor_id: 'main_floor' },
	entry: { area_id: 'entry', name: 'Entry', floor_id: 'main_floor' },
	garage: { area_id: 'garage', name: 'Garage', floor_id: 'main_floor' },
	bedroom: { area_id: 'bedroom', name: 'Bedroom', floor_id: 'upstairs' },
	office: { area_id: 'office', name: 'Office', floor_id: 'upstairs' },
};

const COLOR_LIGHT = {
	supported_color_modes: ['color_temp', 'hs'],
	min_color_temp_kelvin: 2000,
	max_color_temp_kelvin: 6500,
};
const light = (id: string, name: string, on: boolean, extra: Record<string, unknown> = {}) =>
	entity(`light.${id}`, on ? 'on' : 'off', {
		friendly_name: name,
		supported_color_modes: ['brightness'],
		...(on && { brightness: 180, color_mode: 'brightness' }),
		...extra,
	});

/** Every entity, with the area it's in (none: the house's own, like the weather). */
const ENTITIES: Array<[HassEntity, string | null, string[]?]> = [
	[
		light('living_room_lamp', 'Living Room Lamp', true, {
			...COLOR_LIGHT,
			color_mode: 'color_temp',
			color_temp_kelvin: 2700,
		}),
		'living_room',
		['household_light'],
	],
	[light('living_room_ceiling', 'Living Room Ceiling', false), 'living_room', ['household_light']],
	[light('kitchen_pendants', 'Kitchen Pendants', true), 'kitchen', ['household_light']],
	[light('kitchen_under_cabinet', 'Kitchen Under Cabinet', false), 'kitchen', ['household_light']],
	[light('entry_light', 'Entry Light', false), 'entry', ['household_light']],
	[
		light('bedroom_lamp', 'Bedroom Lamp', true, {
			...COLOR_LIGHT,
			color_mode: 'hs',
			hs_color: [280, 60],
			rgb_color: [190, 102, 255],
		}),
		'bedroom',
		['household_light'],
	],
	[light('office_desk', 'Office Desk Lamp', false), 'office', ['household_light']],
	[
		entity('climate.downstairs', 'heat', {
			friendly_name: 'Downstairs',
			hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
			current_temperature: 69,
			temperature: 70,
			min_temp: 50,
			max_temp: 90,
			hvac_action: 'heating',
		}),
		'living_room',
	],
	[
		entity('climate.upstairs', 'heat_cool', {
			friendly_name: 'Upstairs',
			hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
			current_temperature: 71,
			target_temp_low: 66,
			target_temp_high: 74,
			min_temp: 50,
			max_temp: 90,
			hvac_action: 'idle',
		}),
		'office',
	],
	[entity('lock.front_door', 'locked', { friendly_name: 'Front Door' }), 'entry'],
	[entity('binary_sensor.front_door_contact', 'off', { friendly_name: 'Front Door', device_class: 'door' }), 'entry'],
	[
		entity('binary_sensor.kitchen_window', 'on', { friendly_name: 'Kitchen Window', device_class: 'window' }),
		'kitchen',
	],
	[
		entity('cover.garage_door', 'closed', {
			friendly_name: 'Garage Door',
			device_class: 'garage',
			supported_features: 3,
		}),
		'garage',
	],
	[
		entity('cover.bedroom_blind', 'open', {
			friendly_name: 'Bedroom Blind',
			device_class: 'blind',
			current_position: 60,
			supported_features: 15,
		}),
		'bedroom',
	],
	[
		entity('fan.bedroom', 'off', {
			friendly_name: 'Bedroom Fan',
			percentage: 0,
			percentage_step: 10,
			oscillating: false,
			supported_features: 3,
		}),
		'bedroom',
	],
	[
		entity('weather.home', 'partlycloudy', {
			friendly_name: 'Home',
			temperature: 58,
			temperature_unit: '°F',
			apparent_temperature: 55,
			humidity: 41,
			wind_speed: 8,
			wind_speed_unit: 'mph',
			wind_bearing: 225,
			pressure: 30.1,
			pressure_unit: 'inHg',
			visibility: 10,
			visibility_unit: 'mi',
			cloud_coverage: 40,
			uv_index: 3,
			supported_features: 3,
		}),
		null,
	],
	[entity('sun.sun', 'above_horizon', { next_setting: NOW, next_rising: NOW }), null],
	[
		entity('person.alex', 'home', {
			friendly_name: 'Alex Rivera',
			user_id: 'demo-user',
			device_trackers: ['device_tracker.alex_phone'],
			latitude: 40.0,
			longitude: -91.8,
		}),
		null,
	],
	[
		entity('person.sam', 'not_home', {
			friendly_name: 'Sam Rivera',
			device_trackers: ['device_tracker.sam_phone'],
			latitude: 40.05,
			longitude: -91.7,
		}),
		null,
	],
	[entity('zone.home', '1', { friendly_name: 'Home', latitude: 40.0, longitude: -91.8, radius: 100 }), null],
	[entity('todo.chores', '3', { friendly_name: 'Chores', supported_features: 127 }), null],
	[entity('todo.shopping_list', '2', { friendly_name: 'Shopping List', supported_features: 15 }), null],
	[
		entity('calendar.family', 'off', {
			friendly_name: 'Family',
			message: 'Soccer practice',
			all_day: false,
			start_time: new Date(Date.now() + 26 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
			end_time: new Date(Date.now() + 27.5 * 3600_000).toISOString().slice(0, 19).replace('T', ' '),
		}),
		null,
	],
];

export function demoStates(): Record<string, HassEntity> {
	return Object.fromEntries(ENTITIES.map(([state]) => [state.entity_id, { ...state }]));
}

export const DEMO_ENTITIES: Record<string, HassEntityRegistryEntry> = Object.fromEntries(
	ENTITIES.map(([state, area, labels]) => [
		state.entity_id,
		{
			entity_id: state.entity_id,
			area_id: area,
			device_id: null,
			labels: labels ?? [],
			hidden: false,
			platform: 'demo',
		},
	]),
);

export const DEMO_DEVICES: Record<string, HassDeviceRegistryEntry> = {};

/** The to-do lists' items (`todo/item/subscribe`). */
export const DEMO_TODO: Record<string, Array<Record<string, unknown>>> = {
	'todo.chores': [
		{
			uid: 'c1',
			summary: 'Take out the recycling',
			status: 'needs_action',
			due: new Date().toISOString().slice(0, 10),
		},
		{ uid: 'c2', summary: 'Water the plants', status: 'needs_action', description: 'Assigned to Sam Rivera' },
		{ uid: 'c3', summary: 'Change the furnace filter', status: 'needs_action' },
	],
	'todo.shopping_list': [
		{ uid: 's1', summary: 'Milk', status: 'needs_action' },
		{ uid: 's2', summary: 'Coffee', status: 'needs_action' },
	],
};
