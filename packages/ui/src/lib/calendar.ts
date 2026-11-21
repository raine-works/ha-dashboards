import type { HassEntity } from '../types/homeassistant';
import { addDays, daysBetween, startOfDay, formatTime as time } from './time';

export { addDays, startOfDay };

/** A `calendar.*` entity (Google Calendar, holidays, local calendars). */
export interface CalendarSource {
	entityId: string;
	name: string;
	/** Public holiday calendars (by entity id), shown in amber and after the others. */
	holiday: boolean;
	/** Dot / bar color classes (each calendar its own). */
	color: string;
}

export interface CalendarEvent {
	/** Unique within a fetch: calendar, start and summary. */
	key: string;
	calendar: CalendarSource;
	summary: string;
	start: Date;
	/** Exclusive: an all-day event on Oct 31 ends Nov 1 00:00. */
	end: Date;
	allDay: boolean;
	description?: string;
	location?: string;
}

// Literal class names so Tailwind finds them; raw accents need both shades
const HOLIDAY_COLOR = 'bg-amber-500 dark:bg-amber-400';
const COLORS = [
	'bg-sky-500 dark:bg-sky-400',
	'bg-violet-500 dark:bg-violet-400',
	'bg-emerald-500 dark:bg-emerald-400',
	'bg-rose-500 dark:bg-rose-400',
	'bg-orange-500 dark:bg-orange-400',
];

/** Every calendar entity, the household's first (by name), then holidays. */
export function discoverCalendars(states: Record<string, HassEntity>): CalendarSource[] {
	const entities = Object.values(states)
		.filter((s) => s.entity_id.startsWith('calendar.'))
		.map((s) => ({
			entityId: s.entity_id,
			name: (s.attributes.friendly_name as string | undefined) ?? s.entity_id.slice('calendar.'.length),
			holiday: s.entity_id.includes('holiday'),
		}))
		.sort((a, b) => Number(a.holiday) - Number(b.holiday) || a.name.localeCompare(b.name));
	let next = 0;
	return entities.map((c) => ({ ...c, color: c.holiday ? HOLIDAY_COLOR : COLORS[next++ % COLORS.length] }));
}

/**
 * A calendar time: `2026-10-31` (all day, local midnight), `2026-10-31 17:30:00` (entity
 * attributes, local) or an ISO time with an offset (`calendar.get_events`).
 */
export function parseCalendarTime(value: string): { date: Date; allDay: boolean } {
	const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (day) return { date: new Date(+day[1], +day[2] - 1, +day[3]), allDay: true };
	return { date: new Date(value.replace(' ', 'T')), allDay: false };
}

/** Google's holiday calendars append how to hide observances; keep the rest ("Public holiday"). */
export function cleanDescription(description?: string | null): string | undefined {
	const text = (description ?? '')
		.split('\n')
		.filter((line) => !/^To hide observances/i.test(line.trim()))
		.join('\n')
		.trim();
	return text || undefined;
}

function toEvent(
	calendar: CalendarSource,
	raw: { summary?: string; start: string; end: string; description?: string | null; location?: string | null },
	allDayHint?: boolean,
): CalendarEvent {
	const start = parseCalendarTime(raw.start);
	const end = parseCalendarTime(raw.end);
	return {
		key: `${calendar.entityId}|${raw.start}|${raw.summary ?? ''}`,
		calendar,
		summary: raw.summary?.trim() || 'Busy',
		start: start.date,
		end: end.date,
		allDay: allDayHint ?? start.allDay,
		description: cleanDescription(raw.description),
		location: raw.location?.trim() || undefined,
	};
}

/**
 * The event happening now or next across every calendar, from the entities' own attributes
 * (each calendar entity carries its current or next event), so it stays live without polling.
 */
