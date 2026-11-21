import type { HassEntity, HassEntityRegistryEntry } from '../types/homeassistant';
import { startOfDay } from './time';

// Home Assistant's Energy dashboard settings (`energy/get_prefs`) are the source of truth: the grid
// meters are the house's total, the devices its circuits and appliances (a device's
// `included_in_stat` nests it under another, e.g. the washer under its laundry circuit). Live watts
// come from each energy sensor's power sensor; history from the recorder's hourly statistics.

export interface EnergyPrefs {
	energy_sources?: {
		type: string;
		stat_energy_from?: string | null;
		/** The grid's format before Home Assistant 2025.x: one entry per meter. */
		flow_from?: { stat_energy_from: string }[];
	}[];
	device_consumption?: { stat_consumption: string; name?: string | null; included_in_stat?: string | null }[];
}

export interface EnergyMeter {
	/** The energy statistic (kWh). */
	statId: string;
	/** Its live power sensor (W), when one is found. */
	powerId?: string;
}

export interface EnergyCircuit extends EnergyMeter {
	name: string;
	/** The circuit this one is measured within (shown under it, left out of the house's split). */
	parent?: string;
	/** Its chart color, `--chart-<n>` (1–7), for the first top-level circuits in the settings' order; the rest share Other. */
	color?: number;
}

export interface EnergyModel {
	/** The house's total: every grid meter (a 240V service's two legs). */
	grid: EnergyMeter[];
	/** Every device in the settings' order, nested ones included. */
	circuits: EnergyCircuit[];
}

/** Series colors: the theme's `--chart-1`…`--chart-7`; past these, circuits fold into Other. */
export const CIRCUIT_COLORS = 7;

/** A circuit drawing more than this is "running" (a furnace blower idles under it, heating over it). */
export const RUNNING_WATTS = 300;

// `<name>_today_energy`, `<name>_this_month_energy_2`, `<name>_energy` → `<name>_power`, `<name>_power_2`
const ENERGY_NAME = /^sensor\.(.+?)_(?:(?:today|this_week|this_month|this_year|total|lifetime)_)?energy(_\d+)?$/;

const isPowerSensor = (state?: HassEntity) =>
	state?.attributes.device_class === 'power' && state.attributes.state_class === 'measurement';

/**
 * The power sensor reporting an energy sensor's live draw: by name (the Refoss monitor's 18
 * channels share one device), else the only power sensor on the same device.
 */
export function powerSensorFor(
	energyId: string,
	states: Record<string, HassEntity>,
	entities: Record<string, HassEntityRegistryEntry> = {},
): string | undefined {
	const match = ENERGY_NAME.exec(energyId);
	const byName = match && `sensor.${match[1]}_power${match[2] ?? ''}`;
	if (byName && isPowerSensor(states[byName])) return byName;

	const deviceId = entities[energyId]?.device_id;
	if (!deviceId) return undefined;
	const onDevice = Object.values(entities).filter(
		(e) => e.device_id === deviceId && e.entity_id.startsWith('sensor.') && isPowerSensor(states[e.entity_id]),
	);
	return onDevice.length === 1 ? onDevice[0].entity_id : undefined;
}

/** The settings' name for a device, else its sensor's name without the energy words. */
function circuitName(statId: string, name: string | null | undefined, states: Record<string, HassEntity>): string {
	if (name) return name;
	const friendly = states[statId]?.attributes.friendly_name as string | undefined;
	if (!friendly) return statId;
	return friendly.replace(/\s+(today\s+|this\s+month\s+|this\s+week\s+)?energy$/i, '') || friendly;
}

