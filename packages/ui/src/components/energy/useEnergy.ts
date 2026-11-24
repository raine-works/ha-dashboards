/**
 * Energy data for the header and the Energy dialog: Home Assistant's Energy settings, live watts, and
 * the long-term statistics behind the charts.
 *
 * @module
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'preact/compat';
import { useHassApi, useHassReady, useHassSelector } from '../../context/HassContext';
import {
	baseLoad,
	buildEnergyModel,
	type ChartBucket,
	chartBuckets,
	type EnergyModel,
	type EnergyPeriod,
	type EnergyPrefs,
	formatWatts,
	hourlyTotals,
	type LivePower,
	livePower,
	type PeriodBounds,
	type PeriodSummary,
	periodBounds,
	periodSummary,
	powerIds,
	previousTotal,
	type StatisticRows,
} from '../../lib/energy';
import type { HomeAssistant } from '../../types/homeassistant';

// Home Assistant's Energy settings, fetched once per page (every header reads them for the live
// watts) and again whenever the dialog opens, so a device added in Home Assistant shows up.
let prefs: EnergyPrefs | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function loadPrefs(hass: HomeAssistant) {
	if (!hass.callWS || loading) return;
	loading = hass
		.callWS<EnergyPrefs>({ type: 'energy/get_prefs' })
		.then((next) => {
			prefs = next;
			for (const listener of listeners) listener();
		})
		// No Energy settings yet (Home Assistant answers "not_found"): nothing to show
		.catch(() => undefined)
		.finally(() => {
			loading = null;
		});
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

/** The Energy settings (null until loaded, or without any); `refresh` fetches them again. */
function useEnergyPrefs(refresh = false): EnergyPrefs | null {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const current = useSyncExternalStore(subscribe, () => prefs);
	useEffect(() => {
		const hass = getHass();
		if (ready && hass && (refresh || !prefs)) loadPrefs(hass);
	}, [ready, refresh]);
	return current;
}

/**
 * The grid meters and circuits from the Energy settings, with their power sensors. Null until the
 * settings load, or when they have no grid meter.
 */
export function useEnergyModel(refresh = false): EnergyModel | null {
	const settings = useEnergyPrefs(refresh);
	// Power sensors are matched once per settings (watch nothing: state updates never change them)
	const model = useHassSelector(
		(hass) => (settings && hass ? buildEnergyModel(settings, hass.states, hass.entities) : null),
		{ watch: [] },
	);
	return model && model.grid.length > 0 ? model : null;
}

/** Live watts for the house and every circuit; re-renders only when one of their power sensors changes. */
export function useLivePower(model: EnergyModel | null): LivePower | null {
	const ids = model ? new Set(powerIds(model)) : null;
	return useHassSelector((hass) => (model && hass ? livePower(model, hass.states) : null), {
		watch: (id) => !!ids?.has(id),
	});
}

/** The house's live draw as shown ("905 W", "1.2 kW"; every grid meter), for the header; undefined without one. */
export function useHouseWatts(): string | undefined {
	const model = useEnergyModel();
	const ids = new Set(model?.grid.map((m) => m.powerId).filter(Boolean));
	return useHassSelector(
		(hass) => {
			if (!model || !hass) return undefined;
			const total = livePower({ grid: model.grid, circuits: [] }, hass.states).total;
			// The text shown: the meters report every few seconds, and above 1 kW most readings change
			// nothing on screen (a 1 W change re-rendered the header)
			return total === undefined ? undefined : formatWatts(total);
		},
		{ watch: (id) => ids.has(id) },
	);
}

/** Statistics are compiled at the end of each hour; reading them more often finds nothing new. */
const HISTORY_REFRESH_MS = 5 * 60_000;

/** A period's energy, from {@link useEnergyHistory}. */
export interface EnergyHistory {
	/** The period's start and end, and its chart's bucket. */
	bounds: PeriodBounds;
	/** The period's totals, house and circuits; undefined until its statistics load. */
	summary?: PeriodSummary;
	/** The house's energy over the previous period, up to the same point. */
	previous?: number;
	/** The chart's bars, by circuit (empty until loaded). */
	buckets: ChartBucket[];
	/** The always-on draw (W), from the last week's hours. */
	baseLoad?: number;
	/** The statistics are being fetched. */
	loading: boolean;
	/** The last fetch failed. */
	error: boolean;
	/** Fetch the statistics again (after a failure). */
	retry: () => void;
}