export function nextCalendarEvent(
	states: Record<string, HassEntity>,
	calendars: CalendarSource[],
	now = new Date(),
): CalendarEvent | undefined {
	const events = calendars.flatMap((calendar) => {
		const a = states[calendar.entityId]?.attributes;
		if (!a?.message || !a.start_time || !a.end_time) return [];
		const event = toEvent(
			calendar,
			{
				summary: a.message as string,
				start: a.start_time as string,
				end: a.end_time as string,
				description: a.description as string | undefined,
				location: a.location as string | undefined,
			},
			!!a.all_day,
		);
		return event.end > now ? [event] : [];
	});
	return sortEvents(events)[0];
}

export interface GetEventsResponse {
	[entityId: string]: {
		events?: { summary?: string; start: string; end: string; description?: string | null; location?: string | null }[];
	};
}

/** `calendar.get_events`' response (keyed by entity) as events, by start. */
export function toCalendarEvents(
	response: GetEventsResponse | undefined,
	calendars: CalendarSource[],
): CalendarEvent[] {
	if (!response) return [];
	// `get_events` gives no uid, so two events at the same time with the same title (a series
	// booked twice) share a key: the later ones get their place among them
	const seen = new Map<string, number>();
	return sortEvents(
		calendars.flatMap((calendar) =>
			(response[calendar.entityId]?.events ?? []).map((raw) => {
				const event = toEvent(calendar, raw);
				const count = seen.get(event.key) ?? 0;
				seen.set(event.key, count + 1);
				return count ? { ...event, key: `${event.key}|${count}` } : event;
			}),
		),
	);
}

/** By start; on the same day all-day events first, then the household's calendars before holidays. */
export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
	return [...events].sort(
		(a, b) =>
			startOfDay(a.start).getTime() - startOfDay(b.start).getTime() ||
			Number(b.allDay) - Number(a.allDay) ||
			a.start.getTime() - b.start.getTime() ||
			Number(a.calendar.holiday) - Number(b.calendar.holiday) ||
			a.summary.localeCompare(b.summary),
	);
}

export function isSameDay(a: Date, b: Date): boolean {
	return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Events touching this day (multi-day events on each of their days). */
export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
	const from = startOfDay(day);
	const to = addDays(from, 1);
	return events.filter(
		(e) => e.start < to && (e.end > from || (e.end.getTime() === e.start.getTime() && e.start >= from)),
	);
}

/** The six weeks shown for a month, Sunday first. */
export function monthGrid(month: Date): Date[] {
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const start = addDays(first, -first.getDay());
	return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** "All day", "5:30 PM – 6:30 PM", or "Oct 30 – Nov 2" for an event over several days. */
export function formatEventTime(event: CalendarEvent): string {
	// A timed event's end is exclusive too: one ending at midnight ends on the day it started
	const lastDay = event.allDay ? addDays(event.end, -1) : new Date(event.end.getTime() - 1);
	if (!isSameDay(event.start, lastDay) && lastDay > event.start) {
		const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		return event.allDay
			? `${day(event.start)} – ${day(lastDay)}`
			: `${day(event.start)} ${time(event.start)} – ${day(event.end)} ${time(event.end)}`;
	}
	if (event.allDay) return 'All day';
	return event.end > event.start ? `${time(event.start)} – ${time(event.end)}` : time(event.start);
}

/** When an event is, relative to now: "Now", "Today", "5:30 PM", "Tomorrow 5:30 PM", "Sat", "Oct 31". */
export function formatEventWhen(event: CalendarEvent, now = new Date()): string {
	if (event.start <= now && event.end > now) return event.allDay ? 'Today' : 'Now';
	const days = daysBetween(now, event.start);
	const at = event.allDay ? '' : time(event.start);
	if (days === 0) return at || 'Today';
	if (days === 1) return event.allDay ? 'Tomorrow' : `Tomorrow ${at}`;
	if (days < 7) {
		const weekday = event.start.toLocaleDateString('en-US', { weekday: 'short' });
		return event.allDay ? weekday : `${weekday} ${at}`;
	}
	return event.start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * An event's location in Google Maps: the universal search URL, which opens the Maps app on a phone
 * that has it and the website everywhere else. Null for a location that's a link (a video call).
 */
export function mapsUrl(location: string): string | null {
	if (/^[a-z][a-z\d+.-]*:\/\//i.test(location.trim())) return null;
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}
