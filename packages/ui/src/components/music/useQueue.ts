import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady } from '../../context/HassContext';
import { getQueuePage, type MediaItem, type MusicPlayer, type QueuePage } from '../../lib/music';

/**
 * Home Assistant says nothing when a queue changes (only when the song does), so an open Queue tab
 * reads it again this often, besides on every new song and after each edit.
 */
const QUEUE_REFRESH_MS = 15_000;

/**
 * A speaker's whole queue, from the playing song on (`limit` songs; Music Assistant through Home
 * Assistant, `getQueuePage()`), while `enabled` (turned off during an edit, which also drops a read
 * already on its way, so it can't undo the edit on screen): read again on a new song, on `reload()`, and with
 * `poll` every 15s while the page is in view. `undefined` until read; `null` when Music Assistant
 * can't say.
 */
export function useQueuePage(player: MusicPlayer, enabled: boolean, limit: number, poll = true) {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	// Kept with the speaker it was read for: another speaker never shows (or edits) this one's songs
	const [read, setRead] = useState<{ for: string; page: QueuePage | null }>();
	const [reloads, setReloads] = useState(0);
	const page = read?.for === player.entityId ? read.page : undefined;
	const setPage = (next: QueuePage | null) => setRead({ for: player.entityId, page: next });

	useEffect(() => {
		const hass = getHass();
		if (!enabled || !ready || !hass) return;
		const speaker = { entityId: player.entityId, queueId: player.queueId };
		let active = true;
		const readPage = () => {
			if (document.visibilityState === 'hidden') return;
			getQueuePage(hass, speaker, { limit })
				.then((next) => active && setRead({ for: speaker.entityId, page: next ?? null }))
				.catch(() => active && setRead({ for: speaker.entityId, page: null }));
		};
		readPage();
		const timer = poll ? setInterval(readPage, QUEUE_REFRESH_MS) : undefined;
		return () => {
			active = false;
			clearInterval(timer);
		};
	}, [enabled, ready, player.entityId, player.queueId, player.title, player.contentId, limit, poll, reloads]);

	return { page, setPage, reload: () => setReloads((n) => n + 1) };
}

/**
 * The playlist or album the speaker's queue was started from, as Music Assistant records it (its
 * queue's `sources`), read again on each new song. Undefined for a queue of separate songs.
 */
export function useQueueSource(player: MusicPlayer, enabled: boolean): MediaItem | undefined {
	const { page } = useQueuePage(player, enabled, 1, false);
	return page?.source;
}
