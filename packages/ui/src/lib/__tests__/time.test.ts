import { describe, expect, it } from 'bun:test';
import { dayKey, formatClock, pad2, startOfDay } from '../time';

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
});
