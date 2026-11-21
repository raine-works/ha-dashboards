import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { entityArea } from './lights';

/** Window coverings (curtains, blinds, shades, shutters): garage doors and gates aren't. */
export const WINDOW_COVER_CLASSES = ['curtain', 'blind', 'shade', 'shutter'] as const;
export type WindowCoverKind = (typeof WINDOW_COVER_CLASSES)[number];

/** Window covers and the battery sensors of their motors. */
export const COVERS_WATCH = ['cover'];

export interface WindowCover {
	/** `cover.*` */
	entityId: string;
	name: string;
	/** Curtains part from the middle; blinds, shades and shutters come down from the top. */
	kind: WindowCoverKind;
	/** The cover's area name, for grouping and sorting. */
	area?: string;
	/** A cover group's motors (its `entity_id` attribute), or the cover itself. */
	motors: string[];
}

const objectId = (entityId: string) => entityId.slice(entityId.indexOf('.') + 1);
const groupMembers = (state: HassEntity) =>
	Array.isArray(state.attributes.entity_id)
		? (state.attributes.entity_id as unknown[]).filter((id): id is string => typeof id === 'string')
		: [];

/**
 * Every visible window cover (`cover.*` with a window device class), by area and name. A cover
 * group (the Master Suite curtains: one per motor, grouped) stands for its members, which are left
 * out; a new curtain shows up on its own.
 */
export function discoverWindowCovers(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>,
	states: Record<string, HassEntity>,
): WindowCover[] {
	const covers = Object.values(states).filter(
		(s) =>
			s.entity_id.startsWith('cover.') &&
			(WINDOW_COVER_CLASSES as readonly string[]).includes(s.attributes.device_class as string) &&
			!hass.entities?.[s.entity_id]?.hidden,
	);
	const inGroups = new Set(covers.flatMap(groupMembers));
	return covers
		.filter((s) => !inGroups.has(s.entity_id))
		.map((s) => {
			const areaId = entityArea(hass, s.entity_id);
			const members = groupMembers(s);
			return {
				entityId: s.entity_id,
				name: (s.attributes.friendly_name as string | undefined) ?? objectId(s.entity_id),
				kind: s.attributes.device_class as WindowCoverKind,
				area: areaId ? (hass.areas?.[areaId]?.name ?? undefined) : undefined,
				motors: members.length > 0 ? members : [s.entity_id],
			};
		})
		.sort((a, b) => (a.area ?? '').localeCompare(b.area ?? '') || a.name.localeCompare(b.name));
}

/** A motor's battery sensor (`sensor.<motor>_battery`, as Matter and Zigbee curtain drivers name it). */
export const batterySensorFor = (motorId: string) => `sensor.${objectId(motorId)}_battery`;

/** The lowest battery among a cover's motors, in percent (undefined when none reports one). */
export function lowestBattery(
	cover: Pick<WindowCover, 'motors'>,
	states: Record<string, HassEntity>,
): number | undefined {
	const levels = cover.motors
		.map((id) => Number.parseFloat(states[batterySensorFor(id)]?.state ?? ''))
		.filter((level) => Number.isFinite(level));
	return levels.length > 0 ? Math.round(Math.min(...levels)) : undefined;
}

/** Battery tone like the pet care meters: amber at 20% or less, red at 10% or less. */
export const batteryTone = (level: number): 'normal' | 'warning' | 'destructive' =>
	level <= 10 ? 'destructive' : level <= 20 ? 'warning' : 'normal';

/**
 * A full open or close, measured on the Master Suite curtain robots (~11s). They report their position
 * only as they start and finish, so a moving cover's position is estimated from this.
 */
export const FULL_TRAVEL_MS = 11_000;

/** A cover on its way: from where it was, toward a position, since when (epoch ms). */
export interface CoverMotion {
	from: number;
	to: number;
	startedAt: number;
}

/** Where a moving cover is by now, at a full travel's pace, never past where it's headed. */
export function estimatePosition(motion: CoverMotion, now: number, travelMs = FULL_TRAVEL_MS): number {
	const distance = Math.abs(motion.to - motion.from);
	const travelled = Math.min(distance, (Math.max(0, now - motion.startedAt) / travelMs) * 100);
	return Math.round(motion.from + Math.sign(motion.to - motion.from) * travelled);
}
