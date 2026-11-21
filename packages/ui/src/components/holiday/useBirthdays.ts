// Today's birthdays from the Birthdays calendar (`lib/birthdays.ts`): one `calendar.get_events` call
// for today, again just after local midnight, when the page comes back into view on a new day, and
// when the calendar entity updates (its current or next event changed). `?birthday=<name>` previews
// one until the page reloads (`none` hides them), read on load and on Home Assistant's in-app
// navigation, then taken off the URL. The preview and the request are the page's, shared by every
// component that asks (the header's cupcake, the Daily dialog's affirmation).

import { useEffect, useState, useSyncExternalStore } from 'preact/compat';
import { useHassApi, useHassReady, useHassSelector } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import { type BirthdayEvent, birthdaysOn, findBirthdayCalendar } from '../../lib/birthdays';
import { callForResponse } from '../../lib/service-calls';
import { dayKey } from '../../lib/time';

const PARAM = 'birthday';

/** A previewed birthday's name, or 'none' (null or undefined: no preview). */
let preview: string | null | undefined;
const previewListeners = new Set<() => void>();

/** Takes the preview off the URL, once for the page: a second reader would find it gone. */
function readPreview() {
	const url = new URL(window.location.href);
	const value = url.searchParams.get(PARAM)?.trim();
	if (value == null) return;
	url.searchParams.delete(PARAM);
	window.history.replaceState(window.history.state, '', url);
	preview = /^(none|off)$/i.test(value) ? 'none' : value === '' ? null : value;
	for (const listener of previewListeners) listener();
}

function subscribePreview(listener: () => void) {
	previewListeners.add(listener);
	if (previewListeners.size === 1) {
		readPreview();
		window.addEventListener('location-changed', readPreview);
		window.addEventListener('popstate', readPreview);
	}
	return () => {
		previewListeners.delete(listener);
		if (previewListeners.size === 0) {
			window.removeEventListener('location-changed', readPreview);
			window.removeEventListener('popstate', readPreview);
		}
	};
}

const getPreview = () => preview;

/** The day's request, shared by every component that asks for the same calendar, revision and day. */
let request: { key: string; names: Promise<string[]> } | undefined;

/** Today's local date key, changing just after midnight (and checked again when the page shows). */
function useToday(): string {
	const [today, setToday] = useState(() => dayKey(new Date()));
	useEffect(() => {
		const check = () => setToday(dayKey(new Date()));
		const now = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
		const timer = setTimeout(check, midnight.getTime() - now.getTime());
		const onVisible = () => document.visibilityState === 'visible' && check();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, [today]);
	return today;
}

/** Whose birthday it is today (the names on the Birthdays calendar), or the previewed one. */
export function useBirthdays(): string[] {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const { birthdayCalendar } = useHouseConfig();
	const calendar = useHassSelector((hass) => birthdayCalendar ?? findBirthdayCalendar(hass?.states ?? {}), {
		watch: ['calendar'],
	});
	const revision = useHassSelector((hass) => (calendar ? (hass?.states[calendar]?.last_updated ?? '') : ''), {
		watch: ['calendar'],
	});
	const today = useToday();
	const [names, setNames] = useState<string[]>([]);
	const preview = useSyncExternalStore(subscribePreview, getPreview);

	useEffect(() => {
		const hass = getHass();
		if (!ready || !calendar || !hass?.callWS) {
			setNames([]);
			return;
		}
		let cancelled = false;
		const [year, month, date] = today.split('-').map(Number) as [number, number, number];
		const start = new Date(year, month - 1, date);
		const end = new Date(year, month - 1, date + 1);
		const key = `${calendar}|${revision}|${today}`;
		if (request?.key !== key)
			request = {
				key,
				names: callForResponse<Record<string, { events?: BirthdayEvent[] }>>(
					hass,
					'calendar',
					'get_events',
					{ start_date_time: start.toISOString(), end_date_time: end.toISOString() },
					{ entity_id: calendar },
				).then((response) => birthdaysOn(response?.[calendar]?.events, start)),
			};
		request.names
			.then((found) => !cancelled && setNames(found))
			// Nothing to celebrate when the calendar can't be read
			.catch(() => !cancelled && setNames([]));
		return () => {
			cancelled = true;
		};
	}, [ready, calendar, revision, today]);

	if (preview === 'none') return [];
	return preview ? [preview] : names;
}
