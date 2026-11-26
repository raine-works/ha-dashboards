import { describe, expect, it } from 'bun:test';
import { clockParts, dayKey, formatClock, pad2, startOfDay } from '../time';

describe('time helpers', () => {
	it('pads, keys and starts local days', () => {
		expect(pad2(7)).toBe('07');
		expect(dayKey(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
		expect(startOfDay(new Date(2026, 9, 5, 23, 59))).toEqual(new Date(2026, 9, 5));
	});

	it('formats seconds as a clock', () => {
		expect(formatClock(7.9)).toBe('0:07');
		expect(formatClock(185)).toBe('3:05');
		expect(formatClock(3729)).toBe('1:02:09');
		expect([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY].map(formatClock)).toEqual([
			'0:00',
			'0:00',
			'0:00',
			'0:00',
		]);
	});

	it('splits seconds into the numbers a clock shows', () => {
		expect(clockParts(7.9)).toEqual({ hours: 0, minutes: 0, seconds: 7 });
		// Under an hour, the minutes are every minute (75:00 is never shown: an hour is 1:15:00)
		expect(clockParts(185)).toEqual({ hours: 0, minutes: 3, seconds: 5 });
		expect(clockParts(3729)).toEqual({ hours: 1, minutes: 2, seconds: 9 });
		expect(clockParts(-5)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
		expect(clockParts(Number.NaN)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
	});
});
