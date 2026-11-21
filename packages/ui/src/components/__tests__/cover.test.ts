import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import { getCoverView } from '../covers/CoverCard';

const cover = (state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
	entity_id: 'cover.master_suite_curtains',
	state,
	attributes,
	last_changed: '',
	last_updated: '',
});

describe('getCoverView', () => {
	it('reads state, position and supported controls', () => {
		expect(getCoverView(cover('closed', { current_position: 0, supported_features: 15 }))).toEqual({
			status: 'closed',
			label: 'Closed',
			position: 0,
			canSetPosition: true,
			canStop: true,
		});
		expect(getCoverView(cover('open', { current_position: 40, supported_features: 3 }))).toMatchObject({
			status: 'open',
			label: 'Open 40%',
			canSetPosition: false,
			canStop: false,
		});
		expect(getCoverView(cover('open', { current_position: 100 })).label).toBe('Open');
	});

	it('shows movement from Home Assistant or an optimistic request', () => {
		expect(getCoverView(cover('opening')).label).toBe('Opening…');
		expect(getCoverView(cover('open'), 'closing')).toMatchObject({ status: 'closing', label: 'Closing…' });
	});

	it('counts a cover at 0–1% as closed, whatever its state says', () => {
		// The right curtain robot creeps to 1% after closing, and the group reports "open" at 0%
		expect(getCoverView(cover('open', { current_position: 0 }))).toMatchObject({ status: 'closed', label: 'Closed' });
		expect(getCoverView(cover('open', { current_position: 1 })).status).toBe('closed');
		expect(getCoverView(cover('open', { current_position: 2 })).label).toBe('Open 2%');
	});

	it('shows a stalled move at rest, but never a tap on its way', () => {
		expect(getCoverView(cover('opening', { current_position: 90 }), undefined, true)).toMatchObject({
			status: 'open',
			label: 'Open 90%',
		});
		expect(getCoverView(cover('closing'), undefined, true).status).toBe('closed');
		expect(getCoverView(cover('opening', { current_position: 90 }), 'closing', true).status).toBe('closing');
	});

	it('is unavailable without a usable entity', () => {
		expect(getCoverView(undefined).status).toBe('unavailable');
		expect(getCoverView(cover('unavailable'), 'opening').label).toBe('Unavailable');
	});
});
