/**
 * Fans: discovery and what a fan's row shows.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { entityArea } from './lights';
import { isUnavailable } from './values';

/** Fans' states, for `useHassSelector`'s `watch`. */
export const FANS_WATCH = ['fan'];

/** `fan` supported_features bits. */
export const FAN_FEATURE = {
	SET_SPEED: 1,
	OSCILLATE: 2,
	DIRECTION: 4,
	PRESET_MODE: 8,
	TURN_OFF: 16,
	TURN_ON: 32,
} as const;

/** A fan the dashboards show. */
export interface Fan {
	/** `fan.*` */
	entityId: string;
	/** Its friendly name. */
	name: string;
	/** The fan's area name, for grouping and sorting. */
	area?: string;
}

const objectId = (entityId: string) => entityId.slice(entityId.indexOf('.') + 1);

/** Every visible fan (`fan.*` not hidden in Home Assistant), by area and name; a new fan shows up on its own. */
export function discoverFans(
	hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>,
	states: Record<string, HassEntity>,
): Fan[] {
	return Object.values(states)
		.filter((s) => s.entity_id.startsWith('fan.') && !hass.entities?.[s.entity_id]?.hidden)
		.map((s) => {
			const areaId = entityArea(hass, s.entity_id);
			return {
				entityId: s.entity_id,
				name: (s.attributes.friendly_name as string | undefined) ?? objectId(s.entity_id),
				area: areaId ? (hass.areas?.[areaId]?.name ?? undefined) : undefined,
			};
		})
		.sort((a, b) => (a.area ?? '').localeCompare(b.area ?? '') || a.name.localeCompare(b.name));
}

/** What a fan's row shows (`getFanView`). */
export interface FanView {
	status: 'on' | 'off' | 'unavailable';
	/** 0–100 while on (0 while off or unknown). */
	percentage: number;
	/** The speed slider's step (`percentage_step`: 1, or 33.3 for a three-speed fan). */
	step: number;
	oscillating: boolean;
	/** The preset mode while on, and every one it offers (none when it has no presets). */
	preset?: string;
	presets: string[];
	/** Which controls the fan supports. */
	canSetSpeed: boolean;
	canOscillate: boolean;
	/** "45% · Natural · Oscillating", "Off", "Unavailable". */
	label: string;
}

/** A fan's status line: "45% · Natural · Oscillating", "On", "Off", "Unavailable". */
export function fanLabel(
	status: FanView['status'],
	{
		percentage,
		preset,
		oscillating,
		canSetSpeed,
	}: Pick<FanView, 'percentage' | 'oscillating' | 'canSetSpeed'> & { preset?: string },
): string {
	if (status === 'unavailable') return 'Unavailable';
	if (status === 'off') return 'Off';
	const parts = [
		canSetSpeed && percentage > 0 ? `${percentage}%` : undefined,
		preset,
		oscillating ? 'Oscillating' : undefined,
	];
	return parts.filter(Boolean).join(' · ') || 'On';
}

/** What a fan row shows: state, speed, preset, oscillation and the controls the fan supports. */
export function getFanView(entity: HassEntity | undefined): FanView {
	const a = entity?.attributes ?? {};
	const features = typeof a.supported_features === 'number' ? a.supported_features : 0;
	const presets = Array.isArray(a.preset_modes) ? a.preset_modes.map(String) : [];
	const canSetSpeed = (features & FAN_FEATURE.SET_SPEED) !== 0;
	const canOscillate = (features & FAN_FEATURE.OSCILLATE) !== 0;
	const step = typeof a.percentage_step === 'number' && a.percentage_step > 0 ? a.percentage_step : 1;
	const base = {
		step,
		presets: (features & FAN_FEATURE.PRESET_MODE) !== 0 ? presets : [],
		canSetSpeed,
		canOscillate,
	};

	if (!entity || isUnavailable(entity.state))
		return { ...base, status: 'unavailable', percentage: 0, oscillating: false, label: 'Unavailable' };
	if (entity.state !== 'on') return { ...base, status: 'off', percentage: 0, oscillating: false, label: 'Off' };

	const percentage = typeof a.percentage === 'number' ? Math.round(a.percentage) : 0;
	const oscillating = a.oscillating === true;
	const preset = typeof a.preset_mode === 'string' && a.preset_mode ? a.preset_mode : undefined;
	const label = fanLabel('on', { percentage, preset, oscillating, canSetSpeed });
	return { ...base, status: 'on', percentage, oscillating, preset, label };
}
