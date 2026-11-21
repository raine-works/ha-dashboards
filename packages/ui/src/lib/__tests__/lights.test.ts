import { describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import { kelvinToRgb } from '../color';
import {
	adjustCapabilities,
	byValue,
	discoverFloorRooms,
	discoverHouseFloors,
	discoverHouseScenes,
	discoverRoomScenes,
	entityArea,
	floorsNearestFirst,
	labeledLights,
	lightAppearance,
	lightCapabilities,
	lightFill,
	PRIVATE_SCENE_LABEL,
	ringColors,
	sceneLights,
} from '../lights';

const light = (attributes: HassEntity['attributes'], state = 'on'): HassEntity => ({
	entity_id: 'light.test',
	state,
	attributes,
	last_changed: '',
	last_updated: '',
});

const hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'> = {
	entities: {
		'light.master_suite_left_lamp': {
			entity_id: 'light.master_suite_left_lamp',
			device_id: 'lamp',
			labels: ['household_light'],
		},
		'light.overhead': {
			entity_id: 'light.overhead',
			area_id: 'bedroom',
			name: 'Overhead',
			labels: ['household_light'],
		},
		'light.desk_lamp': { entity_id: 'light.desk_lamp', device_id: 'desk', labels: ['household_light'] },
		'light.ap_led': { entity_id: 'light.ap_led', area_id: 'bedroom', labels: [] },
		'light.living_lamp': { entity_id: 'light.living_lamp', area_id: 'living_room', labels: ['household_light'] },
		'light.hidden': { entity_id: 'light.hidden', area_id: 'bedroom', labels: ['household_light'], hidden: true },
		'switch.fan': { entity_id: 'switch.fan', area_id: 'bedroom', labels: ['household_light'] },
	},
	devices: { lamp: { id: 'lamp', area_id: 'bedroom' }, desk: { id: 'desk', area_id: 'kais_room' } },
	areas: {
		bedroom: { area_id: 'bedroom', name: 'Master Suite', floor_id: 'second_floor' },
		kais_room: { area_id: 'kais_room', name: "Kai's Room", floor_id: 'second_floor' },
		living_room: { area_id: 'living_room', name: 'Living Room', floor_id: 'main_floor' },
	},
};

const states: Record<string, HassEntity> = {
	'light.master_suite_left_lamp': light({ friendly_name: 'Master Suite Left Lamp' }),
	'light.desk_lamp': light({ friendly_name: 'Desk Lamp' }),
};

describe('lightCapabilities', () => {
	it('treats on/off-only lights as neither dimmable nor adjustable', () => {
		expect(lightCapabilities(light({ supported_color_modes: ['onoff'] }))).toEqual({
			dimmable: false,
			adjustable: false,
		});
	});

	it('dims brightness-only lights without offering colors', () => {
		expect(lightCapabilities(light({ supported_color_modes: ['brightness'] }))).toEqual({
			dimmable: true,
			adjustable: false,
		});
	});

	it('offers colors for color, temperature or effects', () => {
		expect(lightCapabilities(light({ supported_color_modes: ['color_temp'] })).adjustable).toBe(true);
		expect(lightCapabilities(light({ supported_color_modes: ['xy'] })).adjustable).toBe(true);
		expect(
			lightCapabilities(light({ supported_color_modes: ['brightness'], effect_list: ['Candle'] })).adjustable,
		).toBe(true);
	});

	it('keeps the dimmer for a light that has not reported its modes', () => {
		expect(lightCapabilities(light({}, 'unavailable')).dimmable).toBe(true);
	});
});

describe('household light discovery', () => {
	it('resolves the area from the entity, else its device', () => {
		expect(entityArea(hass, 'light.overhead')).toBe('bedroom');
		expect(entityArea(hass, 'light.master_suite_left_lamp')).toBe('bedroom');
		expect(entityArea(hass, 'light.unknown')).toBeUndefined();
	});

	it('lists labeled, visible lights only', () => {
		expect(labeledLights(hass)).toEqual([
			'light.desk_lamp',
			'light.living_lamp',
			'light.master_suite_left_lamp',
			'light.overhead',
		]);
	});

	it('groups a floor by room, with names shortened and sorted', () => {
		expect(discoverFloorRooms(hass, states, 'second_floor')).toEqual([
			{ areaId: 'kais_room', name: "Kai's Room", lights: [{ id: 'light.desk_lamp', name: 'Desk Lamp' }] },
			{
				areaId: 'bedroom',
				name: 'Master Suite',
				lights: [
					{ id: 'light.master_suite_left_lamp', name: 'Left Lamp' },
					{ id: 'light.overhead', name: 'Overhead' },
				],
			},
		]);
	});
});

