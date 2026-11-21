import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady, useHassSelector } from '../../context/HassContext';
import {
	type CalendarEvent,
	type CalendarSource,
	discoverCalendars,
	type GetEventsResponse,
	nextCalendarEvent,
	toCalendarEvents,
} from '../../lib/calendar';
import { pickStates } from '../../lib/hass-store';
import { callForResponse } from '../../lib/service-calls';

/** Every calendar entity (discovered, so a newly added calendar appears without a panel change). */
export function useCalendars(): CalendarSource[] {
	return useHassSelector((hass) => discoverCalendars(hass?.states ?? {}), { watch: ['calendar'] });
}

/** The event happening now or next across every calendar (live from the calendar entities). */
export function useNextCalendarEvent(now: Date): CalendarEvent | undefined {
	const calendars = useCalendars();
	const states = useHassSelector((hass) => pickStates(hass?.states, (id) => id.startsWith('calendar.')), {
		watch: ['calendar'],
	});
	return nextCalendarEvent(states, calendars, now);
}

/**
 * Every calendar's events from `start` to `end` (one `calendar.get_events` call), refetched when the
 * range changes or a calendar entity updates (its next event changed). The last events stay while
 * a new range loads.
 */
export function useCalendarEvents(start: Date, end: Date, enabled: boolean) {
	const { getHass } = useHassApi();
	const calendars = useCalendars();
	const [events, setEvents] = useState<CalendarEvent[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const [attempt, setAttempt] = useState(0);

	// Changes when any calendar's current/next event changes (an event was added, moved or started)
	const revision = useHassSelector(
		(hass) => calendars.map((c) => hass?.states[c.entityId]?.last_updated ?? '').join('|'),
		{ watch: ['calendar'] },
	);
	const ready = useHassReady();
	const from = start.getTime();
	const to = end.getTime();

	useEffect(() => {
		const hass = getHass();
		if (!enabled || !ready || !hass?.callWS || calendars.length === 0) return;
		let cancelled = false;
		setLoading(true);
		callForResponse<GetEventsResponse>(
			hass,
			'calendar',
			'get_events',
			{ start_date_time: new Date(from).toISOString(), end_date_time: new Date(to).toISOString() },
			{ entity_id: calendars.map((c) => c.entityId) },
		)
			.then((response) => {
				if (cancelled) return;
				setEvents(toCalendarEvents(response, calendars));
				setError(false);
			})
			.catch(() => !cancelled && setError(true))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [enabled, ready, calendars, from, to, revision, attempt]);

	return { calendars, events, loading, error, retry: () => setAttempt((n) => n + 1) };
}
