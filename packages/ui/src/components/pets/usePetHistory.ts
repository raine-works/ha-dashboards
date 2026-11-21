import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady } from '../../context/HassContext';
import type { DailyStatRows } from '../../lib/pets';

/** The longest chart's days (weight); the visits and food charts read the end of it. */
export const PET_HISTORY_DAYS = 30;
/** Statistics are compiled at the end of each hour; reading them more often finds nothing new. */
const REFRESH_MS = 5 * 60_000;

/**
 * Daily statistics (`change` and `mean`) for the pet sensors over the last 30 days, from Home
 * Assistant's long-term statistics, fetched on open and every 5 minutes while `enabled`. Undefined
 * until loaded; `error` when Home Assistant refused.
 */
export function usePetHistory(statIds: string[], enabled: boolean): { rows?: DailyStatRows; error: boolean } {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const [tick, setTick] = useState(0);
	const [state, setState] = useState<{ rows?: DailyStatRows; error: boolean }>({ error: false });
	const key = statIds.join(',');

	useEffect(() => {
		if (!enabled) return;
		const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
		return () => clearInterval(timer);
	}, [enabled]);

	useEffect(() => {
		const hass = getHass();
		if (!enabled || !ready || !key || !hass?.callWS) return;
		let cancelled = false;
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (PET_HISTORY_DAYS - 1));
		hass
			.callWS<DailyStatRows>({
				type: 'recorder/statistics_during_period',
				start_time: start.toISOString(),
				end_time: now.toISOString(),
				statistic_ids: key.split(','),
				period: 'day',
				types: ['change', 'mean'],
			})
			.then((rows) => {
				if (!cancelled) setState({ rows, error: false });
			})
			.catch(() => {
				if (!cancelled) setState((s) => ({ ...s, error: true }));
			});
		return () => {
			cancelled = true;
		};
	}, [enabled, ready, key, tick]);

	return state;
}