describe('whole-house discovery', () => {
	const house = {
		...hass,
		floors: {
			main_floor: { floor_id: 'main_floor', name: 'Main Floor', level: 1 },
			second_floor: { floor_id: 'second_floor', name: 'Second Floor', level: 2 },
			basement: { floor_id: 'basement', name: 'Basement', level: 0 },
		},
	};

	it('lists floors with lights, ordered floors first, then top floor down', () => {
		expect(discoverHouseFloors(house, states).map((f) => f.floorId)).toEqual(['second_floor', 'main_floor']);
		expect(discoverHouseFloors(house, states, ['main_floor']).map((f) => f.floorId)).toEqual([
			'main_floor',
			'second_floor',
		]);
		expect(discoverHouseFloors(house, states, ['main_floor'])[0]).toEqual({
			floorId: 'main_floor',
			name: 'Main Floor',
			rooms: [
				{
					areaId: 'living_room',
					name: 'Living Room',
					lights: [{ id: 'light.living_lamp', name: 'light.living_lamp' }],
				},
			],
		});
	});

	it('groups stateful scenes by room with Default first', () => {
		const withScenes = {
			...hass,
			entities: {
				...hass.entities,
				// As Stateful Scenes registers them: the entity's own name, the scene name on its device
				'switch.master_suite_wind_down_stateful_scene': {
					entity_id: 'switch.master_suite_wind_down_stateful_scene',
					area_id: 'bedroom',
					name: 'Stateful Scene',
				},
				'switch.master_suite_default_stateful_scene': {
					entity_id: 'switch.master_suite_default_stateful_scene',
					area_id: 'bedroom',
					name: 'Stateful Scene',
				},
				'switch.master_suite_passion_stateful_scene': {
					entity_id: 'switch.master_suite_passion_stateful_scene',
					area_id: 'bedroom',
					name: 'Master Suite Passion',
				},
				'switch.nowhere_stateful_scene': { entity_id: 'switch.nowhere_stateful_scene' },
				'switch.fan': { entity_id: 'switch.fan', area_id: 'bedroom' },
			},
		};
		const sceneStates: Record<string, HassEntity> = {
			'switch.master_suite_wind_down_stateful_scene': light({ friendly_name: 'Wind Down Stateful Scene' }),
			'switch.master_suite_default_stateful_scene': light({ friendly_name: 'Default Stateful Scene' }),
		};
		expect(discoverRoomScenes(withScenes, sceneStates)).toEqual({
			bedroom: [
				{ id: 'switch.master_suite_default_stateful_scene', name: 'Default' },
				{ id: 'switch.master_suite_passion_stateful_scene', name: 'Passion' },
				{ id: 'switch.master_suite_wind_down_stateful_scene', name: 'Wind Down' },
			],
		});
	});
});

