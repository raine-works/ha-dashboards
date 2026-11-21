import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	dailyRows,
	discoverFeeders,
	discoverLitterBoxes,
	discoverPets,
	formatClockTime,
	formatMeasurement,
	formatUntil,
	lastDays,
	litterStatus,
	petCareNeedsAttention,
	petStatIds,
	supplyTone,
	wasteTone,
} from '../pets';

const entity = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
	entity_id,
	state,
	attributes,
	last_changed: '2026-10-18T12:00:00Z',
	last_updated: '2026-10-18T12:00:00Z',
});

const states = (...entities: HassEntity[]) => Object.fromEntries(entities.map((e) => [e.entity_id, e]));

const home = states(
	entity('person.chai', 'unknown', { friendly_name: 'Chai', device_trackers: [], entity_picture: '/chai.jpg' }),
	entity('person.rue', 'unknown', { friendly_name: 'Rue', device_trackers: [] }),
	entity('person.admin', 'unknown', { friendly_name: 'Admin', device_trackers: [] }),
	entity('person.robin', 'home', { friendly_name: 'Robin', device_trackers: ['device_tracker.phone'] }),
	entity('sensor.robin_weight', '150', { unit_of_measurement: 'lb' }),
	entity('sensor.chai_visits_today', '3', { unit_of_measurement: 'visits' }),
	entity('sensor.chai_weight', '10.89', { unit_of_measurement: 'lb' }),
	entity('sensor.rue_visits_today', 'unavailable'),
	entity('sensor.rue_weight', '11.63', { unit_of_measurement: 'lb' }),
	entity('vacuum.litter_robot_litter_box', 'docked', { friendly_name: 'Litter Robot Litter box' }),
	entity('sensor.litter_robot_status_code', 'df2'),
	entity('sensor.litter_robot_waste_drawer', '76', { unit_of_measurement: '%' }),
	entity('sensor.litter_robot_litter_level', '76.0', { unit_of_measurement: '%' }),
	entity('sensor.feeder_robot_food_level', '20', {
		friendly_name: 'Feeder Robot  Food level',
		unit_of_measurement: '%',
	}),
	entity('sensor.feeder_robot_last_feeding', '2026-10-18T02:00:58+00:00'),
	entity('sensor.feeder_robot_next_feeding', '2026-10-18T14:00:00+00:00'),
	entity('sensor.feeder_robot_food_dispensed_today', '0.25', { unit_of_measurement: 'cups' }),
	entity('button.feeder_robot_give_snack', '2026-10-16T16:57:54.343971+00:00'),
);

