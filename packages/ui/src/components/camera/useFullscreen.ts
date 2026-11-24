/**
 * Full screen for a camera viewer, the browser's own or filling the window.
 *
 * @module
 */

import { useEffect, useState } from 'preact/compat';
import { markDialogActivity } from '../ui';

/** While full screen, tell the dialog someone is watching this often (its idle close is 2 minutes). */
const WATCHING_PING_MS = 30_000;

/**
 * Full screen for a viewer's container (the video and its controls): the browser's own, else
 * (iPhones, where only a video element can) filling the window below Home Assistant's toolbar.
 * While full screen the dialog it's in never closes for being idle.
 */
export function useFullscreen(container: HTMLElement | null) {
	const [nativeFull, setNativeFull] = useState(false);
	const [windowFull, setWindowFull] = useState(false);

	// Full screen is the shadow root's (document's names the card's host)
	// A new (or no) container starts out of full screen: one that closed while full screen (its dialog
	// shut) took the browser's exit event with it, and would otherwise reopen styled full screen
	useEffect(() => {
		setWindowFull(false);
		if (!container) {
			setNativeFull(false);
			return;
		}
		const update = () =>
			setNativeFull((container.getRootNode() as ShadowRoot | Document).fullscreenElement === container);
		update();
		document.addEventListener('fullscreenchange', update);
		return () => document.removeEventListener('fullscreenchange', update);
	}, [container]);

	const fullscreen = nativeFull || windowFull;

	useEffect(() => {
		if (!fullscreen) return;
		const timer = setInterval(markDialogActivity, WATCHING_PING_MS);
		return () => clearInterval(timer);
	}, [fullscreen]);

	const toggle = () => {
		if (nativeFull) void document.exitFullscreen?.().catch(() => {});
		else if (windowFull) setWindowFull(false);
		else if (container?.requestFullscreen) container.requestFullscreen().catch(() => setWindowFull(true));
		else setWindowFull(true);
	};

	return { fullscreen, windowFull, toggle };
}
