/**
 * Lighting discovery and shaping: which lights and Stateful Scenes each floor and room has, what
 * a light's controls can do, and how a light that's on looks.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { kelvinToRgb } from './color';
import { isUnavailable } from './values';

/** HA label on room lighting (smart bulbs and switches); indicator LEDs and appliance lights don't carry it. */
export const HOUSEHOLD_LIGHT_LABEL = 'household_light';

const COLOR_MODES = new Set(['hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp']);

/** Which controls a light's row offers. */
export interface LightCapabilities {
	/** Has a brightness level (any color mode other than plain on/off). */
	dimmable: boolean;
	/** Has color, color temperature or effects for the adjust dialog. */
	adjustable: boolean;
}

/**
 * Whether a light's row shows its dimmer and colors button: while it's on, or while its dimmer is
 * held (a drag that started while it was on keeps its slider until it's let go). A light that's off
 * shows only its toggle and name, so a room of lights that are off stays a short, quiet list.
 */
export function showsLightControls(isOn: boolean, dimmerHeld: boolean): boolean {
	return isOn || dimmerHeld;
}

/**
 * What a light's controls can do, from `supported_color_modes` / `effect_list`. A light that
 * hasn't reported its modes (unavailable) keeps the dimmer, disabled, so its row doesn't jump.
 */
export function lightCapabilities(entity: HassEntity | undefined): LightCapabilities {
	const raw = entity?.attributes.supported_color_modes;
	const modes = Array.isArray(raw) ? raw.map(String) : [];
	const effects = entity?.attributes.effect_list;
	return {
		dimmable: modes.length === 0 || modes.some((mode) => mode !== 'onoff'),
		adjustable: modes.some((mode) => COLOR_MODES.has(mode)) || (Array.isArray(effects) && effects.length > 0),
	};
}

/** What a light that's on looks like: its color, white temperature, or running effect. */
export interface LightAppearance {
	/** CSS color of the light (its reported RGB, else from its temperature). */
	color?: string;
	/** White light at a color temperature. */
	kelvin?: number;
	/** A running effect, as named by the light ("Candle"). */
	effect?: string;
	/** Short description for a status line: the effect, "2700 K", or "Color". */
	detail: string;
}

// What lights report for "no effect running"
const NO_EFFECT = new Set(['', 'off', 'none', 'solid', 'unknown']);

const effectName = (effect: string) =>
	effect
		.replace(/[_-]+/g, ' ')
		.trim()
		.replace(/^\w/, (c) => c.toUpperCase());

/**
 * How a light that's on looks, for lights with color, temperature or effects: undefined when it's
 * off, or a plain dimmable/on-off light with nothing to show.
 */
export function lightAppearance(entity: HassEntity | undefined): LightAppearance | undefined {
	if (entity?.state !== 'on') return undefined;
	const a = entity.attributes;
	const rgb =
		Array.isArray(a.rgb_color) && a.rgb_color.length === 3 && a.rgb_color.every((v) => typeof v === 'number')
			? (a.rgb_color as [number, number, number])
			: undefined;
	const kelvin =
		a.color_mode === 'color_temp' && typeof a.color_temp_kelvin === 'number' ? a.color_temp_kelvin : undefined;
	const effect = isRunning(a.effect) ? effectName(a.effect) : undefined;
	const shown = rgb ?? (kelvin ? kelvinToRgb(kelvin) : undefined);
	if (!shown && !effect) return undefined;
	return {
		color: shown ? `rgb(${shown.join(' ')})` : undefined,
		kelvin,
		effect,
		detail: effect ?? (kelvin ? `${Math.round(kelvin / 100) * 100} K` : 'Color'),
	};
}

const RGB_MODES = new Set(['hs', 'xy', 'rgb', 'rgbw', 'rgbww']);

const isRunning = (effect: unknown): effect is string =>
	typeof effect === 'string' && !NO_EFFECT.has(effect.trim().toLowerCase());

