/**
 * Birthday easter eggs: today's birthdays from the Birthdays calendar (Google Contacts' birthdays,
 * all-day events titled "Sam Rivera's birthday"), which the headers celebrate like a holiday.
 *
 * @module
 */
import type { HassEntity } from '../types/homeassistant';
import { nameList } from './text';
import { dayKey } from './time';

/**
 * The Birthdays calendar, when the house settings name none: the calendar named "Birthdays"
 * (Google's), else one whose id starts so.
 */
export function findBirthdayCalendar(states: Record<string, HassEntity | undefined>): string | null {
	const calendars = Object.keys(states).filter((id) => id.startsWith('calendar.'));
	return (
		calendars.find((id) => `${states[id]?.attributes.friendly_name ?? ''}`.trim().toLowerCase() === 'birthdays') ??
		// house-audit: discovery
		calendars.find((id) => id.startsWith('calendar.birthdays')) ??
		null
	);
}

/** Whose birthday an event is: "Sam Rivera's birthday" → "Sam Rivera"; null for anything else. */
export function birthdayName(summary: string | null | undefined): string | null {
	const match = /^(.+?)['’]s? birthday$/i.exec((summary ?? '').trim());
	return match?.[1]?.trim() || null;
}

/** A `calendar.get_events` event, as much of it as birthdays need. */
export interface BirthdayEvent {
	summary?: string | null;
	start?: string | null;
}

/** The names with a birthday on `day` (local), in the calendar's order, each once. */
export function birthdaysOn(events: readonly BirthdayEvent[] | undefined, day: Date): string[] {
	const key = dayKey(day);
	const names = (events ?? [])
		// All-day events start on their date ("2026-11-05"); a timed one on its date and time
		.filter((e) => (e.start ?? '').slice(0, 10) === key)
		.map((e) => birthdayName(e.summary))
		.filter((name): name is string => !!name);
	return [...new Set(names)];
}

/** Whether one of `names` (today's birthdays) is `person`'s: by full name, else first name. */
export function isBirthdayOf(names: readonly string[], person: string | null | undefined): boolean {
	const full = (person ?? '').trim().toLowerCase();
	if (!full) return false;
	const first = full.split(/\s+/)[0];
	return names.some((name) => {
		const lower = name.trim().toLowerCase();
		return lower === full || lower.split(/\s+/)[0] === first;
	});
}

const EXTRAS = ['Make a wish! 🕯️', 'Time for cake 🍰', 'Another trip around the sun ☀️', 'Party hats on 🥳'];

/** What a tap on the birthday character says: the greeting, then its fun lines in turn. */
export function birthdayMessage(names: readonly string[], tap: number): string {
	if (tap === 0 || EXTRAS.length === 0) return `Happy birthday, ${nameList(names)}! 🎂`;
	return EXTRAS[(tap - 1) % EXTRAS.length] as string;
}