/** The grid meters and devices from the Energy settings, with their power sensors and colors. */
export function buildEnergyModel(
	prefs: EnergyPrefs,
	states: Record<string, HassEntity>,
	entities?: Record<string, HassEntityRegistryEntry>,
): EnergyModel {
	const gridIds = (prefs.energy_sources ?? [])
		.filter((s) => s.type === 'grid')
		.flatMap((s) => (s.flow_from ? s.flow_from.map((f) => f.stat_energy_from) : [s.stat_energy_from]))
		.filter((id): id is string => !!id);
	const devices = prefs.device_consumption ?? [];
	const known = new Set(devices.map((d) => d.stat_consumption));

	let tops = 0;
	const circuits = devices.map((d): EnergyCircuit => {
		const parent = d.included_in_stat && known.has(d.included_in_stat) ? d.included_in_stat : undefined;
		const color = parent ? undefined : ++tops <= CIRCUIT_COLORS ? tops : undefined;
		return {
			statId: d.stat_consumption,
			name: circuitName(d.stat_consumption, d.name, states),
			powerId: powerSensorFor(d.stat_consumption, states, entities),
			...(parent && { parent }),
			...(color !== undefined && { color }),
		};
	});

	return {
		grid: gridIds.map((statId) => ({ statId, powerId: powerSensorFor(statId, states, entities) })),
		circuits,
	};
}

/** Every power sensor the model reads (what a live view watches). */
export const powerIds = (model: EnergyModel): string[] =>
	[...model.grid, ...model.circuits].map((m) => m.powerId).filter((id): id is string => !!id);

/** A power sensor's reading in watts (kW converted), undefined while unavailable. */
export function readWatts(state?: HassEntity): number | undefined {
	if (!state) return undefined;
	const value = Number.parseFloat(state.state);
	if (!Number.isFinite(value)) return undefined;
	const unit = state.attributes.unit_of_measurement;
	return unit === 'kW' ? value * 1000 : unit === 'MW' ? value * 1_000_000 : value;
}

export interface LivePower {
	/** The house's draw (every grid meter), undefined while none reports. */
	total?: number;
	/** Each circuit's draw, by energy statistic. */
	circuits: Record<string, number | undefined>;
	/** What no top-level circuit accounts for. */
	untracked?: number;
}

const topLevel = (model: EnergyModel) => model.circuits.filter((c) => !c.parent);

export function livePower(model: EnergyModel, states: Record<string, HassEntity>): LivePower {
	const grid = model.grid.map((m) => (m.powerId ? readWatts(states[m.powerId]) : undefined));
	const total = grid.some((w) => w !== undefined) ? grid.reduce<number>((sum, w) => sum + (w ?? 0), 0) : undefined;
	const circuits = Object.fromEntries(
		model.circuits.map((c) => [c.statId, c.powerId ? readWatts(states[c.powerId]) : undefined]),
	);
	const measured = topLevel(model).reduce((sum, c) => sum + (circuits[c.statId] ?? 0), 0);
	return { total, circuits, untracked: total === undefined ? undefined : Math.max(0, total - measured) };
}

/** Circuits running now (over `RUNNING_WATTS`), biggest first; a running child stands for its parent. */
export function runningCircuits(
	model: EnergyModel,
	live: LivePower,
	threshold = RUNNING_WATTS,
): { circuit: EnergyCircuit; watts: number }[] {
	const running = model.circuits
		.map((circuit) => ({ circuit, watts: live.circuits[circuit.statId] ?? 0 }))
		.filter((r) => r.watts > threshold);
	const parents = new Set(running.map((r) => r.circuit.parent).filter(Boolean));
	return running.filter((r) => !parents.has(r.circuit.statId)).sort((a, b) => b.watts - a.watts);
}

// ── Periods and statistics ──────────────────────────────────────────────────────────────────────

export type EnergyPeriod = 'today' | 'week' | 'month';
export type EnergyBucket = 'hour' | 'day';

export interface PeriodBounds {
	period: EnergyPeriod;
	bucket: EnergyBucket;
	start: Date;
	/** The period's end (tomorrow, next Monday, the 1st), for the chart's empty future. */
	end: Date;
	/** The bucket in progress: statistics cover whole hours, so totals run to its start. */
	now: Date;
	/** The previous period's start, and the same time into it as `now` is into this one. */
	previousStart: Date;
	previousNow: Date;
	/** Every bucket's start, the future included (24 hours, 7 days, the month's days). */
	buckets: Date[];
}

