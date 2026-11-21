import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import type { ThermostatZone } from './house-config';

export interface Thermostat {
	entityId: string;
	name: string;
}

/**
 * The thermostats the climate card shows: the house settings' `thermostats` (in their order, with
 * their names), else every visible `climate.*` by name.
 */
export function discoverThermostats(
	hass: Pick<HomeAssistant, 'entities'>,
	states: Record<string, HassEntity | undefined>,
	configured: ThermostatZone[] | undefined,
): Thermostat[] {
	const nameOf = (id: string) => `${states[id]?.attributes.friendly_name ?? id.slice(id.indexOf('.') + 1)}`;
	if (configured)
		return configured.map((zone) => ({ entityId: zone.entityId, name: zone.name ?? nameOf(zone.entityId) }));
	return Object.keys(states)
		.filter((id) => id.startsWith('climate.') && !hass.entities?.[id]?.hidden)
		.map((entityId) => ({ entityId, name: nameOf(entityId) }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

const int = (value: unknown, fallback: number) => {
	const n = Math.trunc(Number(value));
	return Number.isFinite(n) && value != null && value !== '' ? n : fallback;
};

/**
 * `climate.set_temperature`'s data for a setpoint step, as script.adjust_thermostat_temperature does
 * it, for a house without the script: one setpoint in Heat or Cool, the range together in Auto
 * (keeping its gap, so it never squeezes together at the edges), clamped to the thermostat's own
 * limits; null when it's off or in a mode without a setpoint.
 */
export function stepSetpoint(entity: HassEntity | undefined, step: number): Record<string, number> | null {
	if (!entity) return null;
	const a = entity.attributes;
	const min = int(a.min_temp, 50);
	const max = int(a.max_temp, 90);
	if (entity.state === 'heat_cool') {
		const low = int(a.target_temp_low, 65);
		const gap = Math.max(int(a.target_temp_high, 75) - low, 0);
		const newLow = Math.max(Math.min(low + step, max - gap), min);
		return { target_temp_low: newLow, target_temp_high: Math.min(newLow + gap, max) };
	}
	if (entity.state === 'heat' || entity.state === 'cool')
		return { temperature: Math.max(Math.min(int(a.temperature, 70) + step, max), min) };
	return null;
}
