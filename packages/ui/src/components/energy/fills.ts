/**
 * The energy series' fills: a circuit's `--chart-<n>`, Other a neutral gray, Untracked a hatch of it
 * (what no circuit measures, so it reads as unknown rather than as one more circuit). CSS values, for
 * HTML swatches and bars; the charts draw Untracked's hatch as an SVG pattern of the same gray.
 *
 * @module
 */

import type { EnergyCircuit } from '../../lib/energy';
import { OTHER, UNTRACKED } from '../../lib/energy';

/** Other's fill: the circuits too small to show on their own. */
export const OTHER_FILL = 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)';
/** The gray Untracked's hatch is drawn in (the charts' SVG pattern uses it too). */
export const UNTRACKED_GRAY = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)';
/** Untracked's fill: a hatch of {@link UNTRACKED_GRAY}, as a CSS background. */
export const UNTRACKED_FILL = `repeating-linear-gradient(135deg, ${UNTRACKED_GRAY} 0 2px, transparent 2px 5px)`;

/** A circuit's fill: its chart color, else (no circuit, or one without a color) Other's. */
export const fillFor = (circuit?: EnergyCircuit): string =>
	circuit?.color ? `var(--chart-${circuit.color})` : OTHER_FILL;

/** A series' fill by its chart id (`c<n>`, `other`, `untracked`). */
export const fillForSeries = (id: string): string =>
	id === UNTRACKED ? UNTRACKED_FILL : id === OTHER ? OTHER_FILL : `var(--chart-${id.slice(1)})`;
