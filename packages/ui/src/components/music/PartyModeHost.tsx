/**
 * Party mode's open state for the page, remembered on the device, and the host that shows it.
 *
 * @module
 */

import type React from 'preact/compat';
import { lazy, Suspense, useEffect, useSyncExternalStore } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import { isMusicPlayer, toMusicPlayer } from '../../lib/music';
import { readStored, writeStored } from '../../lib/storage';

// Party mode is one full-screen view for the page (opened from the music dialog on a wall panel),
// remembered on the device so a reload (a deploy, the nightly one) brings it back while music plays
const STORAGE_KEY = 'ha-dashboards:party-mode';
let shown = false;
const listeners = new Set<() => void>();

function setShown(next: boolean) {
	if (next === shown) return;
	shown = next;
	// Storage off: it just won't come back after a reload
	writeStored(STORAGE_KEY, next ? '1' : null);
	for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

/** Open party mode (the wall panels' full-screen music view). */
export const showPartyMode = () => setShown(true);

/** Close party mode. */
export const hidePartyMode = () => setShown(false);

const wasShown = () => readStored(STORAGE_KEY) === '1';

// The view (~13KB) loads the first time party mode opens, in a chunk of its own
const PartyMode = lazy(() => import('./PartyMode'));

/**
 * Party mode's place on a wall panel (`PanelLayout`): the view while it's open, and after a reload
 * it comes back if it was open and music still plays (otherwise the reload ends it).
 */
export const PartyModeHost: React.FC = () => {
	const open = useSyncExternalStore(subscribe, () => shown);
	const { getHass } = useHassApi();

	// Read once, as it mounts: no need to follow the speakers for it
	useEffect(() => {
		if (!wasShown()) return;
		const hass = getHass();
		const anyPlaying =
			!!hass && Object.values(hass.states).some((s) => isMusicPlayer(s, hass) && toMusicPlayer(s).state === 'playing');
		if (anyPlaying) showPartyMode();
		else hidePartyMode();
	}, []);

	return open ? (
		<Suspense fallback={null}>
			<PartyMode />
		</Suspense>
	) : null;
};