/**
 * The period's totals, its chart and the comparison, from Home Assistant's long-term statistics:
 * every circuit by the chart's bucket (hours today, days this week or month), and the house by
 * hour from the previous period's start (the comparison by the same hour, and the base load from
 * the last week). Fetched when the period changes and every 5 minutes while `enabled`.
 */
export function useEnergyHistory(model: EnergyModel | null, period: EnergyPeriod, enabled: boolean): EnergyHistory {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const [tick, setTick] = useState(0);
	const [state, setState] = useState<{
		key: string;
		rows?: StatisticRows;
		house?: StatisticRows;
		loading: boolean;
		error: boolean;
	}>({ key: '', loading: true, error: false });

	useEffect(() => {
		if (!enabled) return;
		const timer = setInterval(() => setTick((n) => n + 1), HISTORY_REFRESH_MS);
		return () => clearInterval(timer);
	}, [enabled]);

	// The hour in progress: the statistics, and everything worked out from them, change only with it
	const hour = periodBounds(period, new Date()).now.getTime();
	const key = `${period}:${hour}:${model ? model.circuits.length : 0}`;

	useEffect(() => {
		const hass = getHass();
		if (!enabled || !ready || !model || !hass?.callWS) return;
		const callWS = hass.callWS;
		let cancelled = false;
		const at = periodBounds(period, new Date());
		const gridIds = model.grid.map((m) => m.statId);
		const weekAgo = new Date(at.now.getTime() - 7 * 86_400_000);
		const statistics = (ids: string[], from: Date, bucket: string) =>
			callWS<StatisticRows>({
				type: 'recorder/statistics_during_period',
				start_time: from.toISOString(),
				end_time: at.end.toISOString(),
				statistic_ids: ids,
				period: bucket,
				types: ['change'],
				units: { energy: 'kWh' },
			});
		setState((s) => ({ ...s, loading: true }));
		Promise.all([
			statistics([...gridIds, ...model.circuits.map((c) => c.statId)], at.start, at.bucket),
			statistics(gridIds, at.previousStart < weekAgo ? at.previousStart : weekAgo, 'hour'),
		])
			.then(([rows, house]) => {
				if (!cancelled) setState({ key, rows, house, loading: false, error: false });
			})
			.catch(() => {
				if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }));
			});
		return () => {
			cancelled = true;
		};
	}, [enabled, ready, model, key, tick]);

	// The last period's numbers stay up while the next period loads, but never under its name
	const current = state.key.split(':')[0] === period;
	const { rows, house } = state;
	// Worked out again only when the statistics, the period or the hour change: the dialog re-renders
	// with every live watt, and new buckets each time redrew the period's chart with it
	const derived = useMemo(() => {
		const bounds = periodBounds(period, new Date(hour));
		const hours = model && house ? hourlyTotals(model, house).slice(-24 * 7) : [];
		return {
			bounds,
			summary: model && rows && current ? periodSummary(model, rows, bounds) : undefined,
			previous: model && house && current ? previousTotal(model, house, bounds) : undefined,
			buckets: model && rows && current ? chartBuckets(model, rows, bounds) : [],
			baseLoad: baseLoad(hours),
		};
	}, [model, rows, house, period, hour, current]);
	return { ...derived, loading: state.loading, error: state.error, retry: () => setTick((n) => n + 1) };
}

/**
 * The house's draw over the last 24 hours (the grid meters' 5-minute mean power), fetched on
 * open and every 5 minutes (each new 5-minute statistic); undefined until loaded.
 */
export function usePowerHistory(model: EnergyModel | null, enabled: boolean): StatisticRows | undefined {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const [tick, setTick] = useState(0);
	const [rows, setRows] = useState<StatisticRows>();

	useEffect(() => {
		if (!enabled) return;
		const timer = setInterval(() => setTick((n) => n + 1), HISTORY_REFRESH_MS);
		return () => clearInterval(timer);
	}, [enabled]);

	useEffect(() => {
		const hass = getHass();
		const ids = model?.grid.map((m) => m.powerId).filter((id): id is string => !!id) ?? [];
		if (!enabled || !ready || !hass?.callWS || ids.length === 0) return;
		let cancelled = false;
		hass
			.callWS<StatisticRows>({
				type: 'recorder/statistics_during_period',
				start_time: new Date(Date.now() - 86_400_000).toISOString(),
				statistic_ids: ids,
				period: '5minute',
				types: ['mean'],
				units: { power: 'W' },
			})
			.then((next) => !cancelled && setRows(next))
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [enabled, ready, model, tick]);

	return rows;
}
