import { useEffect, useState } from 'preact/compat';

/**
 * Epoch ms, ticking every `intervalMs` while `active` (a track's position, a dialog's "5 min ago"s
 * while it's open) and read once more as it starts or stops. Keep it in the smallest component that
 * shows the time: every tick re-renders its user.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		setNow(Date.now());
		if (!active) return;
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [active, intervalMs]);
	return now;
}
