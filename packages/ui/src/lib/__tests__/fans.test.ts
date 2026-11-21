import { describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import { discoverFans, getFanView } from '../fans';

const fan = (state: string, attributes: HassEntity['attributes'] = {}, entity_id = 'fan.tower_fan'): HassEntity => ({
	entity_id,
	state,
	attributes: {
		friendly_name: 'Tower Fan',
		supported_features: 59,
		percentage_step: 1,
		preset_modes: ['Sleep', 'Auto', 'Natural', 'Normal'],
		...attributes,
	},
	last_changed: '',
	last_updated: '',
});

describe('getFanView', () => {
	it('describes a running fan: speed, preset and oscillation', () => {
		expect(getFanView(fan('on', { percentage: 45.4, preset_mode: 'Natural', oscillating: true }))).toMatchObject({
			status: 'on',
			percentage: 45,
			oscillating: true,
			preset: 'Natural',
			label: '45% · Natural · Oscillating',
		});
	});

	it('offers the controls the fan supports', () => {
		expect(getFanView(fan('off'))).toMatchObject({
			status: 'off',
			label: 'Off',
			canSetSpeed: true,
			canOscillate: true,
			presets: ['Sleep', 'Auto', 'Natural', 'Normal'],
		});
		// On/off only (TURN_ON | TURN_OFF): no speed, no oscillation, no presets even if listed
		expect(getFanView(fan('on', { supported_features: 48 }))).toMatchObject({
			canSetSpeed: false,
			canOscillate: false,
			presets: [],
			label: 'On',
		});
	});

	it('is unavailable without a state', () => {
		expect(getFanView(undefined).status).toBe('unavailable');
		expect(getFanView(fan('unavailable')).label).toBe('Unavailable');
	});

	it("keeps a three-speed fan's step", () => {
		expect(getFanView(fan('on', { percentage_step: 33.33, percentage: 67 })).step).toBe(33.33);
	});
});

describe('discoverFans', () => {
	const hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'> = {
		entities: {
			'fan.tower_fan': { entity_id: 'fan.tower_fan', area_id: 'master_suite' },
			'fan.hidden': { entity_id: 'fan.hidden', hidden: true },
		},
		devices: {},
		areas: { master_suite: { area_id: 'master_suite', name: 'Master Suite' } },
	} as unknown as Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>;

	it('finds visible fans with their area, leaving out other domains', () => {
		expect(
			discoverFans(hass, {
				'fan.tower_fan': fan('off'),
				'fan.hidden': fan('off', {}, 'fan.hidden'),
				'switch.tower_fan_panel_sound': fan('off', {}, 'switch.tower_fan_panel_sound'),
			}),
		).toEqual([{ entityId: 'fan.tower_fan', name: 'Tower Fan', area: 'Master Suite' }]);
	});
});
