/**
 * The receipt printer and what's wrong with it, live.
 *
 * @module
 */

import { useHassSelector } from '../../context/HassContext';
import { discoverPrinters, type Printer, type PrinterStatus, printerStatus, printerWatch } from '../../lib/printer';

// The printer's trouble, after its name
const PROBLEMS: Record<string, string> = {
	Offline: 'is offline',
	'Out of paper': 'is out of paper',
	'Cover open': 'has its cover open',
	'Paper low': 'is low on paper: replace the roll soon',
};

/** The receipt printer, its status, and its trouble in words. */
export interface PrinterView {
	printer: Printer;
	status: PrinterStatus;
	/** "Kitchen printer is out of paper", while it can't print; else undefined. */
	blockedReason?: string;
	/** "Kitchen printer is low on paper: …", while it has any trouble (for an alert). */
	problem?: string;
}

/** The receipt printer (the first, if there are several) and its status, or null without one. */
export function usePrinter(): PrinterView | null {
	// Found in the registries, which a state change never touches
	const printer = useHassSelector((hass) => (hass ? (discoverPrinters(hass)[0] ?? null) : null), { watch: [] });
	const status = useHassSelector((hass) => (hass && printer ? printerStatus(printer, hass.states) : null), {
		watch: printer ? printerWatch([printer]) : [],
	});
	if (!printer || !status) return null;
	const problem = status.tone === 'ok' ? undefined : `${printer.name} ${PROBLEMS[status.label] ?? status.label}`;
	return { printer, status, problem, blockedReason: status.ready ? undefined : problem };
}
