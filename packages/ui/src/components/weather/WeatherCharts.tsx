import type React from 'preact/compat';
import { useId } from 'preact/compat';
import {
	Area,
	Bar,
	BarChart,
	CartesianGrid,
	ComposedChart,
	Line,
	type TooltipContentProps,
	XAxis,
	YAxis,
} from 'recharts';
import { formatDegrees, formatWeatherCondition, type HourlyRow } from '../../lib/weather';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { ChartTooltipRow } from '../ui/chart-tooltip-row';
import { WeatherIcon } from './WeatherIcon';

// The weather dialog's Recharts charts (shadcn's chart), loaded with import() when the dialog first
// opens, like the energy and pets dialogs': Recharts stays out of the bundle every page loads.

const hourLabel = (at: number) => {
	const h = new Date(at).getHours();
	return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
};
/** An hour's tick: "Now" for the first, then the hour. */
const hourTick = (rows: HourlyRow[]) => (at: number) => (at === rows[0]?.at ? 'Now' : hourLabel(at));
/** An axis tick's number without trailing zeros: 0, 0.5, 12. */
const tick = (value: number) => String(Number(value.toFixed(2)));

/**
 * The tooltip: the hour and its condition over each series' value. `series` lists the rows' keys
 * to show, each with its name, color and how to write it.
 */
const tooltip =
	(series: { key: keyof HourlyRow; name: string; color: string; format: (value: number) => string }[]) =>
	({ active, payload }: TooltipContentProps<number, string>) => {
		if (!active || !payload?.length) return null;
		const row = payload[0].payload as HourlyRow;
		const condition = row.condition ? ` · ${formatWeatherCondition(row.condition)}` : '';
		const shown = series.filter((s) => typeof row[s.key] === 'number');
		return (
			<ChartTooltipContent
				active
				payload={payload.slice(0, 1)}
				label={`${hourLabel(row.at)}${condition}`}
				labelFormatter={(label) => label}
				formatter={() => (
					<div className="flex w-full flex-col gap-1">
						{shown.map((s) => (
							<ChartTooltipRow key={s.key} fill={s.color} name={s.name} value={s.format(row[s.key] as number)} />
						))}
					</div>
				)}
			/>
		);
	};

/** The X axis's tick every third hour: the hour over its condition's icon. */
const HourTick: React.FC<{ x?: number; y?: number; payload?: { value: number }; rows: HourlyRow[] }> = ({
	x = 0,
	y = 0,
	payload,
	rows,
}) => {
	const row = rows.find((r) => r.at === payload?.value);
	if (!row) return null;
	return (
		// HTML inside the SVG, so the icon is the same WeatherIcon (and colors) as everywhere else
		<foreignObject x={x - 24} y={y + 2} width={48} height={40}>
			<div className="flex flex-col items-center gap-1 text-muted-foreground text-xs">
				<span>{hourTick(rows)(row.at)}</span>
				<WeatherIcon condition={row.condition} night={row.night} className="size-4" />
			</div>
		</foreignObject>
	);
};

/** The next 24 hours' temperature as an area, the "feels like" dashed over it, an icon every third hour. */
export const TemperatureChart: React.FC<{ rows: HourlyRow[]; className?: string }> = ({ rows, className }) => {
	const fill = `temperature-${useId().replace(/[^\w-]/g, '')}`;
	const config: ChartConfig = {
		temperature: { label: 'Temperature', color: 'var(--chart-4)' },
		feelsLike: { label: 'Feels like', color: 'var(--muted-foreground)' },
	};
	return (
		<ChartContainer config={config} className={className}>
			<ComposedChart data={rows} accessibilityLayer margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
				<defs>
					<linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="var(--color-temperature)" stopOpacity={0.3} />
						<stop offset="100%" stopColor="var(--color-temperature)" stopOpacity={0.02} />
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="at"
					interval={2}
					tickLine={false}
					axisLine={false}
					height={44}
					tick={<HourTick rows={rows} />}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					width={36}
					tickCount={4}
					domain={[(min: number) => Math.floor(min - 2), (max: number) => Math.ceil(max + 2)]}
					tickFormatter={formatDegrees}
				/>
				<ChartTooltip
					cursor={{ stroke: 'var(--border)' }}
					content={tooltip([
						{ key: 'temperature', name: 'Temperature', color: 'var(--chart-4)', format: formatDegrees },
						{ key: 'feelsLike', name: 'Feels like', color: 'var(--muted-foreground)', format: formatDegrees },
					])}
				/>
				<Area
					dataKey="temperature"
					type="monotone"
					stroke="var(--color-temperature)"
					strokeWidth={2}
					fill={`url(#${fill})`}
					connectNulls
					isAnimationActive={false}
				/>
				<Line
					dataKey="feelsLike"
					type="monotone"
					stroke="var(--color-feelsLike)"
					strokeWidth={1.5}
					strokeDasharray="4 4"
					dot={false}
					connectNulls
					isAnimationActive={false}
				/>
			</ComposedChart>
		</ChartContainer>
	);
};

