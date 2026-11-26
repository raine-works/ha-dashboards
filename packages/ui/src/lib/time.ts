/**
 * Small date and time helpers shared across the libs: local calendar days and m:ss clocks.
 *
 * @module
 */

/** `7` → `07`. */
export const pad2 = (n: number) => n.toString().padStart(2, '0');

/** `2026-10-31` for a local date. */
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** The calendar day of a date (local midnight). */
export function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The local day `days` after (or before) a date's. */
export const addDays = (date: Date, days: number) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Whole local calendar days from `a` to `b` (DST days are 23 or 25 hours, hence the rounding). */
export function daysBetween(a: Date, b: Date): number {
	return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** A time of day: "8:00 AM". */
export const formatTime = (date: Date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** A clock's three numbers (`clockParts`). */
export interface ClockParts {
	/** Whole hours (0 when under an hour: the clock shows no hours). */
	hours: number;
	/** Minutes past the hour (0–59, or every minute when under an hour). */
	minutes: number;
	/** Seconds past the minute (0–59). */
	seconds: number;
}

/**
 * A position or length in seconds split as a clock writes it (`formatClock`), for a clock drawn a
 * number at a time (`NumberFlowClock`). Nothing (undefined, negative, not finite) is 0:00.
 */
export function clockParts(seconds: number | undefined): ClockParts {
	if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return { hours: 0, minutes: 0, seconds: 0 };
	const total = Math.floor(seconds);
	return { hours: Math.floor(total / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}

/** A position or length in seconds as a clock: "0:07", "3:05", "1:02:09" ("0:00" for nothing). */
export function formatClock(seconds: number | undefined): string {
	const { hours, minutes, seconds: s } = clockParts(seconds);
	return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(s)}` : `${minutes}:${pad2(s)}`;
}
