/**
 * Holiday easter eggs: the holidays the dashboards celebrate, their dates in any year (local
 * calendar days, never UTC) and which one is "on" for a day: its own day(s), or the days leading up
 * to it.
 *
 * @module
 */
import { capitalize } from './text';
import { daysBetween, startOfDay } from './time';

// Re-exported for the holidays' callers, which count days with them
export { daysBetween, startOfDay };

/** A holiday the dashboards celebrate. */
export type HolidayId =
	| 'new-year'
	| 'valentines'
	| 'st-patricks'
	| 'easter'
	| 'mothers-day'
	| 'fathers-day'
	| 'independence-day'
	| 'halloween'
	| 'thanksgiving'
	| 'christmas';

/** A character the easter eggs draw: a holiday's, or a birthday's (`lib/birthdays.ts`). */
export type CharacterId = HolidayId | 'birthday';

/** One of a holiday's own days ("Christmas Eve", "Christmas"). */
export interface HolidayDay {
	/** Local midnight of the day. */
	date: Date;
	name: string;
}

/** A holiday: its days in any year, its lead-up and what a tap on its character says. */
export interface Holiday {
	id: HolidayId;
	/** "Halloween": what a countdown names. */
	name: string;
	/** Its emoji, after a countdown ("🎃"). */
	emoji: string;
	/** How many days before its first day the lead-up starts. */
	leadDays: number;
	/** Its days in `year`, in order; the last is the one a countdown counts to. New Year's for 2027 is Dec 31 2026 + Jan 1 2027. */
	days: (year: number) => HolidayDay[];
	/** What a tap says on the day (by the day's name), then while it lasts. */
	greetings: (day: HolidayDay) => string;
	/** Fun lines a tap goes on to, after the greeting or countdown. */
	extras: string[];
}

/** The holiday on or leading up to a day (`activeHoliday`). */
export interface ActiveHoliday {
	holiday: Holiday;
	/** Today is one of its own days. */
	isDay: boolean;
	/** Whole days until its main (last) day: 0 on it. */
	daysUntil: number;
	/** Today, when it's one of its days ("Christmas Eve"); else the main day. */
	day: HolidayDay;
}

const local = (year: number, month: number, date: number) => new Date(year, month, date);

/** The `n`th `weekday` (0 = Sunday) of a month, e.g. the 4th Thursday of November. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
	const first = local(year, month, 1).getDay();
	return local(year, month, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

/** Easter Sunday (the Anonymous Gregorian computus). */
export function easterSunday(year: number): Date {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return local(year, month - 1, day);
}

const one = (name: string, date: (year: number) => Date) => (year: number) => [{ name, date: date(year) }];
const happy = (day: HolidayDay) => `Happy ${day.name}!`;

/** Every holiday the dashboards celebrate, in calendar order. */
export const HOLIDAYS: readonly Holiday[] = [
	{
		id: 'new-year',
		name: "New Year's",
		emoji: '🎉',
		leadDays: 1,
		days: (year) => [
			{ name: "New Year's Eve", date: local(year - 1, 11, 31) },
			{ name: 'New Year', date: local(year, 0, 1) },
		],
		greetings: (day) => (day.name === 'New Year' ? 'Happy New Year! 🎉' : "Happy New Year's Eve! 🥂"),
		extras: ['Pop, fizz, clink! 🥂', 'Resolution: more dance parties 💃', 'Out with the old, in with the new ✨'],
	},
	{
		id: 'valentines',
		name: "Valentine's Day",
		emoji: '💝',
		leadDays: 7,
		days: one("Valentine's Day", (year) => local(year, 1, 14)),
		greetings: (day) => `${happy(day)} 💝`,
		extras: ['You make this house a home ❤️', 'Hugs are free today 🤗', 'Be mine? 💌'],
	},
	{
		id: 'st-patricks',
		name: "St. Patrick's Day",
		emoji: '☘️',
		leadDays: 7,
		days: one("St. Patrick's Day", (year) => local(year, 2, 17)),
		greetings: (day) => `${happy(day)} ☘️`,
		extras: ['Wear something green! 💚', 'Lucky you 🍀', 'Somewhere over the rainbow… 🌈'],
	},
	{
		id: 'easter',
		name: 'Easter',
		emoji: '🐣',
		leadDays: 7,
		days: one('Easter', easterSunday),
		greetings: (day) => `${happy(day)} 🐣`,
		extras: ['Hop hop hop! 🐰', 'Any eggs hiding in here? 🥚', 'Chocolate counts as breakfast today 🍫'],
	},
	{
		id: 'mothers-day',
		name: "Mother's Day",
		emoji: '💐',
		leadDays: 7,
		days: one("Mother's Day", (year) => nthWeekday(year, 4, 0, 2)),
		greetings: (day) => `${happy(day)} 💐`,
		extras: ['Thanks for everything, Mom 🌷', 'Breakfast in bed? 🥞', 'Moms are the best 💖'],
	},
	{
		id: 'fathers-day',
		name: "Father's Day",
		emoji: '👔',
		leadDays: 7,
		days: one("Father's Day", (year) => nthWeekday(year, 5, 0, 3)),
		greetings: (day) => `${happy(day)} 👔`,
		extras: ["I'm not a dad joke, I'm a faux pa 😄", 'Grill master on duty 🍔', 'Dads are the best 💙'],
	},
	{
		id: 'independence-day',
		name: 'the 4th of July',
		emoji: '🎆',
		leadDays: 7,
		days: one('4th of July', (year) => local(year, 6, 4)),
		greetings: () => 'Happy 4th of July! 🎆',
		extras: ['Ooooh, aaaah! 🎇', 'Red, white and you 🇺🇸', 'Pass the sparklers ✨'],
	},
	{
		id: 'halloween',
		name: 'Halloween',
		emoji: '🎃',
		leadDays: 14,
		days: one('Halloween', (year) => local(year, 9, 31)),
		greetings: (day) => `${happy(day)} 🎃`,
		extras: ['Boo! 👻', 'Trick or treat! 🍬', 'Something wicked this way comes 🕸️'],
	},
	{
		id: 'thanksgiving',
		name: 'Thanksgiving',
		emoji: '🦃',
		leadDays: 7,
		days: one('Thanksgiving', (year) => nthWeekday(year, 10, 4, 4)),
		greetings: (day) => `${happy(day)} 🦃`,
		extras: ['Gobble gobble! 🦃', 'Save room for pie 🥧', 'Thankful for this crew 🧡'],
	},
	{
		id: 'christmas',
		name: 'Christmas',
		emoji: '🎄',
		leadDays: 14,
		days: (year) => [
			{ name: 'Christmas Eve', date: local(year, 11, 24) },
			{ name: 'Christmas', date: local(year, 11, 25) },
		],
		greetings: (day) => `Merry ${day.name}! 🎄`,
		extras: ['Ho ho ho! 🎅', 'Run, run, as fast as you can! 🍪', 'Have you been nice this year? 🎁'],
	},
];