/** Today (by hour), this week from Monday, or this month (by day), and the previous one to compare. */
export function periodBounds(period: EnergyPeriod, at: Date): PeriodBounds {
	const today = startOfDay(at);
	// The hour in progress, by subtracting into it: building it from the clock (or `setMinutes`)
	// puts the second 1 AM of the night the clocks fall back on the first one, an hour early
	const hour = new Date(at.getTime() - ((at.getMinutes() * 60 + at.getSeconds()) * 1000 + at.getMilliseconds()));
	if (period === 'today') {
		const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
		const previousStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
		const buckets: Date[] = [];
		for (let h = new Date(today); h < end; h = new Date(h.getTime() + 3_600_000)) buckets.push(h);
		return {
			period,
			bucket: 'hour',
			start: today,
			end,
			now: hour,
			previousStart,
			// The same hour yesterday by the clock (a day of 23 or 25 hours, across DST, lines up too)
			previousNow: new Date(
				previousStart.getFullYear(),
				previousStart.getMonth(),
				previousStart.getDate(),
				hour.getHours(),
			),
			buckets,
		};
	}
	const start =
		period === 'week'
			? new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
			: new Date(today.getFullYear(), today.getMonth(), 1);
	const end =
		period === 'week'
			? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
			: new Date(start.getFullYear(), start.getMonth() + 1, 1);
	const previousStart =
		period === 'week'
			? new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7)
			: new Date(start.getFullYear(), start.getMonth() - 1, 1);
	// The same day and hour into the previous period (by calendar, so DST and month lengths line up),
	// never past its end (the 31st against a 30-day month)
	const days = Math.round((today.getTime() - start.getTime()) / 86_400_000);
	const previousNow = new Date(
		previousStart.getFullYear(),
		previousStart.getMonth(),
		previousStart.getDate() + days,
		hour.getHours(),
	);
	const buckets: Date[] = [];
	for (let d = start; d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) buckets.push(d);
	return {
		period,
		bucket: 'day',
		start,
		end,
		now: hour,
		previousStart,
		previousNow: previousNow < start ? previousNow : start,
		buckets,
	};
}

/** `recorder/statistics_during_period` rows, by statistic id (`start` in ms; `change` for energy, `mean` for power). */
export type StatisticRows = Record<
	string,
	{ start: number; change?: number | null; mean?: number | null }[] | undefined
>;

/** A statistic's energy from `from` up to (not including) `to`. */
export function sumChange(rows: StatisticRows, statId: string, from: Date, to: Date): number {
	const a = from.getTime();
	const b = to.getTime();
	return (rows[statId] ?? []).reduce((sum, r) => (r.start >= a && r.start < b ? sum + (r.change ?? 0) : sum), 0);
}

export interface CircuitTotal {
	circuit: EnergyCircuit;
	kWh: number;
}

export interface PeriodSummary {
	/** The house's energy so far this period. */
	total: number;
	/** Each circuit's, in the settings' order (nested ones too). */
	circuits: CircuitTotal[];
	untracked: number;
}

export function periodSummary(model: EnergyModel, rows: StatisticRows, bounds: PeriodBounds): PeriodSummary {
	const total = model.grid.reduce((sum, m) => sum + sumChange(rows, m.statId, bounds.start, bounds.now), 0);
	const circuits = model.circuits.map((circuit) => ({
		circuit,
		kWh: sumChange(rows, circuit.statId, bounds.start, bounds.now),
	}));
	const measured = circuits.filter((c) => !c.circuit.parent).reduce((sum, c) => sum + c.kWh, 0);
	return { total, circuits, untracked: Math.max(0, total - measured) };
}

/** The house's energy over the previous period up to the same point (yesterday by this hour). */
export const previousTotal = (model: EnergyModel, rows: StatisticRows, bounds: PeriodBounds): number =>
	model.grid.reduce((sum, m) => sum + sumChange(rows, m.statId, bounds.previousStart, bounds.previousNow), 0);

