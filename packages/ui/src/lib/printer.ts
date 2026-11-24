/**
 * Receipt printers (the ESC/POS integration): discovery, their status from their sensors, and the
 * quick notes the intercom prints.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import type { PresetCategory } from './intercom';

/** The ESC/POS receipt printer integration's platform. */
export const PRINTER_PLATFORM = 'escpos_printer';

/** The longest note the intercom prints: a slip, not a letter. */
export const NOTE_MAX = 280;

/** A receipt printer with its status sensors. */
export interface Printer {
	/** `notify.kitchen_printer`: the entity the print services target. */
	entityId: string;
	/** "Kitchen printer" (its area), else the device's name. */
	name: string;
	/** Its `binary_sensor.*_online`, if it has one. */
	online?: string;
	/** Its `sensor.*_paper_status` (`ok`, `low`, `out`), if it has one. */
	paper?: string;
	/** Its `binary_sensor.*_cover_open`, if it has one. */
	cover?: string;
}

const entityName = (id: string) => id.split('.')[1] ?? id;

/** Every receipt printer (its `notify` entity from the ESC/POS platform), by name, with its status sensors. */
export function discoverPrinters(hass: Pick<HomeAssistant, 'entities' | 'devices' | 'areas'>): Printer[] {
	const entities = Object.values(hass.entities ?? {});
	return entities
		.filter((e) => e.entity_id.startsWith('notify.') && e.platform === PRINTER_PLATFORM && !e.hidden)
		.map((e) => {
			const device = e.device_id ? hass.devices?.[e.device_id] : undefined;
			const area = hass.areas?.[e.area_id ?? device?.area_id ?? '']?.name;
			const sibling = (domain: string, suffix: string) =>
				entities.find(
					(s) =>
						s.device_id === e.device_id &&
						s.platform === PRINTER_PLATFORM &&
						s.entity_id.startsWith(`${domain}.`) &&
						s.entity_id.endsWith(suffix),
				)?.entity_id;
			return {
				entityId: e.entity_id,
				name: area
					? `${area} printer`
					: device?.name_by_user || device?.name || entityName(e.entity_id).replaceAll('_', ' '),
				...(e.device_id && {
					online: sibling('binary_sensor', '_online'),
					paper: sibling('sensor', '_paper_status'),
					cover: sibling('binary_sensor', '_cover_open'),
				}),
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** What the printer can do now: `ready` is false while it can't print at all. */
export interface PrinterStatus {
	/** It can print. */
	ready: boolean;
	/** "Ready", "Paper low", "Out of paper", "Cover open", "Offline". */
	label: string;
	/** How the status shows: fine, a warning (it still prints), or an error (it can't). */
	tone: 'ok' | 'warning' | 'error';
}

/** The printer's state from its sensors; a sensor that's missing or unknown says nothing. */
export function printerStatus(printer: Printer, states: Record<string, HassEntity | undefined>): PrinterStatus {
	const state = (id?: string) => (id ? states[id]?.state : undefined);
	if (state(printer.entityId) === 'unavailable' || state(printer.online) === 'off')
		return { ready: false, label: 'Offline', tone: 'error' };
	if (state(printer.paper) === 'out') return { ready: false, label: 'Out of paper', tone: 'error' };
	if (state(printer.cover) === 'on') return { ready: false, label: 'Cover open', tone: 'error' };
	if (state(printer.paper) === 'low') return { ready: true, label: 'Paper low', tone: 'warning' };
	return { ready: true, label: 'Ready', tone: 'ok' };
}

/** The entity ids `printerStatus()` reads, for a selector's `watch`. */
export const printerWatch = (printers: Printer[]) =>
	printers.flatMap((p) => [p.entityId, p.online, p.paper, p.cover].filter((id): id is string => !!id));

/**
 * Quick notes for the printer, by category: little messages left on the counter. Printed in the
 * printer's code page, so plain text only (no emoji; tested).
 */
export const NOTE_PRESETS: PresetCategory<string>[] = [
	{
		id: 'love',
		label: 'Love',
		presets: [
			'I love you!',
			'Have a great day!',
			'So proud of you.',
			'You are amazing.',
			'Thinking of you today.',
			'You make our home happy.',
			'Good luck today! You got this.',
		],
	},
	{
		id: 'away',
		label: 'Away',
		presets: [
			'Gone to the store, back soon.',
			'Out running errands.',
			'At practice, home by dinner.',
			'Went for a walk.',
			'Call me when you get home.',
			'Text me when you see this.',
		],
	},
	{
		id: 'reminders',
		label: 'Reminders',
		presets: [
			'Dinner is in the fridge.',
			'Please unload the dishwasher.',
			'Feed the cats.',
			'Take out the garbage.',
			'Practice your piano.',
			'Homework before screens.',
			'Clean your room, please.',
		],
	},
	{
		id: 'fun',
		label: 'Fun',
		presets: [
			'You have been chosen for a hug.',
			'Official notice: you are awesome.',
			'This coupon is good for one high five.',
			'Dance break! Right now!',
			'The floor is lava.',
			'Snack time is approved.',
		],
	},
];
