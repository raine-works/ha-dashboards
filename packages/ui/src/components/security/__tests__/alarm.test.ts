import { describe, expect, it } from 'bun:test';
import { nameList } from '../../../lib/text';
import type { HassEntity } from '../../../types/homeassistant';
import { armBlockers, getAlarmView } from '../AlarmCard';

const alarm = (state: string, attributes: HassEntity['attributes'] = {}, last_changed = ''): HassEntity => ({
	entity_id: 'alarm_control_panel.alarmo',
	state,
	attributes,
	last_changed,
	last_updated: last_changed,
});

describe('getAlarmView', () => {
	it('shows an exit-delay countdown while arming away', () => {
		const changed = '2026-10-17T18:00:00.000Z';
		const view = getAlarmView(
			alarm('arming', { arm_mode: 'armed_away', next_state: 'armed_away', delay: 60 }, changed),
		);
		expect(view.status).toBe('arming');
		expect(view.title).toBe('Arming Away');
		expect(view.countdownTotalSec).toBe(60);
		expect(view.countdownEndsAt).toBe(Date.parse(changed) + 60_000);
	});

	it('falls back to next_state for the target mode and omits the countdown without a delay', () => {
		const view = getAlarmView(alarm('arming', { arm_mode: null, next_state: 'armed_home', delay: null }));
		expect(view.title).toBe('Arming Home');
		expect(view.countdownEndsAt).toBeUndefined();
	});

	it('shows an entry-delay countdown while pending', () => {
		const view = getAlarmView(alarm('pending', { delay: 30 }, '2026-10-17T18:00:00.000Z'));
		expect(view.status).toBe('pending');
		expect(view.countdownTotalSec).toBe(30);
	});

	it('maps armed, triggered and disarmed states', () => {
		expect(getAlarmView(alarm('armed_away')).title).toBe('Armed Away');
		expect(getAlarmView(alarm('armed_home')).description).toBe('Perimeter armed');
		expect(getAlarmView(alarm('triggered')).status).toBe('triggered');
		expect(getAlarmView(alarm('disarmed')).status).toBe('disarmed');
		expect(getAlarmView(undefined).status).toBe('disarmed');
	});
});

describe('arm refusals', () => {
	const states = {
		'binary_sensor.kitchen_window_1_contact': {
			entity_id: 'binary_sensor.kitchen_window_1_contact',
			state: 'on',
			attributes: { friendly_name: 'Kitchen Window 1 Contact', device_class: 'window' },
			last_changed: '',
			last_updated: '',
		},
	};

	it('names the sensors Alarmo reported open, falling back to the entity id', () => {
		const entity = alarm('disarmed', {
			open_sensors: { 'binary_sensor.kitchen_window_1_contact': 'open', 'binary_sensor.gone': 'open' },
		});
		expect(armBlockers(entity, states)).toEqual(['Kitchen Window 1', 'binary_sensor.gone']);
	});

	it('has no blockers without open_sensors', () => {
		expect(armBlockers(alarm('disarmed', { open_sensors: null }), states)).toEqual([]);
		expect(armBlockers(undefined, states)).toEqual([]);
	});

	it('joins names for a sentence', () => {
		expect(nameList([])).toBe('');
		expect(nameList(['Front Door'])).toBe('Front Door');
		expect(nameList(['Front Door', 'Back Door'])).toBe('Front Door and Back Door');
		expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
	});
});
