import { describe, expect, test } from 'bun:test';
import { titleCase } from '../text';

describe('titleCase', () => {
	test('capitalizes every word', () => {
		expect(titleCase('Front Door opened')).toBe('Front Door Opened');
		expect(titleCase('Turned off 3 lights')).toBe('Turned Off 3 Lights');
		expect(titleCase("Couldn't lock Front Entry")).toBe("Couldn't Lock Front Entry");
	});

	test('keeps minor words lowercase inside, never first or last', () => {
		expect(titleCase('Someone is at the door')).toBe('Someone Is at the Door');
		expect(titleCase("Couldn't go back to the queue")).toBe("Couldn't Go Back to the Queue");
		expect(titleCase('the end of')).toBe('The End Of');
	});

	test('never lowercases a name', () => {
		expect(titleCase('Playing on WiiM Pro')).toBe('Playing on WiiM Pro');
		expect(titleCase('2 doors & windows open')).toBe('2 Doors & Windows Open');
		expect(titleCase('')).toBe('');
	});
});
