import { describe, expect, it } from 'bun:test';
import { addMonths, dayKey, fromWheelTime, parseDay, quickPicks, toWheelTime } from '../picker';

describe('quickPicks', () => {
	const labels = (now: Date) => quickPicks(now).map((p) => `${p.label} ${p.day}`);

	it('offers today, tomorrow, the weekend and next week (a Tuesday)', () => {
		expect(labels(new Date(2026, 9, 20, 15))).toEqual([
			'Today 2026-10-20',
			'Tomorrow 2026-10-21',
			'This weekend 2026-10-24',
			'Next week 2026-10-26',
		]);
	});

	it('is today on a Saturday, and next Saturday on a Sunday', () => {
		expect(labels(new Date(2026, 9, 24))[2]).toBe('This weekend 2026-10-24');
		expect(labels(new Date(2026, 9, 25))[2]).toBe('Next weekend 2026-10-31');
	});

	it('next week is next Monday, even on a Monday', () => {
		expect(labels(new Date(2026, 9, 26))[3]).toBe('Next week 2026-11-02');
	});

	it('crosses months and years', () => {
		expect(labels(new Date(2026, 11, 31))[1]).toBe('Tomorrow 2027-01-01');
	});
});

describe('days and months', () => {
	it('round-trips a day', () => {
		expect(dayKey(parseDay('2026-02-28'))).toBe('2026-02-28');
	});

	it('steps months from the first', () => {
		expect(dayKey(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-01');
		expect(dayKey(addMonths(new Date(2026, 0, 15), -1))).toBe('2025-12-01');
	});
});

describe('wheel time', () => {
	it('reads 24-hour times onto the 12-hour wheels, minutes to 5', () => {
		expect(toWheelTime('17:32')).toEqual({ hour: 5, minute: 30, meridiem: 'PM' });
		expect(toWheelTime('00:00')).toEqual({ hour: 12, minute: 0, meridiem: 'AM' });
		expect(toWheelTime('12:15')).toEqual({ hour: 12, minute: 15, meridiem: 'PM' });
		// 9:58 carries into 10:00 (never 9:60), 11:58 AM into noon; 11:58 PM stays, not back to midnight
		expect(toWheelTime('09:58')).toEqual({ hour: 10, minute: 0, meridiem: 'AM' });
		expect(toWheelTime('11:58')).toEqual({ hour: 12, minute: 0, meridiem: 'PM' });
		expect(toWheelTime('23:58')).toEqual({ hour: 11, minute: 55, meridiem: 'PM' });
	});

	it('writes them back', () => {
		expect(fromWheelTime({ hour: 12, minute: 0, meridiem: 'AM' })).toBe('00:00');
		expect(fromWheelTime({ hour: 12, minute: 30, meridiem: 'PM' })).toBe('12:30');
		expect(fromWheelTime({ hour: 5, minute: 30, meridiem: 'PM' })).toBe('17:30');
	});
});
