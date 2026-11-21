import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import { affirmationEntity, formerAffirmationEntity, isAffirmationCurrent, toAffirmation } from '../affirmation';
import { formatWhen } from '../brief';

const helper = (state: string): HassEntity => ({
	entity_id: 'input_text.daily_affirmation_robin_pike',
	state,
	attributes: {},
	last_changed: '',
	last_updated: '',
});

describe('affirmation', () => {
	it("names each person's helper", () => {
		expect(affirmationEntity('person.robin_pike')).toBe('sensor.daily_affirmation_robin_pike');
		expect(formerAffirmationEntity('person.robin_pike')).toBe('input_text.daily_affirmation_robin_pike');
	});

	it('reads the helper', () => {
		const at = new Date(2026, 9, 25, 8, 12);
		const affirmation = toAffirmation(
			helper(JSON.stringify({ at: at.getTime() / 1000, text: ' Robin, you light up the room! ' })),
		);
		expect(affirmation).toEqual({ at, text: 'Robin, you light up the room!' });
		const read = { at, text: '' };
		expect(isAffirmationCurrent(read, new Date(2026, 9, 25, 21))).toBe(true);
		expect(isAffirmationCurrent(read, new Date(2026, 9, 26, 7))).toBe(false);
		expect(formatWhen(at, new Date(2026, 9, 26, 7))).toBe('Yesterday 8:12 AM');
	});

	it('is nothing until one is stored', () => {
		expect(toAffirmation(undefined)).toBeUndefined();
		expect(toAffirmation(helper(''))).toBeUndefined();
		expect(toAffirmation(helper('unknown'))).toBeUndefined();
		expect(toAffirmation(helper('{"at": 1, "text": ""}'))).toBeUndefined();
		expect(toAffirmation(helper('{"text": "Hi"}'))).toBeUndefined();
	});
});

describe("the integration's affirmation sensor", () => {
	const sensor = (state: string, text?: unknown) =>
		({ entity_id: 'sensor.daily_affirmation_sam', state, attributes: { text } }) as unknown as HassEntity;
	it('is when it was written, with its words in an attribute (no 255-character cut)', () => {
		const long = 'You are steady. '.repeat(30);
		expect(toAffirmation(sensor('2026-11-21T14:00:00+00:00', long))).toEqual({
			at: new Date('2026-11-21T14:00:00Z'),
			text: long.trim(),
		});
		expect(toAffirmation(sensor('unknown', 'Hi'))).toBeUndefined();
		expect(toAffirmation(sensor('2026-11-21T14:00:00+00:00', ''))).toBeUndefined();
	});
});
