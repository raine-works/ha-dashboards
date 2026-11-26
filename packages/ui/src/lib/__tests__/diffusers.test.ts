import { describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import {
	type Diffuser,
	discoverDiffusers,
	formatScentLeft,
	getDiffuserView,
	PRESS_SEEN_WITHIN_MS,
	QUICK_SCENT_DEFAULT_S,
	quickScentUntil,
} from '../diffusers';

const entity = (entity_id: string, state: string): HassEntity => ({
	entity_id,
	state,
	attributes: {},
	last_changed: '',
	last_updated: '',
});

const P = 'basement_utility_room';
const states = (overrides: Record<string, string> = {}): Record<string, HassEntity> => {
	const base: Record<string, string> = {
		[`switch.${P}_power`]: 'on',
		[`sensor.${P}_fragrance_level`]: '1',
		[`sensor.${P}_fragrance`]: 'Citrus Grove',
		[`sensor.${P}_fragrance_category`]: 'Fruity',
		[`sensor.${P}_concentration`]: 'Strong',
		[`binary_sensor.${P}_fragrance_low`]: 'off',
		[`binary_sensor.${P}_online`]: 'on',
		[`binary_sensor.${P}_fan`]: 'off',
		[`button.${P}_quick_scent`]: 'unknown',
		'number.mechanical_main_floor_quick_scent_duration': '20',
		...overrides,
	};
	return Object.fromEntries(Object.entries(base).map(([id, s]) => [id, entity(id, s)]));
};

const hass: Pick<HomeAssistant, 'entities' | 'devices'> = {
	entities: {
		[`switch.${P}_power`]: { entity_id: `switch.${P}_power`, device_id: 'dev1', platform: 'everscent' },
		// Added later, under the device's newer name
		'number.mechanical_main_floor_quick_scent_duration': {
			entity_id: 'number.mechanical_main_floor_quick_scent_duration',
			device_id: 'dev1',
			platform: 'everscent',
		},
		// Another integration's power switch is not a diffuser
		'switch.tv_power': { entity_id: 'switch.tv_power', platform: 'sonos' },
	},
	devices: { dev1: { id: 'dev1', name: 'Basement Utility Room' } },
};

describe('discoverDiffusers', () => {
	it("finds EverScent diffusers by their power switch, with the device's name and entities", () => {
		const found = discoverDiffusers(hass, { ...states(), 'switch.tv_power': entity('switch.tv_power', 'on') });
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			name: 'Basement Utility Room',
			power: `switch.${P}_power`,
			quickScent: `button.${P}_quick_scent`,
			quickScentDuration: 'number.mechanical_main_floor_quick_scent_duration',
		});
	});

	it("takes the name given in Home Assistant over the integration's", () => {
		const renamed = {
			...hass,
			devices: { dev1: { id: 'dev1', name: 'Basement Utility Room', name_by_user: 'Main Floor' } },
		};
		expect(discoverDiffusers(renamed, states())[0]?.name).toBe('Main Floor');
	});

	it('skips a hidden one', () => {
		const hidden = {
			...hass,
			entities: { [`switch.${P}_power`]: { ...hass.entities?.[`switch.${P}_power`], hidden: true } },
		};
		expect(discoverDiffusers(hidden as typeof hass, states())).toEqual([]);
	});
});