/** One effect in the adjust dialog: its name as the first light lists it, and each light's own spelling of it. */
export interface AdjustEffect {
	/** The effect's name, as the first light that has it spells it. */
	name: string;
	/** Light id → the effect's name in that light's `effect_list`. */
	lights: Record<string, string>;
}

/** What the colors dialog can set on a light or a room's lights, and what they show now. */
export interface AdjustCapabilities {
	/** Lights with a white color temperature, over the widest range any has (each clamps to its own). */
	temperature?: { ids: string[]; minKelvin: number; maxKelvin: number };
	/** Lights with full color. */
	color?: { ids: string[] };
	/** Every effect any light has (matched by name, ignoring case), in the order the lights list them. */
	effects: AdjustEffect[];
	/** A white temperature a light that's on shows. */
	kelvin?: number;
	/** A color a light that's on shows. */
	rgb?: [number, number, number];
	/** That color's hue in degrees, when the light reports `hs_color`. */
	hue?: number;
	/** The effect a light that's on runs. */
	effect?: string;
	/**
	 * How to stop an effect on each light: the light's own "no effect" name (`off`, `None`, `solid`),
	 * so a light that calls it `none` isn't sent `off`.
	 */
	effectOff: Record<string, string>;
}

/** `{ light: value }` as one entry per value with its lights, for one service call each. */
export function byValue(record: Record<string, string>): [string, string[]][] {
	const groups = new Map<string, string[]>();
	for (const [id, value] of Object.entries(record)) groups.set(value, [...(groups.get(value) ?? []), id]);
	return [...groups];
}

/**
 * What the colors dialog offers for these lights (one fixture, or a room's): each setting with the
 * lights that support it, so a room sends a color only to its color bulbs. Current values come from
 * the first light that's on and shows one. Missing (unknown) entities are skipped.
 */
export function adjustCapabilities(entities: (HassEntity | undefined)[]): AdjustCapabilities {
	const temperature: string[] = [];
	const color: string[] = [];
	const effects = new Map<string, AdjustEffect>();
	const effectOff: Record<string, string> = {};
	let minKelvin = Number.POSITIVE_INFINITY;
	let maxKelvin = 0;
	const shown: Pick<AdjustCapabilities, 'kelvin' | 'rgb' | 'hue' | 'effect'> = {};

	for (const entity of entities) {
		if (!entity || isUnavailable(entity.state)) continue;
		const id = entity.entity_id;
		const a = entity.attributes;
		const modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes.map(String) : [];
		if (modes.includes('color_temp')) {
			temperature.push(id);
			minKelvin = Math.min(minKelvin, typeof a.min_color_temp_kelvin === 'number' ? a.min_color_temp_kelvin : 2000);
			maxKelvin = Math.max(maxKelvin, typeof a.max_color_temp_kelvin === 'number' ? a.max_color_temp_kelvin : 6500);
		}
		if (modes.some((mode) => RGB_MODES.has(mode))) color.push(id);
		const list = Array.isArray(a.effect_list) ? a.effect_list.map(String) : [];
		for (const name of list) {
			if (!isRunning(name)) {
				effectOff[id] ??= name;
				continue;
			}
			const key = name.toLowerCase();
			const known = effects.get(key);
			if (known) known.lights[id] ??= name;
			else effects.set(key, { name, lights: { [id]: name } });
		}
		if (list.length > 0) effectOff[id] ??= 'off';

		if (entity.state !== 'on') continue;
		if (shown.kelvin === undefined && a.color_mode === 'color_temp' && typeof a.color_temp_kelvin === 'number')
			shown.kelvin = a.color_temp_kelvin;
		if (shown.rgb === undefined && a.color_mode !== 'color_temp' && Array.isArray(a.rgb_color)) {
			shown.rgb = a.rgb_color as [number, number, number];
			if (Array.isArray(a.hs_color)) shown.hue = Math.round(Number(a.hs_color[0]));
		}
		if (shown.effect === undefined && isRunning(a.effect)) shown.effect = a.effect;
	}

	return {
		temperature: temperature.length > 0 ? { ids: temperature, minKelvin, maxKelvin } : undefined,
		color: color.length > 0 ? { ids: color } : undefined,
		effects: [...effects.values()],
		effectOff,
		...shown,
	};
}

