import type { EnergyCircuit } from '../../lib/energy';
import { OTHER, UNTRACKED } from '../../lib/energy';

// Series fills: a circuit's `--chart-<n>`, Other a neutral gray, Untracked a hatch of it (what
// no circuit measures, so it reads as unknown rather than as one more circuit). CSS values, for
// HTML swatches and bars; the charts draw Untracked's hatch as an SVG pattern of the same gray.
export const OTHER_FILL = 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)';
export const UNTRACKED_GRAY = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)';
export const UNTRACKED_FILL = `repeating-linear-gradient(135deg, ${UNTRACKED_GRAY} 0 2px, transparent 2px 5px)`;

export const fillFor = (circuit?: EnergyCircuit): string =>
	circuit?.color ? `var(--chart-${circuit.color})` : OTHER_FILL;

/** A series' fill by its chart id (`c<n>`, `other`, `untracked`). */
export const fillForSeries = (id: string): string =>
	id === UNTRACKED ? UNTRACKED_FILL : id === OTHER ? OTHER_FILL : `var(--chart-${id.slice(1)})`;