describe('quickScentUntil', () => {
	const [diffuser] = discoverDiffusers(hass, states()) as [Diffuser];
	const pressed = '2026-11-01T20:00:00.000Z';

	it("ends the duration entity's seconds after the button was pressed", () => {
		const until = quickScentUntil(diffuser, states({ [`button.${P}_quick_scent`]: pressed }));
		expect(until).toBe(Date.parse(pressed) + 20_000);
	});

	it("falls back to the integration's default, and is null when never pressed", () => {
		const noDuration = states({
			[`button.${P}_quick_scent`]: pressed,
			'number.mechanical_main_floor_quick_scent_duration': 'unavailable',
		});
		expect(quickScentUntil(diffuser, noDuration)).toBe(Date.parse(pressed) + QUICK_SCENT_DEFAULT_S * 1000);
		expect(quickScentUntil(diffuser, states())).toBeNull();
	});

	it("times a press seen arriving from its arrival, on this device's clock", () => {
		const running = states({ [`button.${P}_quick_scent`]: pressed });
		// This device's clock is 2s behind Home Assistant's: the press arrives at what it calls 19:59:58
		const at = Date.parse(pressed) - 2_000;
		expect(quickScentUntil(diffuser, running, { pressed, at })).toBe(at + 20_000);
		// …and 3s ahead
		expect(quickScentUntil(diffuser, running, { pressed, at: at + 5_000 })).toBe(at + 25_000);
	});

	it("times from Home Assistant's clock a press it saw an earlier one of, or one too far apart to be the same", () => {
		const running = states({ [`button.${P}_quick_scent`]: pressed });
		const earlier = { pressed: '2026-11-01T19:00:00.000Z', at: Date.parse(pressed) };
		expect(quickScentUntil(diffuser, running, earlier)).toBe(Date.parse(pressed) + 20_000);
		const farApart = { pressed, at: Date.parse(pressed) + PRESS_SEEN_WITHIN_MS + 1 };
		expect(quickScentUntil(diffuser, running, farApart)).toBe(Date.parse(pressed) + 20_000);
		expect(quickScentUntil(diffuser, running, null)).toBe(Date.parse(pressed) + 20_000);
	});
});

describe('formatScentLeft', () => {
	it('counts down in whole seconds, minutes past a minute', () => {
		expect(formatScentLeft(23_400)).toBe('24s left');
		expect(formatScentLeft(90_000)).toBe('1:30 left');
		expect(formatScentLeft(-500)).toBe('0s left');
	});
});

describe('getDiffuserView', () => {
	const [diffuser] = discoverDiffusers(hass, states()) as [Diffuser];

	it('shows the fragrance, the oil left and what it is doing', () => {
		expect(getDiffuserView(diffuser, states(), 0)).toMatchObject({
			status: 'on',
			scenting: false,
			quickScenting: false,
			low: false,
			fragrance: 'Citrus Grove',
			category: 'Fruity',
			label: 'On · Strong · Between bursts',
			canQuickScent: true,
		});
		expect(getDiffuserView(diffuser, states({ [`binary_sensor.${P}_fan`]: 'on' }), 0).label).toBe(
			'On · Strong · Diffusing',
		);
	});

	it('says when the oil is low', () => {
		expect(getDiffuserView(diffuser, states({ [`binary_sensor.${P}_fragrance_low`]: 'on' }), 0).low).toBe(true);
	});

	it('is quick scenting until the quick scent ends', () => {
		const pressed = Date.parse('2026-11-01T20:00:00.000Z');
		const running = states({ [`button.${P}_quick_scent`]: '2026-11-01T20:00:00.000Z' });
		expect(getDiffuserView(diffuser, running, pressed + 5_000)).toMatchObject({
			quickScenting: true,
			label: 'On · Quick scent',
		});
		expect(getDiffuserView(diffuser, running, pressed + 20_000).quickScenting).toBe(false);
	});

	it("ends a quick scent seen arriving by this device's clock", () => {
		const iso = '2026-11-01T20:00:00.000Z';
		const running = states({ [`button.${P}_quick_scent`]: iso });
		// Seen 2s "before" it was pressed: this device's clock is behind; it still runs its full 20s
		const seen = { pressed: iso, at: Date.parse(iso) - 2_000 };
		expect(getDiffuserView(diffuser, running, seen.at + 19_000, seen).quickScenting).toBe(true);
		expect(getDiffuserView(diffuser, running, seen.at + 20_000, seen).quickScenting).toBe(false);
	});

	it('is off, or offline when the cloud loses it', () => {
		expect(getDiffuserView(diffuser, states({ [`switch.${P}_power`]: 'off' }), 0).label).toBe('Off');
		const offline = getDiffuserView(diffuser, states({ [`binary_sensor.${P}_online`]: 'off' }), 0);
		expect(offline).toMatchObject({ status: 'offline', label: 'Offline', canQuickScent: false });
		expect(getDiffuserView(diffuser, states({ [`switch.${P}_power`]: 'unavailable' }), 0).status).toBe('offline');
	});
});
