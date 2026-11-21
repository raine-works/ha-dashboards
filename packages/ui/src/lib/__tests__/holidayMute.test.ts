import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	FORMER_HOLIDAY_MUTE,
	HOLIDAY_MUTE,
	holidayMuteCall,
	holidayMutedUntil,
	holidayMuteEntity,
} from '../holidayMute';

const former = (timestamp: unknown): Record<string, HassEntity> => ({
	[FORMER_HOLIDAY_MUTE]: {
		entity_id: FORMER_HOLIDAY_MUTE,
		state: '',
		attributes: { timestamp },
	} as unknown as HassEntity,
});
const integration = (state: string): Record<string, HassEntity> => ({
	[HOLIDAY_MUTE]: { entity_id: HOLIDAY_MUTE, state, attributes: {} } as unknown as HassEntity,
});

describe('holidayMutedUntil', () => {
	const now = 1_800_000_000_000;
	it("is the end while it is in the future, from the integration's datetime", () => {
		expect(holidayMutedUntil(integration(new Date(now + 600_000).toISOString()), now)).toBe(now + 600_000);
		expect(holidayMutedUntil(integration(new Date(now - 1).toISOString()), now)).toBeNull();
		expect(holidayMutedUntil(integration('unknown'), now)).toBeNull();
	});
	it("or from a house's own input_datetime", () => {
		expect(holidayMutedUntil(former(now / 1000 + 600), now)).toBe(now + 600_000);
		expect(holidayMutedUntil(former(now / 1000 - 1), now)).toBeNull();
		expect(holidayMutedUntil(former(undefined), now)).toBeNull();
		expect(holidayMutedUntil(former(0), now)).toBeNull();
	});
	it('is null without either', () => {
		expect(holidayMutedUntil({}, now)).toBeNull();
		expect(holidayMutedUntil(undefined, now)).toBeNull();
	});
	it("prefers the integration's", () => {
		const both = { ...former(now / 1000 + 600), ...integration(new Date(now - 1).toISOString()) };
		expect(holidayMuteEntity(both)).toBe(HOLIDAY_MUTE);
		expect(holidayMutedUntil(both, now)).toBeNull();
	});
});

describe('holidayMuteCall', () => {
	it("sets the integration's by an ISO time, a house's own by its timestamp in seconds", () => {
		expect(holidayMuteCall(HOLIDAY_MUTE, 1_800_000_000_400)).toEqual([
			'datetime',
			'set_value',
			{ entity_id: HOLIDAY_MUTE, datetime: '2027-01-15T08:00:00.400Z' },
		]);
		expect(holidayMuteCall(FORMER_HOLIDAY_MUTE, 1_800_000_000_400)).toEqual([
			'input_datetime',
			'set_datetime',
			{ entity_id: FORMER_HOLIDAY_MUTE, timestamp: 1_800_000_000 },
		]);
	});
});