describe('lightAppearance', () => {
	it('shows a color light by its reported color', () => {
		expect(lightAppearance(light({ color_mode: 'hs', rgb_color: [255, 0, 151], effect: 'off' }))).toEqual({
			color: 'rgb(255 0 151)',
			kelvin: undefined,
			effect: undefined,
			detail: 'Color',
		});
	});

	it('shows white light by its temperature, rounded', () => {
		const look = lightAppearance(
			light({ color_mode: 'color_temp', color_temp_kelvin: 4347, rgb_color: [255, 214, 181] }),
		);
		expect(look?.color).toBe('rgb(255 214 181)');
		expect(look?.kelvin).toBe(4347);
		expect(look?.detail).toBe('4300 K');
	});

	it('works out a color from the temperature when the light reports none', () => {
		expect(lightAppearance(light({ color_mode: 'color_temp', color_temp_kelvin: 2700 }))?.color).toMatch(/^rgb\(255 /);
	});

	it('names a running effect, and ignores "off" / "none"', () => {
		const look = lightAppearance(light({ color_mode: 'xy', rgb_color: [255, 193, 142], effect: 'candle' }));
		expect(look?.effect).toBe('Candle');
		expect(look?.detail).toBe('Candle');
		expect(lightAppearance(light({ color_mode: 'hs', rgb_color: [1, 2, 3], effect: 'None' }))?.effect).toBeUndefined();
		expect(lightAppearance(light({ color_mode: 'hs', rgb_color: [1, 2, 3], effect: null }))?.effect).toBeUndefined();
		expect(lightAppearance(light({ color_mode: 'brightness', effect: 'night_light' }))?.effect).toBe('Night light');
	});

	it('shows nothing for a light that is off, or plain dimmable', () => {
		expect(lightAppearance(light({ color_mode: 'hs', rgb_color: [1, 2, 3] }, 'off'))).toBeUndefined();
		expect(lightAppearance(light({ color_mode: 'brightness', brightness: 200 }))).toBeUndefined();
		expect(lightAppearance(undefined)).toBeUndefined();
	});
});

describe('kelvinToRgb', () => {
	it('runs from warm orange to cool blue-white', () => {
		const [r2, g2, b2] = kelvinToRgb(2000);
		const [r6, , b6] = kelvinToRgb(6500);
		expect(r2).toBe(255);
		expect(g2).toBeLessThan(160);
		expect(b2).toBeLessThan(80);
		expect(r6).toBeGreaterThan(240);
		expect(b6).toBeGreaterThan(240);
	});
});

describe('scene rings', () => {
	const sceneHass: Pick<HomeAssistant, 'entities' | 'devices'> = {
		entities: {
			'switch.master_suite_default_stateful_scene': {
				entity_id: 'switch.master_suite_default_stateful_scene',
				area_id: 'bedroom',
			},
			'light.ms_lamp': { entity_id: 'light.ms_lamp', area_id: 'bedroom' },
			'light.lr_lamp': { entity_id: 'light.lr_lamp', area_id: 'living_room' },
		},
		devices: {},
	};
	const sceneStates: Record<string, HassEntity> = {
		'switch.master_suite_default_stateful_scene': light({ friendly_name: 'Default Stateful Scene' }),
		// Two rooms each have a scene called "Default"
		'scene.default_2': {
			...light({ friendly_name: 'Default', entity_id: ['light.lr_lamp'] }),
			entity_id: 'scene.default_2',
		},
		'scene.default': {
			...light({ friendly_name: 'Default', entity_id: ['light.ms_lamp', 'switch.fan'] }),
			entity_id: 'scene.default',
		},
	};

	it("finds the lights of the switch's own scene, in its room", () => {
		expect(sceneLights(sceneHass, sceneStates, 'switch.master_suite_default_stateful_scene')).toEqual([
			'light.ms_lamp',
		]);
	});

	it('finds nothing for an unknown switch', () => {
		expect(sceneLights(sceneHass, sceneStates, 'switch.nope')).toEqual([]);
	});

	it('collects the distinct colors of lights that are on, and any effect', () => {
		const pink = light({ color_mode: 'hs', rgb_color: [255, 0, 151] });
		const warm = light({
			color_mode: 'color_temp',
			color_temp_kelvin: 2700,
			rgb_color: [255, 167, 87],
			effect: 'candle',
		});
		expect(ringColors([pink, pink, warm, light({ color_mode: 'hs', rgb_color: [1, 2, 3] }, 'off'), undefined])).toEqual(
			{
				colors: ['rgb(255 0 151)', 'rgb(255 167 87)'],
				effect: true,
			},
		);
		expect(ringColors([light({ color_mode: 'brightness' })])).toEqual({ colors: [], effect: false });
	});
});

describe('floorsNearestFirst', () => {
	const floors: HomeAssistant['floors'] = {
		basement: { floor_id: 'basement', name: 'Basement', level: 0 },
		main_floor: { floor_id: 'main_floor', name: 'Main Floor', level: 1 },
		second_floor: { floor_id: 'second_floor', name: 'Second Floor', level: 2 },
	};

	it("puts the panel's own floor first, then the nearest", () => {
		expect(floorsNearestFirst(floors, 'basement')).toEqual(['basement', 'main_floor', 'second_floor']);
		expect(floorsNearestFirst(floors, 'second_floor')).toEqual(['second_floor', 'main_floor', 'basement']);
	});

	it('goes up before down when two floors are as near', () => {
		expect(floorsNearestFirst(floors, 'main_floor')).toEqual(['main_floor', 'second_floor', 'basement']);
	});
});

describe('discoverHouseScenes', () => {
	const sceneHass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'floors'> = {
		entities: {
			'switch.theater_movie_stateful_scene': { entity_id: 'switch.theater_movie_stateful_scene', area_id: 'theater' },
			'switch.living_room_default_stateful_scene': {
				entity_id: 'switch.living_room_default_stateful_scene',
				area_id: 'living_room',
			},
			'switch.master_suite_passion_stateful_scene': {
				entity_id: 'switch.master_suite_passion_stateful_scene',
				area_id: 'bedroom',
			},
		},
		devices: {},
		areas: {
			theater: { area_id: 'theater', name: 'Theater', floor_id: 'basement' },
			living_room: { area_id: 'living_room', name: 'Living Room', floor_id: 'main_floor' },
			bedroom: { area_id: 'bedroom', name: 'Master Suite', floor_id: 'second_floor' },
			office: { area_id: 'office', name: 'Office', floor_id: 'basement' },
		},
		floors: {
			basement: { floor_id: 'basement', name: 'Basement', level: 0 },
			main_floor: { floor_id: 'main_floor', name: 'Main Floor', level: 1 },
			second_floor: { floor_id: 'second_floor', name: 'Second Floor', level: 2 },
		},
	};
	const sceneStates: Record<string, HassEntity> = {
		'switch.theater_movie_stateful_scene': light({ friendly_name: 'Movie Stateful Scene' }),
		'switch.living_room_default_stateful_scene': light({ friendly_name: 'Default Stateful Scene' }),
		'switch.master_suite_passion_stateful_scene': light({ friendly_name: 'Passion Stateful Scene' }),
	};

	it("lists every room's scenes by floor, in the order given", () => {
		const floors = discoverHouseScenes(sceneHass, sceneStates, ['basement', 'main_floor', 'second_floor']);
		expect(
			floors.map((f) => [f.name, f.rooms.map((r) => `${r.name}: ${r.scenes.map((s) => s.name).join(', ')}`)]),
		).toEqual([
			['Basement', ['Theater: Movie']],
			['Main Floor', ['Living Room: Default']],
			['Second Floor', ['Master Suite: Passion']],
		]);
	});

	it("shows a private scene only to its room's household members", () => {
		const secret: typeof sceneHass = {
			...sceneHass,
			entities: {
				...sceneHass.entities,
				'switch.master_suite_passion_stateful_scene': {
					entity_id: 'switch.master_suite_passion_stateful_scene',
					area_id: 'bedroom',
					labels: [PRIVATE_SCENE_LABEL],
				},
			},
		};
		const names = (memberArea?: string) =>
			discoverHouseScenes(secret, sceneStates, [], memberArea).flatMap((f) =>
				f.rooms.flatMap((r) => r.scenes.map((s) => s.name)),
			);
		// A wall panel, the admin, a member without a room
		expect(names()).not.toContain('Passion');
		expect(names('living_room')).not.toContain('Passion');
		expect(names('bedroom')).toContain('Passion');
		// The others stay for everyone
		expect(names('living_room')).toEqual(expect.arrayContaining(['Movie', 'Default']));
	});

	it('leaves out rooms and floors without scenes', () => {
		const floors = discoverHouseScenes(sceneHass, sceneStates, ['second_floor']);
		expect(floors[0].name).toBe('Second Floor');
		expect(floors.flatMap((f) => f.rooms.map((r) => r.name))).not.toContain('Office');
	});
});

describe('adjustCapabilities', () => {
	const bulb = (id: string, attributes: HassEntity['attributes'], state = 'on'): HassEntity => ({
		...light(attributes, state),
		entity_id: id,
	});
	const hue = (id: string, attributes: HassEntity['attributes'] = {}, state = 'on') =>
		bulb(
			id,
			{
				supported_color_modes: ['color_temp', 'xy'],
				min_color_temp_kelvin: 2000,
				max_color_temp_kelvin: 6535,
				effect_list: ['off', 'candle', 'fire'],
				...attributes,
			},
			state,
		);

	it("sends each setting only to a room's lights that have it", () => {
		const caps = adjustCapabilities([
			hue('light.left'),
			bulb('light.desk', {
				supported_color_modes: ['color_temp'],
				min_color_temp_kelvin: 2702,
				max_color_temp_kelvin: 6535,
			}),
			bulb('light.overhead', { supported_color_modes: ['onoff'] }),
		]);
		expect(caps.temperature).toEqual({ ids: ['light.left', 'light.desk'], minKelvin: 2000, maxKelvin: 6535 });
		expect(caps.color).toEqual({ ids: ['light.left'] });
		expect(caps.effects.map((e) => e.name)).toEqual(['candle', 'fire']);
	});

	it("merges effects by name, keeping each light's spelling and its own 'no effect'", () => {
		const caps = adjustCapabilities([
			hue('light.lamp'),
			bulb('light.theater', { supported_color_modes: ['rgb'], effect_list: ['none', 'Candle', 'movie'] }),
		]);
		expect(caps.effects).toEqual([
			{ name: 'candle', lights: { 'light.lamp': 'candle', 'light.theater': 'Candle' } },
			{ name: 'fire', lights: { 'light.lamp': 'fire' } },
			{ name: 'movie', lights: { 'light.theater': 'movie' } },
		]);
		expect(caps.effectOff).toEqual({ 'light.lamp': 'off', 'light.theater': 'none' });
	});

	it('shows what a light that is on shows, skipping lights that are off or unavailable', () => {
		const caps = adjustCapabilities([
			hue('light.off', { color_mode: 'color_temp', color_temp_kelvin: 6000 }, 'off'),
			hue('light.gone', {}, 'unavailable'),
			undefined,
			hue('light.warm', { color_mode: 'color_temp', color_temp_kelvin: 2700, rgb_color: [255, 167, 87] }),
			hue('light.red', { color_mode: 'xy', rgb_color: [255, 0, 0], hs_color: [0.4, 100], effect: 'fire' }),
		]);
		expect(caps.kelvin).toBe(2700);
		expect(caps.rgb).toEqual([255, 0, 0]);
		expect(caps.hue).toBe(0);
		expect(caps.effect).toBe('fire');
		expect(caps.temperature?.ids).toEqual(['light.off', 'light.warm', 'light.red']);
	});

	it('offers nothing for plain lights', () => {
		expect(adjustCapabilities([bulb('light.switch', { supported_color_modes: ['onoff'] })])).toEqual({
			temperature: undefined,
			color: undefined,
			effects: [],
			effectOff: {},
		});
	});

	it('groups lights by value, one service call each', () => {
		expect(byValue({ 'light.a': 'off', 'light.b': 'none', 'light.c': 'off' })).toEqual([
			['off', ['light.a', 'light.c']],
			['none', ['light.b']],
		]);
	});
});

describe('lightFill', () => {
	it("fills with the lights' colors, with a foreground that reads on them", () => {
		expect(lightFill(['rgb(255 180 107)'])).toEqual({
			background: 'rgb(255 180 107)',
			color: 'rgb(255 180 107)',
			foreground: 'oklch(0.205 0 0)',
		});
		expect(lightFill(['rgb(40 0 160)'])?.foreground).toBe('oklch(0.985 0 0)');
		expect(lightFill(['rgb(255 0 128)', 'rgb(0 0 255)'])?.background).toBe(
			'linear-gradient(135deg, rgb(255 0 128), rgb(0 0 255))',
		);
	});

	it('has none without colors', () => {
		expect(lightFill([])).toBeUndefined();
	});
});