/** Every holiday's id, in calendar order. */
export const HOLIDAY_IDS = HOLIDAYS.map((h) => h.id);

/** The holiday with this id (a `?holiday=` preview's), or undefined for none. */
export function holidayById(id: string): Holiday | undefined {
	return HOLIDAYS.find((h) => h.id === id);
}

/**
 * The holiday on or leading up to `date`, or null. Its own day wins over another's lead-up (St.
 * Patrick's Day inside Easter's week), and between two lead-ups the nearer holiday (New Year's
 * from Dec 30, when Christmas is over anyway).
 */
export function activeHoliday(date: Date): ActiveHoliday | null {
	const today = startOfDay(date);
	const year = today.getFullYear();
	let best: ActiveHoliday | null = null;
	for (const holiday of HOLIDAYS) {
		// New Year's next year starts this Dec 31
		for (const y of [year, year + 1]) {
			const days = holiday.days(y);
			const first = days[0];
			const main = days[days.length - 1];
			if (!first || !main) continue;
			const own = days.find((d) => daysBetween(d.date, today) === 0);
			const untilFirst = daysBetween(today, first.date);
			if (!own && (untilFirst < 0 || untilFirst > holiday.leadDays)) continue;
			const candidate: ActiveHoliday = {
				holiday,
				isDay: !!own,
				daysUntil: daysBetween(today, main.date),
				day: own ?? main,
			};
			if (
				!best ||
				(candidate.isDay && !best.isDay) ||
				(candidate.isDay === best.isDay && candidate.daysUntil < best.daysUntil)
			) {
				best = candidate;
			}
		}
	}
	return best;
}

/** The holiday whose own day `date` is (the calendar's day cells), or null. */
export function holidayOn(date: Date): ActiveHoliday | null {
	const active = activeHoliday(date);
	return active?.isDay ? active : null;
}

/** A holiday shown as if today were its main day (the `?holiday=` preview). */
export function previewHoliday(id: string, date = new Date()): ActiveHoliday | null {
	const holiday = holidayById(id);
	if (!holiday) return null;
	const year = startOfDay(date).getFullYear();
	const days = holiday.days(holiday.id === 'new-year' ? year + 1 : year);
	const main = days[days.length - 1];
	return main ? { holiday, isDay: true, daysUntil: 0, day: main } : null;
}

/** "Halloween is tomorrow!", "Christmas in 11 days". */
export function holidayCountdown(active: ActiveHoliday): string {
	const { holiday, daysUntil } = active;
	const name = capitalize(holiday.name);
	if (daysUntil <= 0) return holiday.greetings(active.day);
	if (daysUntil === 1) return `${name} is tomorrow! ${holiday.emoji}`;
	return `${name} in ${daysUntil} days ${holiday.emoji}`;
}

/**
 * What the `tap`th tap (from 0) on the holiday's character says: the greeting on its day, else the
 * countdown, then its fun lines in turn, and round again.
 */
export function holidayMessage(active: ActiveHoliday, tap: number): string {
	const first = active.isDay ? active.holiday.greetings(active.day) : holidayCountdown(active);
	const lines = [first, ...active.holiday.extras];
	return lines[((tap % lines.length) + lines.length) % lines.length] ?? first;
}
