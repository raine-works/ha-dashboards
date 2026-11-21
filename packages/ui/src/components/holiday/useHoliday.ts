// Today's holiday for the whole page: one store outside the tree, re-evaluated just after local
// midnight (and when the page comes back into view, since a sleeping page's timer fires late), so
// nothing re-renders more than once a day. `?holiday=<id>` previews one (`none` hides them), read
// once on load and on Home Assistant's in-app navigation, then taken off the URL.

import { useSyncExternalStore } from 'preact/compat';
import { type ActiveHoliday, activeHoliday, holidayById, previewHoliday } from '../../lib/holidays';
import { dayKey } from '../../lib/time';

const PARAM = 'holiday';

/** A previewed holiday's id, or 'none'. */
let override: string | null = null;
let current: ActiveHoliday | null = null;
let currentKey = '';
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function evaluate() {
	const now = new Date();
	const key = `${override ?? ''}|${dayKey(now)}`;
	if (key === currentKey) return false;
	currentKey = key;
	current = override === 'none' ? null : override ? previewHoliday(override, now) : activeHoliday(now);
	return true;
}

function refresh() {
	if (evaluate()) for (const listener of listeners) listener();
}

function scheduleMidnight() {
	clearTimeout(timer);
	const now = new Date();
	const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
	timer = setTimeout(() => {
		refresh();
		scheduleMidnight();
	}, next.getTime() - now.getTime());
}

function readLink() {
	const url = new URL(window.location.href);
	const value = url.searchParams.get(PARAM)?.toLowerCase();
	if (value == null) return;
	url.searchParams.delete(PARAM);
	window.history.replaceState(window.history.state, '', url);
	if (value === 'none' || value === 'off') override = 'none';
	else if (holidayById(value)) override = value;
	else override = null;
	refresh();
}

function onVisible() {
	if (document.visibilityState === 'visible') {
		refresh();
		scheduleMidnight();
	}
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (listeners.size === 1) {
		readLink();
		refresh();
		scheduleMidnight();
		window.addEventListener('location-changed', readLink);
		window.addEventListener('popstate', readLink);
		document.addEventListener('visibilitychange', onVisible);
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) {
			clearTimeout(timer);
			window.removeEventListener('location-changed', readLink);
			window.removeEventListener('popstate', readLink);
			document.removeEventListener('visibilitychange', onVisible);
		}
	};
}

function getSnapshot() {
	evaluate();
	return current;
}

/** The holiday on or leading up to today (or the previewed one), for code outside a component. */
export function activeHolidayNow(): ActiveHoliday | null {
	return getSnapshot();
}

/** The holiday on or leading up to today (or the previewed one), else null. */
export function useHoliday(): ActiveHoliday | null {
	return useSyncExternalStore(subscribe, getSnapshot);
}