/** The entity's area: its own, else its device's (like Home Assistant resolves it). */
export function entityArea(hass: Pick<HomeAssistant, 'entities' | 'devices'>, entityId: string): string | undefined {
	const entry = hass.entities?.[entityId];
	if (entry?.area_id) return entry.area_id;
	const device = entry?.device_id ? hass.devices?.[entry.device_id] : undefined;
	return device?.area_id ?? undefined;
}

/** `light.*` entities carrying the label (hidden ones skipped), sorted by entity id. */
export function labeledLights(hass: Pick<HomeAssistant, 'entities'>, label = HOUSEHOLD_LIGHT_LABEL): string[] {
	return Object.values(hass.entities ?? {})
		.filter((entry) => entry.entity_id.startsWith('light.') && !entry.hidden && entry.labels?.includes(label))
		.map((entry) => entry.entity_id)
		.sort();
}

/** A room on a floor with its labeled lights. */
export interface FloorRoom {
	/** The room's Home Assistant area id. */
	areaId: string;
	/** The area's name. */
	name: string;
	/** Its lights, by name, each named without the room's name in front ("Floor Lamp"). */
	lights: { id: string; name: string }[];
}

/** Drops a leading "<Area> " from a light name ("Master Suite Floor Lamp" → "Floor Lamp"). */
function shortLightName(name: string, areaName: string): string {
	return name.toLowerCase().startsWith(`${areaName.toLowerCase()} `) ? name.slice(areaName.length + 1) : name;
}

/**
 * Labeled lights on one floor, grouped by area (rooms sorted by name, lights by name). Names come
 * from the registry override, else the state's friendly name.
 */
export function discoverFloorRooms(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>,
	states: Record<string, HassEntity>,
	floorId: string,
	label = HOUSEHOLD_LIGHT_LABEL,
	/** The labeled lights, when the caller has them already (every floor asks for the same ones). */
	lights = labeledLights(hass, label),
): FloorRoom[] {
	const rooms = new Map<string, FloorRoom>();
	for (const id of lights) {
		const areaId = entityArea(hass, id);
		const area = areaId ? hass.areas?.[areaId] : undefined;
		if (!areaId || !area || area.floor_id !== floorId) continue;
		const rawName = hass.entities?.[id]?.name || String(states[id]?.attributes.friendly_name ?? id);
		const room = rooms.get(areaId) ?? { areaId, name: area.name, lights: [] };
		room.lights.push({ id, name: shortLightName(rawName, area.name) });
		rooms.set(areaId, room);
	}
	const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
	return [...rooms.values()].sort(byName).map((room) => ({ ...room, lights: room.lights.sort(byName) }));
}

/** The floors, those named in `order` first (in that order), the rest by level, top floor first. */
export function floorsInOrder(floors: HomeAssistant['floors'], order: string[]) {
	const rank = (id: string) => {
		const i = order.indexOf(id);
		return i === -1 ? order.length : i;
	};
	return Object.values(floors ?? {}).sort(
		(a, b) => rank(a.floor_id) - rank(b.floor_id) || (b.level ?? 0) - (a.level ?? 0),
	);
}

/** A floor with the rooms that have labeled lights. */
export interface HouseFloor {
	/** The Home Assistant floor id. */
	floorId: string;
	/** The floor's name. */
	name: string;
	/** Its rooms with lights, by name. */
	rooms: FloorRoom[];
}

/**
 * Floor ids from `home` outward: the home floor, then the others nearest first by level (an upper
 * floor before a lower one the same distance away). For a panel listing every light, its own first.
 */
