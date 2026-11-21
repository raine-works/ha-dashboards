import { describe, expect, it } from 'bun:test';
import {
	activeHoliday,
	daysBetween,
	easterSunday,
	HOLIDAY_IDS,
	HOLIDAYS,
	holidayCountdown,
	holidayMessage,
	holidayOn,
	nthWeekday,
	previewHoliday,
} from '../holidays';

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const on = (y: number, m: number, d: number, h = 12) => activeHoliday(new Date(y, m - 1, d, h));
const must = (y: number, m: number, d: number) => {
	const active = on(y, m, d);
	if (!active) throw new Error(`no holiday on ${y}-${m}-${d}`);
	return active;
};
const idOn = (y: number, m: number, d: number, h?: number) => on(y, m, d, h)?.holiday.id ?? null;

describe('easterSunday', () => {
	it('matches known dates', () => {
		expect(ymd(easterSunday(2019))).toBe('2019-4-21');
		expect(ymd(easterSunday(2024))).toBe('2024-3-31');
		expect(ymd(easterSunday(2025))).toBe('2025-4-20');
		expect(ymd(easterSunday(2026))).toBe('2026-4-5');
		expect(ymd(easterSunday(2027))).toBe('2027-3-28');
		expect(ymd(easterSunday(2038))).toBe('2038-4-25');
		expect(ymd(easterSunday(2285))).toBe('2285-3-22');
	});
});

describe('nthWeekday', () => {
	it('finds Thanksgiving, Mother’s Day and Father’s Day', () => {
		expect(ymd(nthWeekday(2026, 10, 4, 4))).toBe('2026-11-26');
		expect(ymd(nthWeekday(2027, 10, 4, 4))).toBe('2027-11-25');
		// November 2029 starts on a Thursday
		expect(ymd(nthWeekday(2029, 10, 4, 4))).toBe('2029-11-22');
		expect(ymd(nthWeekday(2026, 4, 0, 2))).toBe('2026-5-10');
		expect(ymd(nthWeekday(2026, 5, 0, 3))).toBe('2026-6-21');
	});
});

describe('daysBetween', () => {
	it('counts calendar days across a DST change', () => {
		expect(daysBetween(new Date(2026, 2, 7, 23, 30), new Date(2026, 2, 8, 0, 30))).toBe(1);
		expect(daysBetween(new Date(2026, 10, 1, 0, 5), new Date(2026, 10, 2, 23, 55))).toBe(1);
	});
});