/** A chart series: a colored circuit (its statistic), Other (uncolored circuits) or Untracked. */
export type SeriesKey = string;
export const OTHER = 'other';
export const UNTRACKED = 'untracked';

export interface ChartBucket {
	start: Date;
	/** Not reached yet (or in progress): drawn empty. */
	future: boolean;
	total: number;
	/** Stacked from the baseline: colored circuits in order, Other, Untracked (zeros left out). */
	parts: { key: SeriesKey; kWh: number }[];
}

/** Each bucket's split for the stacked chart, from rows bucketed like `bounds.bucket`. */
export function chartBuckets(model: EnergyModel, rows: StatisticRows, bounds: PeriodBounds): ChartBucket[] {
	const tops = topLevel(model);
	return bounds.buckets.map((start, i) => {
		const next = bounds.buckets[i + 1] ?? bounds.end;
		const future = start >= bounds.now;
		if (future) return { start, future, total: 0, parts: [] };
		const total = model.grid.reduce((sum, m) => sum + sumChange(rows, m.statId, start, next), 0);
		const colored = tops
			.filter((c) => c.color !== undefined)
			.map((c) => ({ key: c.statId, kWh: sumChange(rows, c.statId, start, next) }));
		const other = tops
			.filter((c) => c.color === undefined)
			.reduce((sum, c) => sum + sumChange(rows, c.statId, start, next), 0);
		const measured = colored.reduce((sum, p) => sum + p.kWh, other);
		const parts = [...colored, { key: OTHER, kWh: other }, { key: UNTRACKED, kWh: Math.max(0, total - measured) }];
		return { start, future, total: Math.max(total, measured), parts: parts.filter((p) => p.kWh > 0) };
	});
}

/**
 * A series' key in chart data: `c<n>` for a colored circuit, `other`, `untracked`. Recharts reads
 * a dotted key (an entity id) as a path into the row, so series never use their statistic ids.
 */
export function seriesId(key: SeriesKey, model: EnergyModel): string {
	if (key === OTHER || key === UNTRACKED) return key;
	const color = model.circuits.find((c) => c.statId === key)?.color;
	return color ? `c${color}` : OTHER;
}

/** Every series the chart stacks, bottom to top: the colored circuits, Other (when any), Untracked. */
export function chartSeries(model: EnergyModel): { id: string; name: string; color?: number }[] {
	const tops = topLevel(model);
	return [
		...tops.filter((c) => c.color).map((c) => ({ id: `c${c.color}`, name: c.name, color: c.color })),
		...(tops.some((c) => !c.color) ? [{ id: OTHER, name: 'Other circuits' }] : []),
		{ id: UNTRACKED, name: 'Untracked' },
	];
}

export interface ChartRow {
	/** The bucket's start (ms). */
	start: number;
	label: string;
	/** kWh per series id; null in the future, so nothing is drawn there. */
	[series: string]: number | string | null;
}

/** The buckets as chart rows, every series present (0 when it used nothing). */
export function chartRows(model: EnergyModel, buckets: ChartBucket[], period: EnergyPeriod): ChartRow[] {
	const ids = chartSeries(model).map((s) => s.id);
	return buckets.map((bucket) => {
		const row: ChartRow = { start: bucket.start.getTime(), label: formatBucket(bucket.start, period) };
		for (const id of ids) row[id] = bucket.future ? null : 0;
		for (const part of bucket.parts) {
			const id = seriesId(part.key, model);
			row[id] = ((row[id] as number | null) ?? 0) + part.kWh;
		}
		return row;
	});
}

/**
 * The house's draw over time (W) from the grid meters' 5-minute mean power, oldest first, with
 * the live reading appended (statistics trail the present by up to five minutes).
 */
