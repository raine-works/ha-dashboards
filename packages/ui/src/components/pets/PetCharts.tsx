import type React from 'preact/compat';
import { Bar, BarChart, CartesianGrid, Line, LineChart, type TooltipContentProps, XAxis, YAxis } from 'recharts';
import type { DailyRow } from '../../lib/pets';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { ChartTooltipRow } from '../ui/chart-tooltip-row';

// The pets dialog's Recharts charts (shadcn's chart), loaded with import() when the dialog first
// opens, like the energy dialog's: Recharts stays out of the bundle every page loads.

/** A chart series: its key in the rows, its name and its color (`var(--chart-<n>)`). */
export interface ChartSeries {
	key: string;
	name: string;
	color: string;
}

const dayTick = (start: number) => new Date(start).toLocaleDateString('en-US', { weekday: 'short' });
const dateTick = (start: number) => new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const dayLabel = (start: number) =>
	new Date(start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
/** An axis tick's number without trailing zeros: 0, 0.5, 11.25. */
const tick = (value: number) => String(Number(value.toFixed(2)));

const configFor = (series: ChartSeries[]): ChartConfig =>
	Object.fromEntries(series.map((s) => [s.key, { label: s.name, color: s.color }]));

/** The day's values under its date, with the unit after each ("4 visits", "11.6 lb"). */
const tooltip =
	(series: ChartSeries[], format: (value: number) => string, total?: (value: number) => string) =>
	({ active, payload }: TooltipContentProps<number, string>) => {
		if (!active || !payload?.length) return null;
		const row = payload[0].payload as DailyRow;
		const items = payload.filter((p) => typeof p.value === 'number');
		const sum = items.reduce((s, p) => s + Number(p.value), 0);
		return (
			<ChartTooltipContent
				active
				payload={items}
				label={total && items.length > 1 ? `${dayLabel(row.start)} · ${total(sum)}` : dayLabel(row.start)}
				labelFormatter={(label) => label}
				formatter={(value, name) => {
					const s = series.find((x) => x.key === name);
					return (
						<ChartTooltipRow fill={s?.color ?? 'currentColor'} name={s?.name ?? name} value={format(value as number)} />
					);
				}}
			/>
		);
	};

/**
 * A value a day as columns, several series stacked in their colors (the pets' visits); `format`
 * writes a value with its unit for the tooltip, which totals a stacked day.
 */
export const DailyBars: React.FC<{
	data: DailyRow[];
	series: ChartSeries[];
	format: (value: number) => string;
	className?: string;
}> = ({ data, series, format, className }) => (
	<ChartContainer config={configFor(series)} className={className}>
		<BarChart data={data} accessibilityLayer margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
			<CartesianGrid vertical={false} />
			<XAxis dataKey="start" tickFormatter={dayTick} tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
			<YAxis tickLine={false} axisLine={false} width={28} tickCount={3} tickFormatter={tick} />
			<ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.6 }} content={tooltip(series, format, format)} />
			{series.map((s, i) => (
				<Bar
					key={s.key}
					dataKey={s.key}
					name={s.key}
					stackId="day"
					fill={`var(--color-${s.key})`}
					// A 2px gap of the card's color between stacked series (1px each side)
					stroke="var(--card)"
					strokeWidth={1}
					maxBarSize={28}
					radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
					isAnimationActive={false}
				/>
			))}
		</BarChart>
	</ChartContainer>
);

/** Each pet's weight, a day's average, as a line; days without a weigh-in are bridged. */
export const WeightChart: React.FC<{ data: DailyRow[]; series: ChartSeries[]; unit: string; className?: string }> = ({
	data,
	series,
	unit,
	className,
}) => (
	<ChartContainer config={configFor(series)} className={className}>
		<LineChart data={data} accessibilityLayer margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
			<CartesianGrid vertical={false} />
			<XAxis
				dataKey="start"
				tickFormatter={dateTick}
				tickLine={false}
				axisLine={false}
				tickMargin={8}
				minTickGap={24}
			/>
			<YAxis
				tickLine={false}
				axisLine={false}
				width={36}
				tickCount={3}
				domain={[(min: number) => Math.floor(min - 0.5), (max: number) => Math.ceil(max + 0.5)]}
				tickFormatter={tick}
			/>
			<ChartTooltip
				cursor={{ stroke: 'var(--border)' }}
				content={tooltip(series, (n) => `${n.toFixed(1)} ${unit}`.trim())}
			/>
			{series.map((s) => (
				<Line
					key={s.key}
					dataKey={s.key}
					name={s.key}
					type="monotone"
					stroke={`var(--color-${s.key})`}
					strokeWidth={2}
					dot={false}
					connectNulls
					isAnimationActive={false}
				/>
			))}
		</LineChart>
	</ChartContainer>
);
