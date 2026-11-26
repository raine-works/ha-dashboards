import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	baseLoad,
	buildEnergyModel,
	chartBuckets,
	chartRows,
	chartSeries,
	compareToPrevious,
	describeBucket,
	type EnergyPrefs,
	formatBucket,
	formatKwh,
	formatWatts,
	hourlyTotals,
	livePower,
	OTHER,
	periodBounds,
	periodSummary,
	powerIds,
	powerSensorFor,
	powerTimeline,
	previousTotal,
	readWatts,
	runningCircuits,
	type StatisticRows,
	seriesId,
	sumChange,
	UNTRACKED,
	wattsParts,
} from '../energy';

const power = (entity_id: string, state: string, unit = 'W'): HassEntity =>
	({
		entity_id,
		state,
		attributes: { device_class: 'power', state_class: 'measurement', unit_of_measurement: unit },
	}) as unknown as HassEntity;

const energy = (entity_id: string, friendly_name: string): HassEntity =>
	({
		entity_id,
		state: '1',
		attributes: { device_class: 'energy', state_class: 'total_increasing', friendly_name },
	}) as unknown as HassEntity;

const states: Record<string, HassEntity> = Object.fromEntries(
	[
		power('sensor.em_site_power', '426'),
		power('sensor.em_site_power_2', '479'),
		power('sensor.em_furnace_power', '92'),
		power('sensor.em_laundry_power', '1.4', 'kW'),
		power('sensor.washer_power', '600'),
		power('sensor.dryer_power', 'unavailable'),
		energy('sensor.em_lights_today_energy', 'EM Lights today energy'),
	].map((s) => [s.entity_id, s]),
);

const prefs: EnergyPrefs = {
	energy_sources: [
		{ type: 'grid', stat_energy_from: 'sensor.em_site_today_energy' },
		{ type: 'grid', stat_energy_from: 'sensor.em_site_today_energy_2' },
		{ type: 'solar', stat_energy_from: 'sensor.solar_energy' },
	],
	device_consumption: [
		{ stat_consumption: 'sensor.em_furnace_today_energy', name: 'Furnace' },
		{ stat_consumption: 'sensor.em_laundry_today_energy', name: 'Laundry' },
		{
			stat_consumption: 'sensor.washer_energy',
			name: 'Washer',
			included_in_stat: 'sensor.em_laundry_today_energy',
		},
		{ stat_consumption: 'sensor.em_lights_today_energy' },
	],
};

describe('powerSensorFor', () => {
	it('pairs energy and power sensors by name', () => {
		expect(powerSensorFor('sensor.em_site_today_energy', states)).toBe('sensor.em_site_power');
		expect(powerSensorFor('sensor.em_site_today_energy_2', states)).toBe('sensor.em_site_power_2');
		expect(powerSensorFor('sensor.washer_energy', states)).toBe('sensor.washer_power');
	});

	it('falls back to the only power sensor on the same device', () => {
		const entities = {
			'sensor.heater_consumption': { entity_id: 'sensor.heater_consumption', device_id: 'd1' },
			'sensor.heater_watts': { entity_id: 'sensor.heater_watts', device_id: 'd1' },
		};
		const withHeater = { ...states, 'sensor.heater_watts': power('sensor.heater_watts', '5') };
		expect(powerSensorFor('sensor.heater_consumption', withHeater, entities)).toBe('sensor.heater_watts');
		expect(powerSensorFor('sensor.heater_consumption', states, entities)).toBeUndefined();
	});
});

