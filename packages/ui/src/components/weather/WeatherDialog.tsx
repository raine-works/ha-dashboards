/**
 * The weather dialog: today's conditions, the next hours as charts, and the days ahead.
 *
 * @module
 */

import { Cloud, CloudOff, Droplets, Eye, Gauge, Loader2, type LucideIcon, Sun, Sunrise, Sunset } from 'lucide-react';
import type React from 'preact/compat';
import { lazy, Suspense, useEffect, useState } from 'preact/compat';
import { useEntity } from '../../context/HassContext';
import { formatTime } from '../../lib/time';
import { cn } from '../../lib/utils';
import {
	forecastRange,
	formatDegrees,
	formatForecastDay,
	formatReading,
	formatWeatherCondition,
	formatWindDirection,
	hourlyRows,
	rangeBar,
	upcomingHours,
	uvLevel,
	type WeatherForecast,
} from '../../lib/weather';
import { HolidayDayMark } from '../holiday/HolidayEgg';
import {
	ChartCard,
	ChartStatus,
	Degrees,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
} from '../ui';
import { useForecast } from './useForecast';
import { WeatherIcon } from './WeatherIcon';

// Recharts (shadcn's charts) loads when the dialog first opens, in the chunk the energy and pets
// charts share; every other page load skips it
const loadCharts = () => import('./WeatherCharts');
const TemperatureChart = lazy(() => loadCharts().then((m) => ({ default: m.TemperatureChart })));
const RainChart = lazy(() => loadCharts().then((m) => ({ default: m.RainChart })));
const WindChart = lazy(() => loadCharts().then((m) => ({ default: m.WindChart })));

const TEMPERATURE_LEGEND = [
	{ key: 'temperature', name: 'Temperature', color: 'var(--chart-4)' },
	{ key: 'feelsLike', name: 'Feels like', color: 'var(--muted-foreground)' },
];
const WIND_LEGEND = [
	{ key: 'wind', name: 'Wind', color: 'var(--chart-3)' },
	{ key: 'gusts', name: 'Gusts', color: 'color-mix(in oklab, var(--chart-3) 60%, transparent)' },
];

/** The weather dialog's props: whether it's open, what closes it, and the weather entity it shows. */
export interface WeatherDialogProps {
	isOpen: boolean;
	onClose: () => void;
	/** The `weather.*` entity whose conditions and forecasts it shows. */
	entityId: string;
}

const clock = (iso?: string) => (iso ? formatTime(new Date(iso)) : '—');

/** A labeled reading in the details grid. */
const Detail: React.FC<{ icon: LucideIcon; label: string; value: string; detail?: string }> = ({
	icon: Icon,
	label,
	value,
	detail,
}) => (
	// Label at the top, the reading at the bottom
	<div className="flex min-w-0 flex-col justify-between gap-2 rounded-lg border bg-card p-3">
		<span className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
			<Icon className="size-3.5 shrink-0" />
			<span className="truncate">{label}</span>
		</span>
		<span className="flex min-w-0 flex-col gap-1">
			<span className="truncate font-semibold text-xl leading-tight">{value}</span>
			{detail && <span className="truncate text-muted-foreground text-xs">{detail}</span>}
		</span>
	</div>
);

/** Precipitation chance under an hour or beside a day, only when it's worth mentioning. */
const Chance: React.FC<{ value?: number; className?: string }> = ({ value, className }) => (
	<span className={cn('text-info text-xs tabular-nums', className)}>
		{value != null && value >= 10 ? `${value}%` : ''}
	</span>
);

const DayRow: React.FC<{ day: WeatherForecast; range?: { min: number; max: number }; now: Date }> = ({
	day,
	range,
	now,
}) => {
	const low = day.templow ?? day.temperature;
	const bar = range && low != null && day.temperature != null ? rangeBar(low, day.temperature, range) : undefined;
	return (
		<li className="flex shrink-0 grow items-center gap-3 px-3 py-2.5">
			<span className="w-12 shrink-0 font-medium">{formatForecastDay(day.datetime, now)}</span>
			{/* A holiday's character on its own days; the slot is always there, so the rows line up */}
			<span className="flex size-5 shrink-0">
				<HolidayDayMark day={new Date(day.datetime)} className="size-full" />
			</span>
			<span className="flex w-12 shrink-0 flex-col items-center">
				<WeatherIcon condition={day.condition} className="size-5" />
				{/* Always there (empty below 10%), so every day's row is the same height */}
				<Chance value={day.precipitation_probability} className="h-4" />
			</span>
			<span className="w-9 shrink-0 text-right text-muted-foreground tabular-nums">{formatDegrees(low)}</span>
			{/* The day's low to high on the week's range */}
			<span className="relative h-1.5 min-w-0 flex-1 rounded-full bg-muted">
				{bar && (
					<span
						className="absolute inset-y-0 rounded-full bg-linear-to-r from-sky-400 to-amber-400"
						style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
					/>
				)}
			</span>
			<span className="w-9 shrink-0 tabular-nums">{formatDegrees(day.temperature)}</span>
		</li>
	);
};

