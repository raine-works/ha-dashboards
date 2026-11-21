// Small date and time helpers shared across the libs: local calendar days and m:ss clocks.

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

/** A position or length in seconds as a clock: "0:07", "3:05", "1:02:09" ("0:00" for nothing). */
export function formatClock(seconds: number | undefined): string {
	if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = pad2(total % 60);
	return h > 0 ? `${h}:${pad2(m)}:${s}` : `${m}:${s}`;
}
