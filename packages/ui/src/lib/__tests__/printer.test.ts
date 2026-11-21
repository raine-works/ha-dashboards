import { describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import { discoverPrinters, NOTE_MAX, NOTE_PRESETS, printerStatus, printerWatch } from '../printer';

const entity = (entity_id: string, state: string): HassEntity => ({
	entity_id,
	state,
	attributes: {},
	last_changed: '',
	last_updated: '',
});

const reg = (entity_id: string, platform = 'escpos_printer', device_id = 'dev1') => ({
	entity_id,
	platform,
	device_id,
});

const hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'> = {
	entities: Object.fromEntries(
		[
			reg('notify.kitchen_printer'),
			reg('binary_sensor.kitchen_printer_online'),
			reg('sensor.kitchen_printer_paper_status'),
			reg('binary_sensor.kitchen_printer_cover_open'),
			reg('sensor.kitchen_printer_last_print'),
			reg('notify.mobile_app_pixel', 'mobile_app', 'dev2'),
		].map((e) => [e.entity_id, e]),
	),
	devices: { dev1: { id: 'dev1', area_id: 'kitchen', name: 'ESC/POS Printer', name_by_user: 'Printer' } },
	areas: { kitchen: { area_id: 'kitchen', name: 'Kitchen' } },
};

const printer = discoverPrinters(hass)[0];
const states = (overrides: Record<string, string> = {}) =>
	Object.fromEntries(
		Object.entries({
			'notify.kitchen_printer': 'unknown',
			'binary_sensor.kitchen_printer_online': 'on',
			'sensor.kitchen_printer_paper_status': 'ok',
			'binary_sensor.kitchen_printer_cover_open': 'off',
			...overrides,
		}).map(([id, s]) => [id, entity(id, s)]),
	);

describe('discoverPrinters', () => {
	it('finds the ESC/POS notify entity, named by its area, with its status sensors', () => {
		expect(discoverPrinters(hass)).toEqual([
			{
				entityId: 'notify.kitchen_printer',
				name: 'Kitchen printer',
				online: 'binary_sensor.kitchen_printer_online',
				paper: 'sensor.kitchen_printer_paper_status',
				cover: 'binary_sensor.kitchen_printer_cover_open',
			},
		]);
	});

	it('falls back to the device name without an area', () => {
		const noArea = { ...hass, devices: { dev1: { id: 'dev1', name: 'ESC/POS Printer', name_by_user: 'Printer' } } };
		expect(discoverPrinters(noArea)[0].name).toBe('Printer');
	});

	it('finds nothing without the integration', () => {
		expect(discoverPrinters({ entities: { a: reg('notify.mobile_app_pixel', 'mobile_app') } })).toEqual([]);
	});

	it('watches the printer and its sensors', () => {
		expect(printerWatch([printer])).toEqual([
			'notify.kitchen_printer',
			'binary_sensor.kitchen_printer_online',
			'sensor.kitchen_printer_paper_status',
			'binary_sensor.kitchen_printer_cover_open',
		]);
	});
});

describe('printerStatus', () => {
	it('is ready when online with paper', () => {
		expect(printerStatus(printer, states())).toEqual({ ready: true, label: 'Ready', tone: 'ok' });
	});

	it('still prints on low paper', () => {
		expect(printerStatus(printer, states({ 'sensor.kitchen_printer_paper_status': 'low' }))).toMatchObject({
			ready: true,
			label: 'Paper low',
		});
	});

	it("can't print offline, out of paper or with the cover open", () => {
		expect(printerStatus(printer, states({ 'binary_sensor.kitchen_printer_online': 'off' })).label).toBe('Offline');
		expect(printerStatus(printer, states({ 'notify.kitchen_printer': 'unavailable' })).label).toBe('Offline');
		expect(printerStatus(printer, states({ 'sensor.kitchen_printer_paper_status': 'out' })).label).toBe('Out of paper');
		expect(printerStatus(printer, states({ 'binary_sensor.kitchen_printer_cover_open': 'on' })).label).toBe(
			'Cover open',
		);
		expect(printerStatus(printer, states({ 'sensor.kitchen_printer_paper_status': 'out' })).ready).toBe(false);
	});

	it('assumes ready when its sensors are missing', () => {
		expect(printerStatus({ entityId: 'notify.p', name: 'P' }, {}).ready).toBe(true);
	});
});

describe('NOTE_PRESETS', () => {
	it('prints in the code page: plain characters only, within the note limit', () => {
		for (const note of NOTE_PRESETS.flatMap((c) => c.presets)) {
			expect(note).toMatch(/^[\x20-\x7e]+$/);
			expect(note.length).toBeLessThanOrEqual(NOTE_MAX);
		}
	});
});