describe('pets', () => {
	it('discovers pets: tracker-less people with per-pet sensors', () => {
		expect(discoverPets(home)).toEqual([
			{
				entityId: 'person.chai',
				id: 'chai',
				name: 'Chai',
				initials: 'CH',
				picture: '/chai.jpg',
				visitsToday: 3,
				weight: { value: 10.89, unit: 'lb' },
			},
			{
				entityId: 'person.rue',
				id: 'rue',
				name: 'Rue',
				initials: 'RU',
				picture: undefined,
				visitsToday: null,
				weight: { value: 11.63, unit: 'lb' },
			},
		]);
	});

	it('labels Litter-Robot status codes', () => {
		expect(litterStatus('rdy')).toEqual({ label: 'Ready', tone: 'success' });
		expect(litterStatus('ccp')).toEqual({ label: 'Cleaning', tone: 'info' });
		expect(litterStatus('dfs')).toEqual({ label: 'Drawer full', tone: 'destructive' });
		expect(litterStatus('xyz')).toEqual({ label: 'XYZ', tone: 'muted' });
		expect(litterStatus('unavailable')).toEqual({ label: 'Unknown', tone: 'muted' });
		expect(litterStatus(undefined).label).toBe('Unknown');
	});

	it('grades the waste drawer and supplies', () => {
		expect(wasteTone(50)).toBe('success');
		expect(wasteTone(80)).toBe('warning');
		expect(wasteTone(95)).toBe('destructive');
		expect(wasteTone(null)).toBe('muted');
		expect(supplyTone(50)).toBe('success');
		expect(supplyTone(20)).toBe('warning');
		expect(supplyTone(10)).toBe('destructive');
		expect(supplyTone(null)).toBe('muted');
	});

	it('discovers litter boxes by entity suffix', () => {
		expect(discoverLitterBoxes(home)).toEqual([
			{
				entityId: 'vacuum.litter_robot_litter_box',
				name: 'Litter Robot',
				status: 'df2',
				statusLabel: 'Drawer almost full (1 cycle left)',
				tone: 'warning',
				wasteDrawer: 76,
				wasteTone: 'success',
				litterLevel: 76,
				litterTone: 'success',
				cycling: false,
				available: true,
				resetButton: null,
				lastReset: null,
			},
		]);
	});

	it('finds the reset button and a running clean cycle', () => {
		const [litter] = discoverLitterBoxes({
			...home,
			'sensor.litter_robot_status_code': entity('sensor.litter_robot_status_code', 'ccp'),
			'button.litter_robot_reset': entity('button.litter_robot_reset', '2026-10-18T11:00:00+00:00'),
		});
		expect(litter).toMatchObject({
			cycling: true,
			resetButton: 'button.litter_robot_reset',
			lastReset: '2026-10-18T11:00:00+00:00',
		});
		const [offline] = discoverLitterBoxes({
			...home,
			'vacuum.litter_robot_litter_box': entity('vacuum.litter_robot_litter_box', 'unavailable'),
		});
		expect(offline?.available).toBe(false);
	});

	it('discovers feeders by entity suffix', () => {
		expect(discoverFeeders(home)).toEqual([
			{
				entityId: 'sensor.feeder_robot_food_level',
				name: 'Feeder Robot',
				foodLevel: 20,
				foodTone: 'warning',
				lastFeeding: '2026-10-18T02:00:58+00:00',
				nextFeeding: '2026-10-18T14:00:00+00:00',
				dispensedToday: { value: 0.25, unit: 'cups' },
				dispensedId: 'sensor.feeder_robot_food_dispensed_today',
				snackButton: 'button.feeder_robot_give_snack',
				lastSnack: '2026-10-16T16:57:54.343971+00:00',
			},
		]);
	});

	it('handles a feeder without a snack button or readings', () => {
		const [feeder] = discoverFeeders(states(entity('sensor.bowl_food_level', 'unavailable')));
		expect(feeder).toMatchObject({
			name: 'Feeder',
			foodLevel: null,
			foodTone: 'muted',
			snackButton: null,
			lastSnack: null,
		});
	});

	it('flags pet care that needs attention', () => {
		const litter = discoverLitterBoxes(home);
		const feeders = discoverFeeders(home);
		expect(petCareNeedsAttention(litter, feeders)).toBe(true);
		const fine = litter.map((l) => ({ ...l, tone: 'success' as const }));
		expect(petCareNeedsAttention(fine, [])).toBe(false);
		expect(petCareNeedsAttention(fine, feeders)).toBe(true); // food at 20%
	});

	it('formats times until an event', () => {
		const now = Date.parse('2026-10-18T12:00:00Z');
		expect(formatUntil('2026-10-18T12:10:00Z', now)).toBe('in 10 min');
		expect(formatUntil('2026-10-18T14:00:00Z', now)).toBe('in 2 hr');
		expect(formatUntil('2026-10-20T12:00:00Z', now)).toBe('in 2 days');
		expect(formatUntil('2026-10-18T11:00:00Z', now)).toBe('now');
	});

	it('formats clock times, naming the day when it is not today', () => {
		const now = new Date(2026, 9, 18, 12, 0).getTime();
		expect(formatClockTime(new Date(2026, 9, 18, 8, 0).toISOString(), now)).toBe('8:00 AM');
		expect(formatClockTime(new Date(2026, 9, 19, 20, 30).toISOString(), now)).toBe('Mon 8:30 PM');
	});

	it('formats measurements', () => {
		expect(formatMeasurement({ value: 10.89, unit: 'lb' })).toBe('10.9 lb');
		expect(formatMeasurement({ value: 0, unit: 'cups' })).toBe('0 cups');
		expect(formatMeasurement({ value: 0.25, unit: 'cups' }, 2)).toBe('0.25 cups');
		expect(formatMeasurement({ value: 3, unit: '' })).toBe('3');
	});
});

describe('daily statistics', () => {
	const now = new Date(2026, 10, 1, 19, 30);
	const midnight = (d: number) => new Date(2026, 9, d).getTime();

	it('lists the last days, oldest first, today last', () => {
		const days = lastDays(3, now);
		expect(days.map((d) => new Date(d).getDate())).toEqual([30, 31, 1]);
		expect(new Date(days[2]).getHours()).toBe(0);
	});

	it('puts each series on its day, null where a day has none', () => {
		const rows = dailyRows(
			{
				'sensor.chai_visits_today': [
					{ start: midnight(30), change: 6 },
					{ start: new Date(2026, 10, 1).getTime(), change: 4 },
				],
				'sensor.chai_weight': [{ start: midnight(31), mean: 11.5 }],
			},
			[
				{ key: 'visits', statId: 'sensor.chai_visits_today', type: 'change' },
				{ key: 'weight', statId: 'sensor.chai_weight', type: 'mean' },
			],
			3,
			now,
		);
		expect(rows.map((r) => r.visits)).toEqual([6, null, 4]);
		expect(rows.map((r) => r.weight)).toEqual([null, 11.5, null]);
	});

	it("names a pet's statistics", () => {
		expect(petStatIds({ id: 'chai' })).toEqual({ visits: 'sensor.chai_visits_today', weight: 'sensor.chai_weight' });
	});
});