export function powerTimeline(
	model: EnergyModel,
	rows: StatisticRows,
	live?: { at: number; watts: number },
): { at: number; watts: number }[] {
	const ids = model.grid.map((m) => m.powerId).filter((id): id is string => !!id);
	const byTime = new Map<number, { sum: number; count: number }>();
	for (const id of ids) {
		for (const r of rows[id] ?? []) {
			if (r.mean == null) continue;
			const point = byTime.get(r.start) ?? { sum: 0, count: 0 };
			point.sum += r.mean;
			point.count++;
			byTime.set(r.start, point);
		}
	}
	// Only moments every meter reported (one leg missing would halve the house)
	const points = [...byTime.entries()]
		.filter(([, p]) => p.count === ids.length)
		.sort((a, b) => a[0] - b[0])
		.map(([at, p]) => ({ at, watts: p.sum }));
	return live ? [...points, live] : points;
}

/**
 * The house's always-on draw (W): the 10th percentile of its hourly energy (fridges, furnace
 * blowers, electronics on standby), skipping empty hours. Undefined with under a day of hours.
 */
export function baseLoad(hourlyKwh: number[]): number | undefined {
	const hours = hourlyKwh.filter((kWh) => kWh > 0).sort((a, b) => a - b);
	if (hours.length < 24) return undefined;
	return hours[Math.floor(hours.length * 0.1)] * 1000;
}

/** The house's hourly energy (every grid meter), oldest first. */
export function hourlyTotals(model: EnergyModel, rows: StatisticRows): number[] {
	const byHour = new Map<number, number>();
	for (const m of model.grid) {
		for (const r of rows[m.statId] ?? []) byHour.set(r.start, (byHour.get(r.start) ?? 0) + (r.change ?? 0));
	}
	return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([, kWh]) => kWh);
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────────

/** "426 W", "1.2 kW", "12 kW". */
export function formatWatts(watts?: number): string {
	if (watts === undefined) return '—';
	const w = Math.abs(watts) < 0.5 ? 0 : watts;
	if (Math.abs(w) < 1000) return `${Math.round(w)} W`;
	const kw = w / 1000;
	return `${Math.abs(kw) < 10 ? kw.toFixed(1) : Math.round(kw)} kW`;
}

/** "0.25 kWh", "8.2 kWh", "364 kWh". */
export function formatKwh(kWh: number, unit = true): string {
	const value = kWh < 1 ? kWh.toFixed(2) : kWh < 100 ? kWh.toFixed(1) : Math.round(kWh).toLocaleString('en-US');
	return unit ? `${value} kWh` : value;
}

/** What the change is measured against: "yesterday", "last week", "last month". */
export const PREVIOUS_LABEL: Record<EnergyPeriod, string> = {
	today: 'yesterday',
	week: 'last week',
	month: 'last month',
};

/** The change from the previous period: "12% less than yesterday by now", or nothing to compare. */
export function compareToPrevious(
	current: number,
	previous: number,
	period: EnergyPeriod,
): { text: string; direction: 'up' | 'down' | 'same' } | undefined {
	if (previous <= 0) return undefined;
	const pct = Math.round(((current - previous) / previous) * 100);
	const when = `${PREVIOUS_LABEL[period]} by now`;
	if (Math.abs(pct) < 2) return { text: `About the same as ${when}`, direction: 'same' };
	return pct > 0
		? { text: `${pct}% more than ${when}`, direction: 'up' }
		: { text: `${-pct}% less than ${when}`, direction: 'down' };
}

/** A chart bucket's label: "3 PM" for hours, "Mon" for the week's days, "24" for the month's. */
export function formatBucket(start: Date, period: EnergyPeriod): string {
	if (period === 'today') {
		const h = start.getHours();
		return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
	}
	if (period === 'week') return start.toLocaleDateString('en-US', { weekday: 'short' });
	return String(start.getDate());
}

/** A bucket's full name for its details: "3 PM – 4 PM", "Monday, Oct 20", "Friday, Oct 24". */
export function describeBucket(start: Date, period: EnergyPeriod): string {
	if (period === 'today') {
		const next = new Date(start.getTime() + 3_600_000);
		return `${formatBucket(start, period)} – ${formatBucket(next, period)}`;
	}
	return start.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** A steady draw's energy over a month (730 hours), for the always-on insight. */
export const monthlyKwh = (watts: number) => (watts * 730) / 1000;
