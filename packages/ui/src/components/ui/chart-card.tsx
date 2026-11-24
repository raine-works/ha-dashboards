/**
 * Panel extension: the card a chart sits in, its legend's swatches and its loading state. Light on
 * its own (no Recharts), so a dialog can lay its charts out before they load.
 *
 * @module
 */

import { Loader2 } from 'lucide-react';
import type React from 'preact/compat';
import { cn } from '../../lib/utils';

/** A legend entry: a series' name and color. */
export interface ChartLegendItem {
	/** The series' key (unique in the legend). */
	key: string;
	/** What the legend calls it. */
	name: string;
	/** Its CSS color. */
	color: string;
}

/** A series' key mark (beside a legend name, a pet's name). */
export const ChartSwatch: React.FC<{ color: string; className?: string }> = ({ color, className }) => (
	<span aria-hidden className={cn('size-2.5 shrink-0 rounded-[3px]', className)} style={{ background: color }} />
);

/**
 * Panel extension: a chart's card (the pets' and weather's). Its title, a line of detail ("Last 14
 * days", "45% today · 0.12 in") and the legend over the chart, which fills the rest (at least 7rem):
 * the chart goes in absolutely (`absolute inset-0`), so Recharts measures the box, not its content.
 * Light on its own; the chart inside loads with import().
 */
export const ChartCard: React.FC<{
	title: string;
	detail?: string;
	legend?: ChartLegendItem[];
	className?: string;
	children: React.ReactNode;
}> = ({ title, detail, legend, className, children }) => (
	<section className={cn('flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3', className)}>
		<div className="flex min-w-0 items-center gap-3">
			<h3 className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
			{detail && <span className="truncate text-muted-foreground text-xs">{detail}</span>}
			{legend && legend.length > 1 && (
				<span className="ml-auto flex shrink-0 items-center gap-3 text-xs">
					{legend.map((s) => (
						<span key={s.key} className="flex items-center gap-1.5">
							<ChartSwatch color={s.color} />
							{s.name}
						</span>
					))}
				</span>
			)}
		</div>
		<div className="relative min-h-28 flex-1">{children}</div>
	</section>
);

/** What a chart's card shows while its chart or data loads, or `error` when they couldn't. */
export const ChartStatus: React.FC<{ error?: string }> = ({ error }) => (
	<p className="absolute inset-0 flex items-center justify-center gap-2 text-muted-foreground text-sm">
		{error ?? (
			<>
				<Loader2 className="size-4 animate-spin" />
				Loading…
			</>
		)}
	</p>
);
