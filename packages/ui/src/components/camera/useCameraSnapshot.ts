/**
 * A camera's near-live snapshot, for its tiles.
 *
 * @module
 */

import { useEffect, useState } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import { snapshotUrl } from '../../lib/cameras';

/**
 * A new snapshot this long after the last one arrived (UniFi Protect makes a fresh frame for every
 * request: ~0.5s and ~90KB for the doorbell). The next waits for the last, so a slow link never
 * stacks requests.
 */
export const SNAPSHOT_REFRESH_MS = 5000;
/** A snapshot older than this is out of date: shown dimmed and blurred until a new one arrives. */
export const SNAPSHOT_STALE_MS = 15_000;

/** {@link useCameraSnapshot}'s result. */
export interface CameraSnapshot {
	/** The latest frame (an object URL), once one has arrived. */
	src?: string;
	/** When it arrived (epoch ms). */
	at?: number;
	/** Older than `SNAPSHOT_STALE_MS`: a page back from the background, or refreshes failing. */
	stale: boolean;
}

/**
 * A camera's snapshot, kept close to live: refreshed every `SNAPSHOT_REFRESH_MS` while the page is
 * in view and `enabled` (the tile passes false while it's off screen or under a dialog), each frame swapped in only once it has loaded (no flash), and
 * flagged `stale` the moment it's out of date, including right as a page wakes with an old one.
 */
export function useCameraSnapshot(entityId: string, enabled = true): CameraSnapshot {
	const { getHass } = useHassApi();
	const [snapshot, setSnapshot] = useState<CameraSnapshot & { for?: string }>({ stale: true });

	useEffect(() => {
		// Paused (off screen, under a dialog) and back: the last frame stays, marked if it's out of date
		setSnapshot((prev) =>
			prev.for !== entityId
				? { for: entityId, stale: true }
				: prev.at && Date.now() - prev.at <= SNAPSHOT_STALE_MS
					? prev
					: { ...prev, stale: true },
		);
		if (!enabled) return;
		let active = true;
		let lastAt = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let staleTimer: ReturnType<typeof setTimeout> | undefined;
		let fetching = false;
		// The last picture URL Home Assistant refused (a token from before a restart)
		let rejected: string | undefined;

		const markStale = () => active && setSnapshot((prev) => (prev.stale ? prev : { ...prev, stale: true }));

		// A data URL (nothing to revoke when the loop pauses and starts again), decoded before it's
		// shown, so the swap never flashes
		const show = async (blob: Blob) => {
			const src = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result));
				reader.onerror = () => reject(reader.error);
				reader.readAsDataURL(blob);
			});
			const img = new Image();
			img.src = src;
			await img.decode().catch(() => {});
			if (!active) return;
			lastAt = Date.now();
			setSnapshot({ for: entityId, src, at: lastAt, stale: false });
			clearTimeout(staleTimer);
			staleTimer = setTimeout(markStale, SNAPSHOT_STALE_MS);
		};

		const refresh = () => {
			clearTimeout(timer);
			if (!active || fetching || document.visibilityState === 'hidden') return;
			// The entity's picture URL carries an access token Home Assistant rotates every 5 minutes,
			// and replaces on a restart: none while the socket is down or the token was refused
			const picture = snapshotUrl(getHass(), entityId, rejected);
			fetching = true;
			const next = picture
				? fetch(picture, { cache: 'no-store' })
						.then((res) => {
							if (res.status === 401 || res.status === 403) rejected = picture;
							return res.ok ? res.blob() : Promise.reject(new Error(res.statusText));
						})
						.then((blob) => (active ? show(blob) : undefined))
				: Promise.resolve();
			next
				// A failed one keeps the last frame, which turns stale on its own
				.catch(() => {})
				.then(() => {
					fetching = false;
					if (active) timer = setTimeout(refresh, SNAPSHOT_REFRESH_MS);
				});
		};

		// Back in view: what's shown may be from hours ago, so say so and fetch at once
		const onVisibility = () => {
			if (document.visibilityState !== 'visible') return;
			if (Date.now() - lastAt > SNAPSHOT_STALE_MS) markStale();
			refresh();
		};
		document.addEventListener('visibilitychange', onVisibility);
		refresh();

		return () => {
			active = false;
			clearTimeout(timer);
			clearTimeout(staleTimer);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}, [entityId, enabled]);

	return snapshot;
}
