/**
 * The playlist this device last started on each queue. Home Assistant doesn't say which playlist a
 * speaker plays (only the track), so Now Playing's Playlist button relies on this: a small store
 * outside the component tree, kept in localStorage so it survives a reload.
 *
 * @module
 */

import { useEffect, useState, useSyncExternalStore } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import { getTracks, hasTrack, type MediaItem, type MusicPlayer } from '../../lib/music';
import { readStoredJson, writeStored } from '../../lib/storage';

const STORAGE_KEY = 'music.playlists';

/** Queue (the leader's entity id) → the playlist started on it. */
let playlists: Record<string, MediaItem> = load();
const listeners = new Set<() => void>();

function load(): Record<string, MediaItem> {
	return (readStoredJson(STORAGE_KEY) as Record<string, MediaItem> | undefined) ?? {};
}

function set(next: Record<string, MediaItem>) {
	playlists = next;
	// Storage off (a private window): remembered until the page reloads
	writeStored(STORAGE_KEY, JSON.stringify(next));
	for (const listener of listeners) listener();
}

/** Something new replaced the queue on `queue`: remember the playlist, or forget it for anything else. */
export function rememberPlayed(queue: string, item: MediaItem | undefined) {
	if (item?.mediaType === 'playlist') set({ ...playlists, [queue]: item });
	else if (queue in playlists) {
		const rest = { ...playlists };
		delete rest[queue];
		set(rest);
	}
}

/** The queue moved from one speaker to another: its playlist goes with it. */
export function movePlayed(from: string, to: string) {
	const item = playlists[from];
	if (!item) return rememberPlayed(to, undefined);
	const rest = { ...playlists, [to]: item };
	delete rest[from];
	set(rest);
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

// Each playlist's tracks, fetched once per page load
const trackLists = new Map<string, Promise<MediaItem[]>>();

/**
 * The playlist the speaker's queue plays the current track from: the one this device started on it,
 * while the track is still one of its songs (something started elsewhere since hides it).
 */
export function usePlayingPlaylist(player: MusicPlayer): MediaItem | undefined {
	const { getHass } = useHassApi();
	const queue = player.leader ?? player.entityId;
	const playlist = useSyncExternalStore(subscribe, () => playlists[queue]);
	const [tracks, setTracks] = useState<{ uri: string; items: MediaItem[] }>();

	useEffect(() => {
		const hass = getHass();
		if (!playlist || !hass) return;
		let active = true;
		let list = trackLists.get(playlist.uri);
		if (!list) {
			list = getTracks(hass, queue, playlist);
			trackLists.set(playlist.uri, list);
			list.catch(() => trackLists.delete(playlist.uri));
		}
		list.then((items) => active && setTracks({ uri: playlist.uri, items })).catch(() => {});
		return () => {
			active = false;
		};
	}, [playlist?.uri, queue]);

	if (!playlist || tracks?.uri !== playlist.uri) return undefined;
	return hasTrack(tracks.items, player) ? playlist : undefined;
}