/**
 * The weather entity in full: now (condition, feels like, today's high and low), the next 24 hours,
 * the details (wind, humidity, UV, precipitation, pressure, visibility, cloud cover, sun), and the daily
 * forecast with each day's range on the week's. Forecasts stream live while it's open.
 */
export const WeatherDialog: React.FC<WeatherDialogProps> = ({ isOpen, onClose, entityId }) => {
	const weather = useEntity(entityId);
	const sun = useEntity('sun.sun');
	const { forecast: daily, failed: dailyFailed, retry: retryDaily } = useForecast(entityId, 'daily', isOpen);
	const { forecast: hourly } = useForecast(entityId, 'hourly', isOpen);

	// Relative labels ("Now", "Today") follow the clock while open
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		if (!isOpen) return;
		setNow(new Date());
		const timer = setInterval(() => setNow(new Date()), 60_000);
		return () => clearInterval(timer);
	}, [isOpen]);

	const a = weather?.attributes ?? {};
	const condition = weather?.state;
	const night = sun?.state === 'below_horizon';
	const today = daily[0] && formatForecastDay(daily[0].datetime, now) === 'Today' ? daily[0] : undefined;
	const rows = hourlyRows(upcomingHours(hourly, now));
	const range = forecastRange(daily);

	const windUnit = a.wind_speed_unit as string | undefined;
	const wind = formatReading(a.wind_speed, windUnit);
	const direction = formatWindDirection(a.wind_bearing as number | undefined);
	const gusts = a.wind_gust_speed != null ? `gusts ${formatReading(a.wind_gust_speed, windUnit)}` : undefined;
	const windNow = [`Now ${direction && wind !== '—' ? `${wind} ${direction}` : wind}`, gusts]
		.filter(Boolean)
		.join(' · ');
	const precipitationUnit = a.precipitation_unit as string | undefined;
	const rainToday = today
		? [
				today.precipitation_probability != null ? `${today.precipitation_probability}% today` : undefined,
				today.precipitation != null ? formatReading(today.precipitation, precipitationUnit, 2) : undefined,
			]
				.filter(Boolean)
				.join(' · ')
		: undefined;
	const chart = <ChartStatus />;
	const sunsetFirst =
		sun?.attributes.next_setting &&
		sun.attributes.next_rising &&
		Date.parse(sun.attributes.next_setting as string) < Date.parse(sun.attributes.next_rising as string);

	return (
		<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
			<DialogContent size="workspace">
				<DialogHeader>
					<DialogTitle>Weather</DialogTitle>
					<DialogDescription>
						{[condition && formatWeatherCondition(condition), a.attribution as string | undefined]
							.filter(Boolean)
							.join(' · ')}
					</DialogDescription>
				</DialogHeader>

				<div className="grid min-h-0 flex-1 gap-4 max-md:overflow-y-auto md:grid-cols-[minmax(0,1fr)_20rem]">
					{/* Shrinks (and scrolls) only side by side: stacked on a phone, the dialog scrolls instead */}
					<div className="flex min-w-0 flex-col gap-4 md:min-h-0 md:overflow-y-auto">
						{/* Now */}
						<div className="flex shrink-0 items-center gap-4">
							<WeatherIcon condition={condition} night={night} className="size-16" />
							<span className="font-light text-6xl tabular-nums leading-none tracking-tight">
								<Degrees value={a.temperature as number | undefined} />
							</span>
							<div className="flex min-w-0 flex-col">
								<span className="truncate font-semibold text-lg">
									{condition ? formatWeatherCondition(condition) : '—'}
								</span>
								<span className="truncate text-muted-foreground text-sm">
									Feels like {formatDegrees(a.apparent_temperature as number | undefined)}
								</span>
								{today && (
									<span className="truncate text-muted-foreground text-sm">
										H {formatDegrees(today.temperature)} · L {formatDegrees(today.templow)}
									</span>
								)}
							</div>
						</div>

						{/* The next 24 hours: temperature, then rain and wind side by side, sharing the column's spare
						    height (two parts to one), never below their own */}
						{rows.length > 0 && (
							<>
								<ChartCard
									title="Next 24 hours"
									detail={
										today ? `H ${formatDegrees(today.temperature)} · L ${formatDegrees(today.templow)}` : undefined
									}
									legend={TEMPERATURE_LEGEND}
									className="max-md:h-64 md:grow-2 md:basis-0"
								>
									<Suspense fallback={chart}>
										<TemperatureChart rows={rows} className="absolute inset-0 aspect-auto" />
									</Suspense>
								</ChartCard>
								<div className="grid shrink-0 gap-4 md:grow md:basis-0 lg:grid-cols-2">
									<ChartCard title="Rain" detail={rainToday} className="max-lg:h-52">
										<Suspense fallback={chart}>
											<RainChart rows={rows} unit={precipitationUnit} className="absolute inset-0 aspect-auto" />
										</Suspense>
									</ChartCard>
									<ChartCard title="Wind" detail={windNow} legend={WIND_LEGEND} className="max-lg:h-52">
										<Suspense fallback={chart}>
											<WindChart rows={rows} unit={windUnit} className="absolute inset-0 aspect-auto" />
										</Suspense>
									</ChartCard>
								</div>
							</>
						)}

						{/* Details (wind and precipitation are the charts') */}
						<div className="grid shrink-0 grid-cols-3 gap-2 max-sm:grid-cols-2 2xl:grid-cols-6">
							<Detail
								icon={Droplets}
								label="Humidity"
								value={a.humidity != null ? `${Math.round(a.humidity as number)}%` : '—'}
								detail={a.dew_point != null ? `Dew point ${formatDegrees(a.dew_point as number)}` : undefined}
							/>
							<Detail
								icon={Sun}
								label="UV index"
								value={formatReading(a.uv_index)}
								detail={uvLevel(a.uv_index as number | undefined) || undefined}
							/>
							<Detail
								icon={Gauge}
								label="Pressure"
								value={formatReading(a.pressure, a.pressure_unit as string | undefined, 2)}
							/>
							<Detail
								icon={Eye}
								label="Visibility"
								value={formatReading(a.visibility, a.visibility_unit as string | undefined)}
							/>
							<Detail
								icon={Cloud}
								label="Cloud cover"
								value={a.cloud_coverage != null ? `${Math.round(a.cloud_coverage as number)}%` : '—'}
							/>
							{sun && (
								<Detail
									icon={sunsetFirst ? Sunset : Sunrise}
									label={sunsetFirst ? 'Sunset' : 'Sunrise'}
									value={clock((sunsetFirst ? sun.attributes.next_setting : sun.attributes.next_rising) as string)}
									detail={`${sunsetFirst ? 'Sunrise' : 'Sunset'} ${clock(
										(sunsetFirst ? sun.attributes.next_rising : sun.attributes.next_setting) as string,
									)}`}
								/>
							)}
						</div>
					</div>

					{/* Daily forecast */}
					<section className="flex flex-col gap-2 md:min-h-0">
						<h3 className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							{daily.length > 0 ? `${daily.length}-day forecast` : 'Forecast'}
						</h3>
						{daily.length === 0 && dailyFailed ? (
							<EmptyState icon={<CloudOff className="size-10" />} onRetry={retryDaily}>
								Couldn't get the forecast from Home Assistant
							</EmptyState>
						) : daily.length === 0 ? (
							<p className="flex items-center gap-2 text-muted-foreground text-sm">
								<Loader2 className="size-4 animate-spin" />
								Loading…
							</p>
						) : (
							// Fills the column (days share the height); scrolls when they don't fit
							<ul className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto rounded-lg border bg-card max-md:overflow-visible">
								{daily.map((day) => (
									<DayRow key={day.datetime} day={day} range={range} now={now} />
								))}
							</ul>
						)}
					</section>
				</div>
			</DialogContent>
		</Dialog>
	);
};