/** Each hour's chance of rain as a column (0–100%), the amount in the tooltip. */
export const RainChart: React.FC<{ rows: HourlyRow[]; unit?: string; className?: string }> = ({
	rows,
	unit,
	className,
}) => (
	<ChartContainer config={{ rainChance: { label: 'Chance', color: 'var(--chart-1)' } }} className={className}>
		<BarChart data={rows} accessibilityLayer margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
			<CartesianGrid vertical={false} />
			<XAxis
				dataKey="at"
				tickFormatter={hourTick(rows)}
				tickLine={false}
				axisLine={false}
				tickMargin={8}
				minTickGap={16}
			/>
			<YAxis
				tickLine={false}
				axisLine={false}
				width={40}
				domain={[0, 100]}
				ticks={[0, 50, 100]}
				tickFormatter={(v: number) => `${v}%`}
			/>
			<ChartTooltip
				cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
				content={tooltip([
					{ key: 'rainChance', name: 'Chance', color: 'var(--chart-1)', format: (v) => `${Math.round(v)}%` },
					{
						key: 'rainAmount',
						name: 'Amount',
						color: 'var(--chart-1)',
						format: (v) => `${tick(v)} ${unit ?? ''}`.trim(),
					},
				])}
			/>
			<Bar
				dataKey="rainChance"
				fill="var(--color-rainChance)"
				maxBarSize={16}
				radius={[3, 3, 0, 0]}
				isAnimationActive={false}
			/>
		</BarChart>
	</ChartContainer>
);

/** Each hour's wind as an area, the gusts dashed over it. */
export const WindChart: React.FC<{ rows: HourlyRow[]; unit?: string; className?: string }> = ({
	rows,
	unit,
	className,
}) => {
	const fill = `wind-${useId().replace(/[^\w-]/g, '')}`;
	const speed = (v: number) => `${Math.round(v)} ${unit ?? ''}`.trim();
	return (
		<ChartContainer
			config={{ wind: { label: 'Wind', color: 'var(--chart-3)' }, gusts: { label: 'Gusts', color: 'var(--chart-3)' } }}
			className={className}
		>
			<ComposedChart data={rows} accessibilityLayer margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
				<defs>
					<linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="var(--color-wind)" stopOpacity={0.3} />
						<stop offset="100%" stopColor="var(--color-wind)" stopOpacity={0.02} />
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="at"
					tickFormatter={hourTick(rows)}
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={16}
				/>
				<YAxis tickLine={false} axisLine={false} width={28} tickCount={3} allowDecimals={false} />
				<ChartTooltip
					cursor={{ stroke: 'var(--border)' }}
					content={tooltip([
						{ key: 'wind', name: 'Wind', color: 'var(--chart-3)', format: speed },
						{ key: 'gusts', name: 'Gusts', color: 'var(--chart-3)', format: speed },
					])}
				/>
				<Area
					dataKey="wind"
					type="monotone"
					stroke="var(--color-wind)"
					strokeWidth={2}
					fill={`url(#${fill})`}
					connectNulls
					isAnimationActive={false}
				/>
				<Line
					dataKey="gusts"
					type="monotone"
					stroke="var(--color-gusts)"
					strokeOpacity={0.7}
					strokeWidth={1.5}
					strokeDasharray="4 4"
					dot={false}
					connectNulls
					isAnimationActive={false}
				/>
			</ComposedChart>
		</ChartContainer>
	);
};
