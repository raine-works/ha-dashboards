/**
 * Keeps an open page on the latest dashboards bundle: it notices a newer deploy and reloads, or
 * offers to.
 *
 * @module
 */

import { useEffect } from 'preact/compat';
import { useHassConnection } from '../../context/HassContext';
import { bundleFile, versionUrl } from '../../lib/bundle';
import { toast } from '../ui';

/** The bundle this page runs (null outside a deployed bundle: dev, tests). */
const RUNNING = bundleFile(import.meta.url);
/** version.json beside it, naming the bundle installed last. */
const VERSION = versionUrl(import.meta.url);
/** How often an open page checks for a newer bundle, besides each deploy's lovelace_updated. */
const CHECK_MS = 5 * 60_000;

/**
 * Notices when a newer dashboards bundle has been deployed. Home Assistant's "Dashboard updated,
 * Refresh" re-reads the YAML, never the code, so a page kept the bundle it loaded until reloaded.
 * Checked on start, when a deploy finishes (it fires lovelace_updated), every few minutes and when the page
 * comes back into view: back from the background it reloads at once (like an app updating);
 * while it's in front of someone, a toast offers Reload. Mounted once per card by definePanelElement.
 */
export const BundleUpdates: React.FC = () => {
	const connection = useHassConnection();

	useEffect(() => {
		if (!RUNNING || !VERSION) return;
		let stale = false;
		let offered = false;
		const check = async () => {
			try {
				const res = await fetch(VERSION, { cache: 'no-store' });
				if (!res.ok) return;
				const { file } = (await res.json()) as { file?: string };
				stale = !!file && file !== RUNNING;
			} catch {
				return;
			}
			if (!stale) return;
			if (document.visibilityState === 'visible' && !offered) {
				offered = true;
				toast('Dashboard updated', {
					id: 'bundle-update',
					description: 'Reload for the latest version.',
					duration: Number.POSITIVE_INFINITY,
					action: { label: 'Reload', onClick: () => location.reload() },
				});
			}
		};
		// Back in view: a newer bundle reloads at once; otherwise look again
		const onVisibility = () => {
			if (document.visibilityState !== 'visible') return;
			if (stale) location.reload();
			else void check();
		};
		document.addEventListener('visibilitychange', onVisibility);
		// Once on start too (a page restored from the back-forward cache can be old)
		void check();
		const timer = setInterval(check, CHECK_MS);
		// A deploy ends by firing lovelace_updated for every dashboard
		let unsubscribe: (() => void) | undefined;
		// A reconnect can replace the connection before the subscription resolves: drop it then
		let active = true;
		connection
			?.subscribeEvents(() => void check(), 'lovelace_updated')
			.then((unsub) => {
				if (active) unsubscribe = unsub;
				else unsub();
			})
			.catch(() => {});
		return () => {
			active = false;
			document.removeEventListener('visibilitychange', onVisibility);
			clearInterval(timer);
			unsubscribe?.();
		};
	}, [connection]);

	return null;
};
