import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	type CalendarEvent,
	cleanDescription,
	discoverCalendars,
	eventsOnDay,
	formatEventTime,
	formatEventWhen,
	mapsUrl,
	monthGrid,
	nextCalendarEvent,
	parseCalendarTime,
	toCalendarEvents,
} from '../calendar';

const entity = (entity_id: string, attributes: Record<string, unknown> = {}, state = 'off'): HassEntity =>
	({ entity_id, state, attributes, last_changed: '', last_updated: '' }) as HassEntity;

const states = {
	'calendar.holidays_in_united_states': entity('calendar.holidays_in_united_states', {
		friendly_name: 'Holidays in united states',
		message: 'Halloween',
		all_day: true,
		start_time: '2026-10-31 00:00:00',
		end_time: '2026-11-01 00:00:00',
		description: 'Observance\nTo hide observances, go to Google Calendar Settings > Holidays in United States',
	}),
	'calendar.family': entity('calendar.family', {
		friendly_name: 'Family',
		message: 'Soccer',
		all_day: false,
		start_time: '2026-10-20 17:30:00',
		end_time: '2026-10-20 18:30:00',
		location: 'Park',
	}),
	'light.kitchen': entity('light.kitchen'),
};
const calendars = discoverCalendars(states);
const now = new Date(2026, 9, 19, 12, 0);

const event = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
	key: 'k',
	calendar: calendars[0],
	summary: 'Event',
	start: new Date(2026, 9, 19, 17, 30),
	end: new Date(2026, 9, 19, 18, 30),
	allDay: false,
	...overrides,
});

describe('discoverCalendars', () => {
	it('lists the household calendars before holidays, each with its own color', () => {
		expect(calendars.map((c) => [c.entityId, c.holiday])).toEqual([
			['calendar.family', false],
			['calendar.holidays_in_united_states', true],
		]);
		expect(calendars[0].color).not.toBe(calendars[1].color);
	});
});

describe('parseCalendarTime', () => {
	it('reads dates as local all-day days and times as timed', () => {
		expect(parseCalendarTime('2026-10-31')).toEqual({ date: new Date(2026, 9, 31), allDay: true });
		expect(parseCalendarTime('2026-10-20 17:30:00')).toEqual({ date: new Date(2026, 9, 20, 17, 30), allDay: false });
		expect(parseCalendarTime('2026-10-20T17:30:00Z').date.toISOString()).toBe('2026-10-20T17:30:00.000Z');
	});
});

describe('cleanDescription', () => {
	it("drops Google's how-to-hide line", () => {
		expect(cleanDescription(states['calendar.holidays_in_united_states'].attributes.description as string)).toBe(
			'Observance',
		);
		expect(cleanDescription('')).toBeUndefined();
		expect(cleanDescription(null)).toBeUndefined();
	});
});

describe('nextCalendarEvent', () => {
	it('picks the earliest current or upcoming event across calendars', () => {
		const next = nextCalendarEvent(states, calendars, now);
		expect(next?.summary).toBe('Soccer');
		expect(next?.location).toBe('Park');
	});

	it('skips events that have ended and calendars without one', () => {
		const later = new Date(2026, 9, 21);
		expect(nextCalendarEvent(states, calendars, later)?.summary).toBe('Halloween');
		expect(nextCalendarEvent({}, calendars, now)).toBeUndefined();
	});
});

describe('toCalendarEvents', () => {
	it('maps calendar.get_events responses, all-day first on a day', () => {
		const events = toCalendarEvents(
			{
				'calendar.family': {
					events: [{ summary: 'Party', start: '2026-10-31T18:00:00-06:00', end: '2026-10-31T21:00:00-06:00' }],
				},
				'calendar.holidays_in_united_states': {
					events: [{ summary: 'Halloween', start: '2026-10-31', end: '2026-11-01', description: 'Observance' }],
				},
			},
			calendars,
		);
		expect(events.map((e) => [e.summary, e.allDay, e.calendar.entityId])).toEqual([
			['Halloween', true, 'calendar.holidays_in_united_states'],
			['Party', false, 'calendar.family'],
		]);
		expect(toCalendarEvents(undefined, calendars)).toEqual([]);
	});

	it('keys events at the same time with the same title apart', () => {
		const shift = { summary: 'Shift', start: '2026-10-31T09:00:00-06:00', end: '2026-10-31T17:00:00-06:00' };
		const keys = toCalendarEvents({ 'calendar.family': { events: [shift, shift] } }, calendars).map((e) => e.key);
		expect(new Set(keys).size).toBe(2);
		expect(keys).toContain('calendar.family|2026-10-31T09:00:00-06:00|Shift');
	});
});