export function floorsNearestFirst(floors: HomeAssistant['floors'], home: string): string[] {
	const all = Object.values(floors ?? {});
	const homeLevel = all.find((f) => f.floor_id === home)?.level ?? 0;
	const distance = (level: number | null | undefined) => Math.abs((level ?? 0) - homeLevel);
	return all
		.sort(
			(a, b) =>
				Number(b.floor_id === home) - Number(a.floor_id === home) ||
				distance(a.level) - distance(b.level) ||
				(b.level ?? 0) - (a.level ?? 0),
		)
		.map((f) => f.floor_id);
}

/**
 * Every floor with labeled lights, each with its rooms (as `discoverFloorRooms`). Floors named in
 * `order` come first, in that order; the rest follow by level, top floor first.
 */
export function discoverHouseFloors(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'floors'>,
	states: Record<string, HassEntity>,
	order: string[] = [],
	label = HOUSEHOLD_LIGHT_LABEL,
): HouseFloor[] {
	// One pass over the registry for every floor
	const lights = labeledLights(hass, label);
	return floorsInOrder(hass.floors, order)
		.map((floor) => ({
			floorId: floor.floor_id,
			name: floor.name,
			rooms: discoverFloorRooms(hass, states, floor.floor_id, label, lights),
		}))
		.filter((floor) => floor.rooms.length > 0);
}

/** A room's Stateful Scene. */
export interface RoomScene {
	/** Stateful Scenes switch (`switch.<room>_<scene>_stateful_scene`). */
	id: string;
	/** The scene's name without the room's name or "Stateful Scene" ("Wind Down"). */
	name: string;
}

/**
 * HA label on a Stateful Scenes switch only its room's people see: household members assigned to
 * the scene's room (their person entity's area). Nobody else, and no wall panel, lists it.
 */
export const PRIVATE_SCENE_LABEL = 'private_scene';

const STATEFUL_SCENE = /^switch\..+_stateful_scene$/;
const SCENE_SUFFIX = /\s*stateful scene$/i;

/**
 * Stateful Scenes switches grouped by area ("Wind Down Stateful Scene" → "Wind Down"), Default
 * first, then by name. Scenes without an area are skipped, and so are private ones
 * (`PRIVATE_SCENE_LABEL`) outside `memberArea`, the signed-in household member's room.
 */
export function discoverRoomScenes(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>,
	states: Record<string, HassEntity>,
	memberArea?: string,
): Record<string, RoomScene[]> {
	const byArea: Record<string, RoomScene[]> = {};
	for (const entry of Object.values(hass.entities ?? {})) {
		if (!STATEFUL_SCENE.test(entry.entity_id) || entry.hidden) continue;
		const areaId = entityArea(hass, entry.entity_id);
		const area = areaId ? hass.areas?.[areaId] : undefined;
		if (!areaId || !area) continue;
		if (entry.labels?.includes(PRIVATE_SCENE_LABEL) && areaId !== memberArea) continue;
		// Friendly name first: the registry name is only the entity's part ("Stateful Scene"), while the
		// scene's name is its device's ("Default"), which the friendly name includes
		const rawName = String(states[entry.entity_id]?.attributes.friendly_name ?? entry.name ?? entry.entity_id);
		const name = shortLightName(rawName.replace(SCENE_SUFFIX, ''), area.name);
		byArea[areaId] = [...(byArea[areaId] ?? []), { id: entry.entity_id, name }];
	}
	const rank = (scene: RoomScene) => (scene.name === 'Default' ? 0 : 1);
	for (const scenes of Object.values(byArea)) scenes.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
	return byArea;
}

/**
 * The lights a Stateful Scenes switch sets: its scene entity's `entity_id` list. The switch doesn't
 * name its scene, so match by name ("Passion Stateful Scene" → the scene "Passion") among scenes
 * whose lights are in the switch's room (several rooms have a "Default").
 */
