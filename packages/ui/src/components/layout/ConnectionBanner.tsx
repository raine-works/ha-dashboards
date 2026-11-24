/**
 * The "Reconnecting to Home Assistant…" banner, and the hook saying when the connection has been
 * down long enough to show it.
 *
 * @module
 */

import { Loader2 } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassConnection } from '../../context/HassContext';

/** A drop shorter than this (a Wi-Fi blip, the app coming back from the background) shows nothing. */
export const CONNECTION_GRACE_MS = 3000;

/**
 * Whether the websocket to Home Assistant has been down for over `graceMs`. Home Assistant queues
 * service calls while it reconnects and the states on screen stop updating, so a tap seems to do
 * nothing; this says why.
 */
export function useConnectionLost(graceMs = CONNECTION_GRACE_MS): boolean {
	const connection = useHassConnection();
	const [lost, setLost] = useState(false);

	useEffect(() => {
		if (!connection?.addEventListener) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		// The grace period runs from the drop: each failed reconnect attempt (every second or two at
		// first) mustn't restart it, or the banner never shows while it keeps failing
		const down = () => {
			if (timer === undefined) timer = setTimeout(() => setLost(true), graceMs);
		};
		const up = () => {
			clearTimeout(timer);
			timer = undefined;
			setLost(false);
		};
		if (connection.connected === false) down();
		else up();
		connection.addEventListener('disconnected', down);
		connection.addEventListener('reconnect-error', down);
		connection.addEventListener('ready', up);
		return () => {
			clearTimeout(timer);
			connection.removeEventListener?.('disconnected', down);
			connection.removeEventListener?.('reconnect-error', down);
			connection.removeEventListener?.('ready', up);
		};
	}, [connection, graceMs]);

	return lost;
}

/** "Reconnecting to Home Assistant…" at the top of the dashboard while the connection is down. */
export const ConnectionBanner: React.FC = () => {
	const lost = useConnectionLost();
	if (!lost) return null;
	return (
		<div
			role="status"
			aria-live="polite"
			className="pointer-events-none fixed inset-x-0 top-[calc(var(--panel-top)+(--spacing(2)))] z-60 flex justify-center px-4"
		>
			<div className="flex items-center gap-2 rounded-full border border-warning bg-popover px-4 py-2 font-medium text-popover-foreground text-sm shadow-lg">
				<Loader2 className="size-4 animate-spin text-warning" />
				Reconnecting to Home Assistant… changes may not show yet
			</div>
		</div>
	);
};