describe('eventsOnDay', () => {
	it('includes multi-day events on each day, not the exclusive end day', () => {
		const trip = event({ start: new Date(2026, 9, 30), end: new Date(2026, 10, 2), allDay: true });
		expect(eventsOnDay([trip], new Date(2026, 9, 30))).toHaveLength(1);
		expect(eventsOnDay([trip], new Date(2026, 10, 1))).toHaveLength(1);
		expect(eventsOnDay([trip], new Date(2026, 10, 2))).toHaveLength(0);
	});

	it('includes zero-length events on their day', () => {
		const reminder = event({ end: new Date(2026, 9, 19, 17, 30) });
		expect(eventsOnDay([reminder], now)).toHaveLength(1);
	});
});

describe('monthGrid', () => {
	it('starts on the Sunday on or before the first and spans six weeks', () => {
		const grid = monthGrid(new Date(2026, 9, 19));
		expect(grid).toHaveLength(42);
		expect(grid[0]).toEqual(new Date(2026, 8, 27));
		expect(grid[41]).toEqual(new Date(2026, 10, 7));
	});
});

describe('formatEventTime', () => {
	it('formats all-day, timed and multi-day events', () => {
		expect(formatEventTime(event({ start: new Date(2026, 9, 31), end: new Date(2026, 10, 1), allDay: true }))).toBe(
			'All day',
		);
		expect(formatEventTime(event({}))).toBe('5:30 PM – 6:30 PM');
		expect(formatEventTime(event({ start: new Date(2026, 9, 30), end: new Date(2026, 10, 2), allDay: true }))).toBe(
			'Oct 30 – Nov 1',
		);
	});

	it('reads a timed event ending at midnight as one day, and longer ones by their real end', () => {
		expect(formatEventTime(event({ start: new Date(2026, 9, 31, 19), end: new Date(2026, 10, 1) }))).toBe(
			'7:00 PM – 12:00 AM',
		);
		expect(formatEventTime(event({ start: new Date(2026, 9, 30, 22), end: new Date(2026, 10, 1) }))).toBe(
			'Oct 30 10:00 PM – Nov 1 12:00 AM',
		);
	});
});

describe('formatEventWhen', () => {
	it('says when relative to now', () => {
		expect(formatEventWhen(event({}), now)).toBe('5:30 PM');
		expect(formatEventWhen(event({ start: new Date(2026, 9, 19, 11), end: new Date(2026, 9, 19, 13) }), now)).toBe(
			'Now',
		);
		expect(
			formatEventWhen(event({ start: new Date(2026, 9, 19), end: new Date(2026, 9, 20), allDay: true }), now),
		).toBe('Today');
		expect(
			formatEventWhen(event({ start: new Date(2026, 9, 20, 17, 30), end: new Date(2026, 9, 20, 18, 30) }), now),
		).toBe('Tomorrow 5:30 PM');
		expect(
			formatEventWhen(event({ start: new Date(2026, 9, 24), end: new Date(2026, 9, 25), allDay: true }), now),
		).toBe('Sat');
		expect(
			formatEventWhen(event({ start: new Date(2026, 9, 31), end: new Date(2026, 10, 1), allDay: true }), now),
		).toBe('Oct 31');
	});
});

describe('mapsUrl', () => {
	it('searches Google Maps for the address', () => {
		expect(mapsUrl(' 123 Main St, Provo, UT 84601 ')).toBe(
			'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Provo%2C%20UT%2084601',
		);
	});

	it('leaves links alone', () => {
		expect(mapsUrl('https://meet.google.com/abc-defg-hij')).toBeNull();
	});
});
