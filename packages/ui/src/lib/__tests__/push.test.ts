import { describe, expect, it } from 'bun:test';
import { enabledCount, type PushPreferences, withChoice } from '../push';

const preferences: PushPreferences = {
	person: 'person.alex',
	categories: [
		{ id: 'security', name: 'Security', description: '', always: true, enabled: true },
		{ id: 'laundry', name: 'Laundry', description: '', always: false, enabled: true },
		{ id: 'daily', name: 'Daily brief', description: '', always: false, enabled: false },
	],
};

describe('withChoice', () => {
	it('turns one category on or off', () => {
		const off = withChoice(preferences, 'laundry', false);
		expect(off.categories.map((c) => c.enabled)).toEqual([true, false, false]);
		expect(withChoice(off, 'daily', true).categories.map((c) => c.enabled)).toEqual([true, false, true]);
	});

	it('never turns off a category that always comes through', () => {
		expect(withChoice(preferences, 'security', false).categories[0].enabled).toBe(true);
	});

	it('leaves the settings alone for a category it does not list', () => {
		expect(withChoice(preferences, 'weather', false)).toEqual(preferences);
	});
});

describe('enabledCount', () => {
	it('counts the categories that are on', () => {
		expect(enabledCount(preferences)).toBe(2);
	});
});