describe('buildEnergyModel', () => {
	const model = buildEnergyModel(prefs, states);

	it('reads the grid meters and devices', () => {
		expect(model.grid.map((m) => m.powerId)).toEqual(['sensor.em_site_power', 'sensor.em_site_power_2']);
		expect(model.circuits.map((c) => c.name)).toEqual(['Furnace', 'Laundry', 'Washer', 'EM Lights']);
		expect(model.circuits[2].parent).toBe('sensor.em_laundry_today_energy');
	});

	it('colors top-level circuits in order, folding past seven into Other', () => {
		expect(model.circuits.map((c) => c.color)).toEqual([1, 2, undefined, 3]);
		const many = buildEnergyModel(
			{
				device_consumption: Array.from({ length: 9 }, (_, i) => ({ stat_consumption: `sensor.c${i}_energy` })),
			},
			{},
		);
		expect(many.circuits.map((c) => c.color)).toEqual([1, 2, 3, 4, 5, 6, 7, undefined, undefined]);
	});

	it('reads the legacy grid format', () => {
		const legacy = buildEnergyModel(
			{ energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.a_energy' }] }] },
			{},
		);
		expect(legacy.grid.map((m) => m.statId)).toEqual(['sensor.a_energy']);
	});

	it('lists every power sensor it reads', () => {
		expect(powerIds(model)).toContain('sensor.washer_power');
		expect(powerIds(model)).toHaveLength(5);
	});
});

describe('live power', () => {
	const model = buildEnergyModel(prefs, states);

	it('converts kW and skips unavailable readings', () => {
		expect(readWatts(states['sensor.em_laundry_power'])).toBe(1400);
		expect(readWatts(states['sensor.dryer_power'])).toBeUndefined();
	});

	it('splits the house between top-level circuits and untracked', () => {
		const live = livePower(model, states);
		expect(live.total).toBe(905);
		// 905 - (92 furnace + 1400 laundry): the washer is inside laundry, so it isn't counted again
		expect(live.untracked).toBe(0);
		const quiet = livePower(model, { ...states, 'sensor.em_laundry_power': power('sensor.em_laundry_power', '13') });
		expect(quiet.untracked).toBe(800);
	});

	it('names running circuits, a running child standing for its parent', () => {
		const running = runningCircuits(model, livePower(model, states));
		expect(running.map((r) => r.circuit.name)).toEqual(['Washer']);
	});
});

describe('periodBounds', () => {
	const at = new Date(2026, 9, 24, 15, 20); // Saturday, Oct 24, 3:20 PM

	it('covers today by hour, compared with yesterday by the same hour', () => {
		const b = periodBounds('today', at);
		expect(b.bucket).toBe('hour');
		expect(b.start).toEqual(new Date(2026, 9, 24));
		expect(b.now).toEqual(new Date(2026, 9, 24, 15));
		expect(b.previousStart).toEqual(new Date(2026, 9, 23));
		expect(b.previousNow).toEqual(new Date(2026, 9, 23, 15));
		expect(b.buckets).toHaveLength(24);
	});

	it('compares by the clock across a DST change', () => {
		// The day after the clocks fall back (Nov 1, 2026 in the US) and the day they do
		expect(periodBounds('today', new Date(2026, 10, 2, 10, 5)).previousNow).toEqual(new Date(2026, 10, 1, 10));
		expect(periodBounds('today', new Date(2026, 10, 1, 10, 5)).previousNow).toEqual(new Date(2026, 9, 31, 10));
	});

	it('keeps the hour in progress within the hour before now, even the repeated one at DST end', () => {
		// bun test runs in UTC, so put the house's zone on for this one
		const zone = process.env.TZ;
		process.env.TZ = 'America/Denver';
		try {
			// 1:30 AM MST on Nov 1, 2026: the second 1 AM in Denver
			const repeated = new Date(Date.UTC(2026, 10, 1, 8, 30));
			const { now } = periodBounds('today', repeated);
			expect(now.toISOString()).toBe('2026-11-01T08:00:00.000Z');
		} finally {
			// Unset, bun test runs in UTC
			process.env.TZ = zone ?? 'UTC';
		}
	});

	it('starts the week on Monday', () => {
		const b = periodBounds('week', at);
		expect(b.start).toEqual(new Date(2026, 9, 19));
		expect(b.previousStart).toEqual(new Date(2026, 9, 12));
		expect(b.previousNow).toEqual(new Date(2026, 9, 17, 15));
		expect(b.buckets).toHaveLength(7);
		expect(periodBounds('week', new Date(2026, 9, 25, 9)).start).toEqual(new Date(2026, 9, 19));
	});

	it("keeps the month's comparison inside the previous month", () => {
		const b = periodBounds('month', at);
		expect(b.buckets).toHaveLength(31);
		expect(b.previousNow).toEqual(new Date(2026, 8, 24, 15));
		const end = periodBounds('month', new Date(2026, 9, 31, 12));
		expect(end.previousNow).toEqual(new Date(2026, 9, 1));
	});
});

describe('statistics', () => {
	const model = buildEnergyModel(prefs, states);
	const bounds = periodBounds('today', new Date(2026, 9, 24, 2, 30));
	const t = (h: number) => new Date(2026, 9, 24, h).getTime();
	const rows: StatisticRows = {
		'sensor.em_site_today_energy': [
			{ start: t(-1), change: 5 },
			{ start: t(0), change: 1 },
			{ start: t(1), change: 1.5 },
		],
		'sensor.em_site_today_energy_2': [
			{ start: t(0), change: 1 },
			{ start: t(1), change: 0.5 },
		],
		'sensor.em_furnace_today_energy': [
			{ start: t(0), change: 0.5 },
			{ start: t(1), change: 0.25 },
		],
		'sensor.em_laundry_today_energy': [{ start: t(1), change: 1 }],
		'sensor.washer_energy': [{ start: t(1), change: 0.5 }],
		'sensor.em_lights_today_energy': [{ start: t(0), change: null }],
	};

	it('sums a statistic over a range', () => {
		expect(sumChange(rows, 'sensor.em_site_today_energy', new Date(t(0)), new Date(t(2)))).toBe(2.5);
		expect(sumChange(rows, 'sensor.missing', new Date(t(0)), new Date(t(2)))).toBe(0);
	});

	it('totals the period and its circuits', () => {
		const summary = periodSummary(model, rows, bounds);
		expect(summary.total).toBe(4);
		expect(summary.circuits.map((c) => c.kWh)).toEqual([0.75, 1, 0.5, 0]);
		expect(summary.untracked).toBe(2.25);
		expect(previousTotal(model, rows, bounds)).toBe(0);
	});

	it('stacks each bucket: colored circuits, Other, Untracked', () => {
		const buckets = chartBuckets(model, rows, bounds);
		expect(buckets).toHaveLength(24);
		expect(buckets[0].parts).toEqual([
			{ key: 'sensor.em_furnace_today_energy', kWh: 0.5 },
			{ key: UNTRACKED, kWh: 1.5 },
		]);
		expect(buckets[1].total).toBe(2);
		expect(buckets[1].parts.map((p) => p.key)).toEqual([
			'sensor.em_furnace_today_energy',
			'sensor.em_laundry_today_energy',
			UNTRACKED,
		]);
		// 2:00 is in progress: statistics don't cover it yet
		expect(buckets[2].future).toBe(true);
		expect(OTHER).toBe('other');
	});

	it('names chart series by color, never by entity id', () => {
		expect(chartSeries(model).map((s) => s.id)).toEqual(['c1', 'c2', 'c3', UNTRACKED]);
		expect(seriesId('sensor.em_laundry_today_energy', model)).toBe('c2');
		expect(seriesId(OTHER, model)).toBe(OTHER);
	});

	it('turns buckets into chart rows, the future left empty', () => {
		const chart = chartRows(model, chartBuckets(model, rows, bounds), 'today');
		expect(chart[1]).toEqual({ start: t(1), label: '1 AM', c1: 0.25, c2: 1, c3: 0, untracked: 0.75 });
		expect(chart[5].c1).toBeNull();
	});

	it('sums the grid by hour for the base load', () => {
		expect(hourlyTotals(model, rows)).toEqual([5, 2, 2]);
	});
});

describe('powerTimeline', () => {
	const model = buildEnergyModel(prefs, states);

	it('adds the legs at each moment both reported, then the live reading', () => {
		const rows: StatisticRows = {
			'sensor.em_site_power': [
				{ start: 0, mean: 400 },
				{ start: 300_000, mean: 500 },
				{ start: 600_000, mean: 450 },
			],
			'sensor.em_site_power_2': [
				{ start: 0, mean: 100 },
				{ start: 300_000, mean: 200 },
			],
		};
		expect(powerTimeline(model, rows, { at: 700_000, watts: 905 })).toEqual([
			{ at: 0, watts: 500 },
			{ at: 300_000, watts: 700 },
			{ at: 700_000, watts: 905 },
		]);
	});
});

describe('baseLoad', () => {
	it("takes the 10th percentile of the house's hours", () => {
		const hours = Array.from({ length: 30 }, (_, i) => 0.4 + i * 0.1);
		expect(baseLoad([0, ...hours])).toBeCloseTo(700);
		expect(baseLoad(hours.slice(0, 10))).toBeUndefined();
	});
});

describe('formatting', () => {
	it('formats watts and kilowatt-hours', () => {
		expect(formatWatts(426.03)).toBe('426 W');
		expect(formatWatts(1234)).toBe('1.2 kW');
		expect(formatWatts(12_400)).toBe('12 kW');
		expect(formatWatts(0.2)).toBe('0 W');
		expect(formatWatts(undefined)).toBe('—');
		expect(formatWatts(2000)).toBe('2.0 kW');
		expect(formatKwh(0.254)).toBe('0.25 kWh');
		expect(formatKwh(8.24)).toBe('8.2 kWh');
		expect(formatKwh(1364.4, false)).toBe('1,364');
	});

	it('compares with the previous period', () => {
		expect(compareToPrevious(11, 10, 'today')).toEqual({ text: '10% more than yesterday by now', direction: 'up' });
		expect(compareToPrevious(9, 10, 'week')).toEqual({ text: '10% less than last week by now', direction: 'down' });
		expect(compareToPrevious(10.1, 10, 'month')?.direction).toBe('same');
		expect(compareToPrevious(5, 0, 'today')).toBeUndefined();
	});

	it('labels buckets', () => {
		expect(formatBucket(new Date(2026, 9, 24, 0), 'today')).toBe('12 AM');
		expect(formatBucket(new Date(2026, 9, 24, 15), 'today')).toBe('3 PM');
		expect(formatBucket(new Date(2026, 9, 19), 'week')).toBe('Mon');
		expect(formatBucket(new Date(2026, 9, 24), 'month')).toBe('24');
		expect(describeBucket(new Date(2026, 9, 24, 15), 'today')).toBe('3 PM – 4 PM');
		expect(describeBucket(new Date(2026, 9, 20), 'week')).toBe('Tuesday, Oct 20');
	});
});

describe('wattsParts', () => {
	it('splits a power as formatWatts writes it, for a number that rolls on its own', () => {
		expect(wattsParts(426.03)).toEqual({ value: 426, decimals: 0, unit: 'W' });
		expect(wattsParts(1234)).toEqual({ value: 1.2, decimals: 1, unit: 'kW' });
		expect(wattsParts(9960)).toEqual({ value: 10, decimals: 1, unit: 'kW' });
		expect(wattsParts(12_400)).toEqual({ value: 12, decimals: 0, unit: 'kW' });
		expect(wattsParts(0.2)).toEqual({ value: 0, decimals: 0, unit: 'W' });
		// Exporting (solar) is negative
		expect(wattsParts(-1500)).toEqual({ value: -1.5, decimals: 1, unit: 'kW' });
	});
});
