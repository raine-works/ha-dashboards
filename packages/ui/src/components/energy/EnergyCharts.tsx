/**
 * The Energy dialog's charts (Recharts, loaded on demand): the period's stacked columns and the last
 * 24 hours' draw.
 *
 * @module
 */

import type React from 'preact/compat';
import { useId } from 'preact/compat';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	ReferenceLine,
	type TooltipContentProps,
	XAxis,
	YAxis,
} from 'recharts';
import {
	type ChartBucket,
	chartRows,
	chartSeries,
	describeBucket,
	type EnergyModel,
	type EnergyPeriod,
	formatKwh,
	formatWatts,
	OTHER,
	UNTRACKED,
} from '../../lib/energy';
import { formatTime } from '../../lib/time';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { ChartTooltipRow } from '../ui/chart-tooltip-row';
import { fillForSeries, OTHER_FILL, UNTRACKED_GRAY } from './fills';

// The energy dialog's Recharts charts (shadcn's chart), loaded with import() when the dialog first
// opens: Recharts (~430KB) stays out of the bundle every page loads.

/**
 * The period as stacked columns: circuits in their `--chart-<n>` colors from the baseline, Other,
 * then Untracked hatched on top; tap or hover a column for its split, biggest first.
 */
export const PeriodChart: React.FC<{
	model: EnergyModel;
	buckets: ChartBucket[];
	period: EnergyPeriod;
	className?: string;
}> = ({ model, buckets, period, className }) => {
	const hatch = `untracked-${useId().replace(/[^\w-]/g, '')}`;
	const series = chartSeries(model);
	const config: ChartConfig = Object.fromEntries(
		series.map((s) => [
			s.id,
			{
				label: s.name,
				color: s.id === UNTRACKED ? UNTRACKED_GRAY : s.id === OTHER ? OTHER_FILL : `var(--chart-${s.color})`,
			},
		]),
	);
	const data = chartRows(model, buckets, period);

	return (
		<ChartContainer config={config} className={className}>
			<BarChart data={data} accessibilityLayer margin={{ top: 12, right: 0, bottom: 0, left: 0 }}>
				<defs>
					<pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<line x1="0" y1="0" x2="0" y2="5" stroke={UNTRACKED_GRAY} strokeWidth="2" />
					</pattern>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
				<YAxis tickLine={false} axisLine={false} width={40} tickCount={3} tickFormatter={tick} />
				<ChartTooltip
					cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
					content={({ active, payload }: TooltipContentProps<number, string>) => {
						if (!active || !payload?.length) return null;
						const row = payload[0].payload as { start: number };
						const items = payload
							.filter((p) => typeof p.value === 'number' && p.value > 0)
							.sort((a, b) => Number(b.value) - Number(a.value));
						const total = items.reduce((sum, p) => sum + Number(p.value), 0);
						return (
							<ChartTooltipContent
								active
								payload={items}
								label={`${describeBucket(new Date(row.start), period)} · ${formatKwh(total)}`}
								labelFormatter={(label) => label}
								formatter={(value, name) => (
									<ChartTooltipRow
										fill={fillForSeries(String(name))}
										name={config[String(name)]?.label ?? name}
										value={formatKwh(value as number)}
									/>
								)}
							/>
						);
					}}
				/>
				{series.map((s, i) => (
					<Bar
						key={s.id}
						dataKey={s.id}
						name={s.id}
						stackId="house"
						fill={s.id === UNTRACKED ? `url(#${hatch})` : `var(--color-${s.id})`}
						// A 2px gap of the card's color between stacked circuits (1px each side)
						stroke="var(--card)"
						strokeWidth={1}
						maxBarSize={24}
						radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
						isAnimationActive={false}
					/>
				))}
			</BarChart>
		</ChartContainer>
	);
};

/** An axis tick's number without trailing zeros: 0, 0.5, 1.25. */
const tick = (value: number) => String(Number(value.toFixed(2)));

/** A power axis tick: "500 W", "2 kW", "2.5 kW". */
const wattsTick = (watts: number) => (watts < 1000 ? `${Math.round(watts)} W` : `${tick(watts / 1000)} kW`);

const clock = (ms: number) => {
	const d = new Date(ms);
	const h = d.getHours();
	return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};

/** The house's draw over the last 24 hours as one area, with the always-on load marked. */
export const PowerChart: React.FC<{
	points: { at: number; watts: number }[];
	baseLoad?: number;
	className?: string;
}> = ({ points, baseLoad, className }) => {
	const fill = `house-${useId().replace(/[^\w-]/g, '')}`;
	const config: ChartConfig = { watts: { label: 'House', color: 'var(--chart-1)' } };
	const end = points.at(-1)?.at ?? Date.now();
	// A tick at every sixth hour of the day
	const ticks: number[] = [];
	const first = new Date(end - 86_400_000);
	first.setMinutes(0, 0, 0);
	for (let t = first.getTime(); t <= end; t += 3_600_000) if (new Date(t).getHours() % 6 === 0) ticks.push(t);

	return (
		<ChartContainer config={config} className={className}>
			<AreaChart data={points} accessibilityLayer margin={{ top: 12, right: 0, bottom: 0, left: 0 }}>
				<defs>
					<linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="var(--color-watts)" stopOpacity={0.25} />
						<stop offset="100%" stopColor="var(--color-watts)" stopOpacity={0.02} />
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="at"
					type="number"
					scale="time"
					domain={[end - 86_400_000, end]}
					ticks={ticks}
					tickFormatter={clock}
					tickLine={false}
					axisLine={false}
					tickMargin={8}
				/>
				<YAxis tickLine={false} axisLine={false} width={52} tickCount={3} tickFormatter={wattsTick} />
				{baseLoad !== undefined && (
					<ReferenceLine
						y={baseLoad}
						stroke="var(--muted-foreground)"
						strokeOpacity={0.6}
						label={{ value: 'Always on', position: 'insideBottomLeft', fill: 'var(--muted-foreground)', fontSize: 11 }}
					/>
				)}
				<ChartTooltip
					cursor={{ stroke: 'var(--border)' }}
					content={({ active, payload }: TooltipContentProps<number, string>) => {
						if (!active || !payload?.length) return null;
						const point = payload[0].payload as { at: number; watts: number };
						return (
							<ChartTooltipContent
								active
								payload={payload}
								label={formatTime(new Date(point.at))}
								labelFormatter={(label) => label}
								formatter={() => (
									<ChartTooltipRow fill="var(--chart-1)" name="House" value={formatWatts(point.watts)} />
								)}
							/>
						);
					}}
				/>
				<Area
					dataKey="watts"
					type="monotone"
					stroke="var(--color-watts)"
					strokeWidth={2}
					fill={`url(#${fill})`}
					isAnimationActive={false}
				/>
			</AreaChart>
		</ChartContainer>
	);
};
