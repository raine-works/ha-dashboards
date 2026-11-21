// The date-time picker's arithmetic: quick picks, days as `YYYY-MM-DD`, months, and the time wheels'
// 12-hour values. Pure, so the picker's choices are tested.

import { addDays, dayKey, pad2 } from './time';

/** `2026-10-31` for a local date; the day some days on. */
export { addDays, dayKey };

/** A `YYYY-MM-DD` day as a local date (midnight). */
export function parseDay(day: string): Date {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** The first of the month `months` from `month`'s. */
export const addMonths = (month: Date, months: number) => new Date(month.getFullYear(), month.getMonth() + months, 1);

export const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export interface QuickPick {
	label: string;
	day: string;
}

/**
 * The days a due date is usually set to: today, tomorrow, the coming Saturday ("This weekend";
 * on a Saturday that's today, on a Sunday next Saturday, "Next weekend") and next Monday ("Next week").
 */
export function quickPicks(now = new Date()): QuickPick[] {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const weekday = today.getDay();
	const toSaturday = (6 - weekday + 7) % 7;
	const toMonday = (1 - weekday + 7) % 7 || 7;
	return [
		{ label: 'Today', day: dayKey(today) },
		{ label: 'Tomorrow', day: dayKey(addDays(today, 1)) },
		{ label: weekday === 0 ? 'Next weekend' : 'This weekend', day: dayKey(addDays(today, toSaturday)) },
		{ label: 'Next week', day: dayKey(addDays(today, toMonday)) },
	];
}

/** The time wheels: hour 1–12, minute in MINUTE_STEP steps, AM or PM. */
export const MINUTE_STEP = 5;
export const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
export const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
export type Meridiem = 'AM' | 'PM';

export interface WheelTime {
	hour: number;
	minute: number;
	meridiem: Meridiem;
}

/**
 * `17:32` → 5:30 PM on the wheels: minutes to the nearest step, `10:58` carrying into 11:00 AM.
 * Never past midnight, since the wheels hold only the time: 12:00 AM would move it to the day's
 * start, so `23:58` stays 11:55 PM.
 */
export function toWheelTime(time: string): WheelTime {
	const [hours, m] = time.split(':').map(Number);
	const rounded = Math.round(m / MINUTE_STEP) * MINUTE_STEP;
	const carry = rounded >= 60 && hours < 23;
	const h = carry ? hours + 1 : hours;
	const minute = carry ? 0 : Math.min(60 - MINUTE_STEP, rounded);
	return { hour: h % 12 || 12, minute, meridiem: h < 12 ? 'AM' : 'PM' };
}

/** The wheels back to `HH:MM` (24-hour). */
export function fromWheelTime({ hour, minute, meridiem }: WheelTime): string {
	const h = (hour % 12) + (meridiem === 'PM' ? 12 : 0);
	return `${pad2(h)}:${pad2(minute)}`;
}

/** Where the wheels start for a day with no time yet: the morning, not midnight. */
export const DEFAULT_TIME = '09:00';
