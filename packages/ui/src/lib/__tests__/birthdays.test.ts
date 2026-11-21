import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import { birthdayMessage, birthdayName, birthdaysOn, findBirthdayCalendar, isBirthdayOf } from '../birthdays';
import { nameList } from '../text';

const calendar = (entity_id: string, friendly_name: string): HassEntity => ({
	entity_id,
	state: 'off',
	attributes: { friendly_name },
	last_changed: '',
	last_updated: '',
});

describe('findBirthdayCalendar', () => {
	it('finds the calendar named Birthdays, whatever its entity id', () => {
		const states = {
			'calendar.family_2': calendar('calendar.family_2', 'Family'),
			'calendar.birthdays_2': calendar('calendar.birthdays_2', 'Birthdays'),
		};
		expect(findBirthdayCalendar(states)).toBe('calendar.birthdays_2');
		expect(findBirthdayCalendar({ 'calendar.birthdays': calendar('calendar.birthdays', 'Contacts') })).toBe(
			'calendar.birthdays',
		);
		expect(findBirthdayCalendar({ 'calendar.family': calendar('calendar.family', 'Family') })).toBeNull();
	});
});

describe('birthdayName', () => {
	it("reads the name from Google Contacts' birthday events", () => {
		expect(birthdayName("Kai Pike's birthday")).toBe('Kai Pike');
		expect(birthdayName('Gage Devers’s Birthday')).toBe('Gage Devers');
		expect(birthdayName("James' birthday")).toBe('James');
	});

	it('is null for an event that names nobody', () => {
		expect(birthdayName('Happy birthday!')).toBeNull();
		expect(birthdayName('Party')).toBeNull();
		expect(birthdayName(null)).toBeNull();
	});
});

describe('birthdaysOn', () => {
	const events = [
		{ summary: "Wyatt Lantz's birthday", start: '2026-04-16' },
		{ summary: "Brylen Montoya's birthday", start: '2026-04-16' },
		{ summary: 'Happy birthday!', start: '2026-04-16' },
		{ summary: "Mitchell Hale's birthday", start: '2026-04-20' },
	];

	it("lists the day's birthdays, by local date", () => {
		expect(birthdaysOn(events, new Date(2026, 3, 16, 23, 30))).toEqual(['Wyatt Lantz', 'Brylen Montoya']);
		expect(birthdaysOn(events, new Date(2026, 3, 17))).toEqual([]);
		expect(birthdaysOn(undefined, new Date(2026, 3, 16))).toEqual([]);
	});
});

describe('isBirthdayOf', () => {
	it('matches a person by full name, else first name', () => {
		expect(isBirthdayOf(['Kai Pike'], 'Kai Pike')).toBe(true);
		expect(isBirthdayOf(['Avery'], 'Avery Fonville')).toBe(true);
		expect(isBirthdayOf(['Kai Pike'], 'Kai')).toBe(true);
		expect(isBirthdayOf(['Lisa Pike'], 'Kai Pike')).toBe(false);
		expect(isBirthdayOf(['Kai Pike'], undefined)).toBe(false);
	});
});

describe('birthdayMessage', () => {
	it('greets everyone, then goes on to its fun lines', () => {
		expect(nameList(['Kai', 'Jordan', 'Avery'])).toBe('Kai, Jordan and Avery');
		expect(birthdayMessage(['Wyatt Lantz', 'Brylen Montoya'], 0)).toBe(
			'Happy birthday, Wyatt Lantz and Brylen Montoya! 🎂',
		);
		expect(birthdayMessage(['Kai'], 1)).toBe('Make a wish! 🕯️');
		expect(birthdayMessage(['Kai'], 5)).toBe('Make a wish! 🕯️');
	});
});