describe('activeHoliday', () => {
	it('counts down to Halloween over two weeks', () => {
		expect(idOn(2026, 10, 16)).toBeNull();
		expect(on(2026, 10, 17)).toMatchObject({ isDay: false, daysUntil: 14 });
		expect(on(2026, 10, 30)).toMatchObject({ isDay: false, daysUntil: 1 });
		expect(on(2026, 10, 31)).toMatchObject({ isDay: true, daysUntil: 0 });
		expect(idOn(2026, 11, 1)).toBeNull();
	});

	it('uses local days, at either end of one', () => {
		expect(on(2026, 10, 31, 0)?.isDay).toBe(true);
		expect(activeHoliday(new Date(2026, 9, 31, 23, 59, 59))?.isDay).toBe(true);
		expect(activeHoliday(new Date(2026, 10, 1, 0, 0, 1))).toBeNull();
	});

	it('has Christmas Eve and Christmas as its days, then nothing until New Year’s', () => {
		expect(idOn(2026, 12, 9)).toBeNull();
		expect(on(2026, 12, 10)).toMatchObject({ isDay: false, daysUntil: 15 });
		expect(on(2026, 12, 24)).toMatchObject({ isDay: true, daysUntil: 1, day: { name: 'Christmas Eve' } });
		expect(on(2026, 12, 25)).toMatchObject({ isDay: true, daysUntil: 0, day: { name: 'Christmas' } });
		expect(idOn(2026, 12, 29)).toBeNull();
	});

	it('is New Year’s from Dec 30 through Jan 1, across the year', () => {
		expect(on(2026, 12, 30)).toMatchObject({ holiday: { id: 'new-year' }, isDay: false, daysUntil: 2 });
		expect(on(2026, 12, 31)).toMatchObject({ holiday: { id: 'new-year' }, isDay: true, daysUntil: 1 });
		expect(on(2026, 12, 31)?.day.name).toBe("New Year's Eve");
		expect(on(2027, 1, 1)).toMatchObject({ holiday: { id: 'new-year' }, isDay: true, daysUntil: 0 });
		expect(on(2027, 1, 1)?.day.date.getFullYear()).toBe(2027);
		expect(idOn(2027, 1, 2)).toBeNull();
	});

	it('lets a holiday’s own day win over another’s lead-up', () => {
		// Easter 2027 is Mar 28, so its week starts Mar 21; Easter 2035 is Mar 25 (from Mar 18)
		expect(idOn(2035, 3, 17)).toBe('st-patricks');
		expect(idOn(2035, 3, 18)).toBe('easter');
		// Easter 2285 is Mar 22: its lead-up from Mar 15 meets St. Patrick's, which wins on its day
		expect(idOn(2285, 3, 16)).toBe('st-patricks');
		expect(idOn(2285, 3, 17)).toBe('st-patricks');
		expect(on(2285, 3, 17)?.isDay).toBe(true);
		expect(idOn(2285, 3, 18)).toBe('easter');
	});

	it('finds the others on their days', () => {
		expect(idOn(2026, 2, 14)).toBe('valentines');
		expect(idOn(2026, 4, 5)).toBe('easter');
		expect(idOn(2026, 5, 10)).toBe('mothers-day');
		expect(idOn(2026, 6, 21)).toBe('fathers-day');
		expect(idOn(2026, 7, 4)).toBe('independence-day');
		expect(idOn(2026, 11, 26)).toBe('thanksgiving');
		expect(idOn(2026, 11, 18)).toBeNull();
		expect(idOn(2026, 11, 19)).toBe('thanksgiving');
	});

	it('covers every holiday with an id', () => {
		expect(new Set(HOLIDAY_IDS).size).toBe(HOLIDAYS.length);
	});
});

describe('holidayOn', () => {
	it('is only the holiday’s own days', () => {
		expect(holidayOn(new Date(2026, 9, 30))).toBeNull();
		expect(holidayOn(new Date(2026, 9, 31))?.holiday.id).toBe('halloween');
	});
});

describe('messages', () => {
	it('counts down, then greets', () => {
		expect(holidayCountdown(must(2026, 10, 30))).toBe('Halloween is tomorrow! 🎃');
		expect(holidayCountdown(must(2026, 10, 28))).toBe('Halloween in 3 days 🎃');
		expect(holidayCountdown(must(2026, 6, 30))).toBe('The 4th of July in 4 days 🎆');
		expect(holidayMessage(must(2026, 10, 31), 0)).toBe('Happy Halloween! 🎃');
		expect(holidayMessage(must(2026, 12, 24), 0)).toBe('Merry Christmas Eve! 🎄');
		expect(holidayMessage(must(2026, 12, 31), 0)).toBe("Happy New Year's Eve! 🥂");
		expect(holidayMessage(must(2027, 1, 1), 0)).toBe('Happy New Year! 🎉');
	});

	it('goes on to the fun lines and round again', () => {
		const halloween = must(2026, 10, 31);
		expect(holidayMessage(halloween, 1)).toBe('Boo! 👻');
		expect(holidayMessage(halloween, 4)).toBe('Happy Halloween! 🎃');
	});
});

describe('previewHoliday', () => {
	it('shows a holiday as its day, or nothing for an unknown id', () => {
		expect(previewHoliday('turkey')).toBeNull();
		expect(previewHoliday('thanksgiving', new Date(2026, 9, 30))).toMatchObject({
			isDay: true,
			daysUntil: 0,
			day: { name: 'Thanksgiving' },
		});
		expect(previewHoliday('new-year', new Date(2026, 9, 30))?.day.date.getFullYear()).toBe(2027);
	});
});