export function sceneLights(
	hass: Pick<HomeAssistant, 'entities' | 'devices'>,
	states: Record<string, HassEntity>,
	switchId: string,
): string[] {
	const name = String(states[switchId]?.attributes.friendly_name ?? '')
		.replace(SCENE_SUFFIX, '')
		.trim()
		.toLowerCase();
	if (!name) return [];
	const area = entityArea(hass, switchId);
	for (const scene of Object.values(states)) {
		if (!scene.entity_id.startsWith('scene.')) continue;
		if (
			String(scene.attributes.friendly_name ?? '')
				.trim()
				.toLowerCase() !== name
		)
			continue;
		const lights = (Array.isArray(scene.attributes.entity_id) ? scene.attributes.entity_id : [])
			.map(String)
			.filter((id) => id.startsWith('light.'));
		if (lights.length > 0 && (!area || lights.some((id) => entityArea(hass, id) === area))) return lights;
	}
	return [];
}

/** The distinct colors of lights that are on (in order), and whether any runs an effect: for a color ring. */
export function ringColors(entities: (HassEntity | undefined)[]): { colors: string[]; effect: boolean } {
	const looks = entities.map(lightAppearance).filter((look): look is LightAppearance => !!look);
	const colors = [...new Set(looks.flatMap((look) => (look.color ? [look.color] : [])))];
	return { colors, effect: looks.some((look) => !!look.effect) };
}

/**
 * A fill in the lights' own colors, for the control of a light or scene that's on: one color, or a
 * diagonal blend of several; with a dark or light foreground, whichever reads on it (from the
 * colors' average luminance). None without colors (a plain dimmable bulb, or before Home Assistant
 * reports a light that was just turned on): the theme's accent then.
 */
export function lightFill(colors: string[]): { background: string; color: string; foreground: string } | undefined {
	const rgbs = colors
		.map((c) => /^rgb\((\d+) (\d+) (\d+)\)$/.exec(c))
		.filter((m): m is RegExpExecArray => !!m)
		.map((m) => [+m[1], +m[2], +m[3]]);
	if (rgbs.length === 0) return undefined;
	const lin = (v: number) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
	const luminance =
		rgbs.reduce((sum, [r, g, b]) => sum + 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b), 0) / rgbs.length;
	return {
		background: colors.length === 1 ? colors[0] : `linear-gradient(135deg, ${colors.join(', ')})`,
		color: colors[0],
		// Black text from about mid-gray up (WCAG's crossover), white below
		foreground: luminance > 0.18 ? 'oklch(0.205 0 0)' : 'oklch(0.985 0 0)',
	};
}

/** A floor with the rooms that have Stateful Scenes. */
export interface HouseSceneFloor {
	/** The Home Assistant floor id. */
	floorId: string;
	/** The floor's name. */
	name: string;
	/** Its rooms with scenes, by name: each its area id, name and scenes. */
	rooms: { areaId: string; name: string; scenes: RoomScene[] }[];
}

/**
 * Every room's Stateful Scenes (as `discoverRoomScenes`), by floor in `order` (floors not in it
 * follow by level, top floor first) and by room name within a floor. Floors and rooms without
 * scenes are left out. `memberArea`: the signed-in household member's room, whose private scenes show.
 */
export function discoverHouseScenes(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas' | 'floors'>,
	states: Record<string, HassEntity>,
	order: string[] = [],
	memberArea?: string,
): HouseSceneFloor[] {
	const byArea = discoverRoomScenes(hass, states, memberArea);
	return floorsInOrder(hass.floors, order)
		.map((floor) => ({
			floorId: floor.floor_id,
			name: floor.name,
			rooms: Object.entries(byArea)
				.filter(([areaId]) => hass.areas?.[areaId]?.floor_id === floor.floor_id)
				.map(([areaId, scenes]) => ({ areaId, name: hass.areas?.[areaId]?.name ?? areaId, scenes }))
				.sort((a, b) => a.name.localeCompare(b.name)),
		}))
		.filter((floor) => floor.rooms.length > 0);
}
