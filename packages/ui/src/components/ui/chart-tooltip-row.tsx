/**
 * Panel extension for shadcn's chart: a tooltip's row.
 *
 * @module
 */

import type React from 'preact/compat';

/**
 * Panel extension for shadcn's chart: a tooltip row, the series' swatch, its name and value (names
 * and values in text colors). Import it only from code loaded with import(), like the chart.
 */
export const ChartTooltipRow: React.FC<{ fill: string; name: React.ReactNode; value: string }> = ({
	fill,
	name,
	value,
}) => (
	<div className="flex w-full items-center gap-2">
		<span aria-hidden className="size-2.5 shrink-0 rounded-xs" style={{ background: fill }} />
		<span className="flex-1 text-muted-foreground">{name}</span>
		<span className="font-medium font-mono text-foreground tabular-nums">{value}</span>
	</div>
);
