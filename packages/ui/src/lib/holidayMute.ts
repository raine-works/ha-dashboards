/**
 * Until when the wall panels' holiday sounds are muted, house-wide: the raineworks_dashboards
 * integration's `datetime` (its state an ISO time), else a house's own `input_datetime` (its
 * `timestamp` attribute), as before the integration had one.
 *
 * @module
 */
import type { HassEntity } from '../types/homeassistant';

/** The integration's mute. */
export const HOLIDAY_MUTE = 'datetime.holiday_sounds_muted_until';
/** A house's own, before the integration's. */
// house-audit: discovery
export const FORMER_HOLIDAY_MUTE = 'input_datetime.holiday_sounds_muted_until';

/** How long the mute button mutes them. */
export const HOLIDAY_MUTE_MS = 60 * 60 * 1000;

/** A `watch` for the mute, whichever it is. */
export const isHolidayMute = (id: string) => id === HOLIDAY_MUTE || id === FORMER_HOLIDAY_MUTE;

/** The mute entity this house has (the integration's first), else undefined. */
export function holidayMuteEntity(states: Record<string, HassEntity | undefined> | undefined): string | undefined {
	if (states?.[HOLIDAY_MUTE]) return HOLIDAY_MUTE;
	if (states?.[FORMER_HOLIDAY_MUTE]) return FORMER_HOLIDAY_MUTE;
	return undefined;
}

/** When the mute ends (epoch ms) while it's on at `now`, else null (never set, in the past, or none). */
export function holidayMutedUntil(states: Record<string, HassEntity> | undefined, now = Date.now()): number | null {
	const entity = holidayMuteEntity(states);
	const state = entity ? states?.[entity] : undefined;
	const until = entity === HOLIDAY_MUTE ? Date.parse(state?.state ?? '') : Number(state?.attributes?.timestamp) * 1000;
	if (!Number.isFinite(until) || until <= 0) return null;
	return until > now ? until : null;
}

/** The action that sets the mute to end at `until` (now, to unmute): domain, service and data. */
export function holidayMuteCall(
	entity: string,
	until: number,
): [domain: string, service: string, data: Record<string, unknown>] {
	if (entity === HOLIDAY_MUTE)
		return ['datetime', 'set_value', { entity_id: entity, datetime: new Date(until).toISOString() }];
	return ['input_datetime', 'set_datetime', { entity_id: entity, timestamp: Math.round(until / 1000) }];
}
