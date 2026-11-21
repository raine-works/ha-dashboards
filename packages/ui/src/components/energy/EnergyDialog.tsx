import { CornerDownRight, Gauge, Loader2, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import type React from 'preact/compat';
import { lazy, Suspense, useMemo, useState } from 'preact/compat';
import {
	compareToPrevious,
	type EnergyModel,
	type EnergyPeriod,
	formatKwh,
	formatWatts,
	type LivePower,
	monthlyKwh,
	OTHER,
	powerTimeline,
	runningCircuits,
	type StatisticRows,
	UNTRACKED,
} from '../../lib/energy';
import {
	Button,
	type ButtonProps,
	ChartSwatch,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
	ToggleGroup,
	ToggleGroupItem,
} from '../ui';
import { fillFor, OTHER_FILL, UNTRACKED_FILL } from './fills';
import { useEnergyHistory, useEnergyModel, useHouseWatts, useLivePower, usePowerHistory } from './useEnergy';

// Recharts (shadcn's charts) is ~430KB, so the charts load when the dialog first opens, in a chunk
// of their own; every other page load skips it
const loadCharts = () => import('./EnergyCharts');
const PeriodChart = lazy(() => loadCharts().then((m) => ({ default: m.PeriodChart })));
const PowerChart = lazy(() => loadCharts().then((m) => ({ default: m.PowerChart })));

const PERIOD_TITLES: Record<EnergyPeriod, string> = {
	today: 'Today by hour',
	week: 'This week by day',
	month: 'This month by day',
};

/**
 * The house's draw now: the number, its split across circuits, what's running, the always-on load
 * and the last 24 hours.
 */
const NowCard: React.FC<{
	model: EnergyModel;
	live: LivePower | null;
	baseLoad?: number;
	power?: StatisticRows;
}> = ({ model, live, baseLoad, power }) => {
	const total = live?.total;
	const tops = model.circuits.filter((c) => !c.parent);
	const segments: { key: string; name: string; watts: number; fill: string }[] = live
		? [
				...tops
					.filter((c) => c.color)
					.map((c) => ({ key: c.statId, name: c.name, watts: live.circuits[c.statId] ?? 0, fill: fillFor(c) })),
				{
					key: OTHER,
					name: 'Other circuits',
					watts: tops.filter((c) => !c.color).reduce((sum, c) => sum + (live.circuits[c.statId] ?? 0), 0),
					fill: OTHER_FILL,
				},
				{ key: UNTRACKED, name: 'Untracked', watts: live.untracked ?? 0, fill: UNTRACKED_FILL },
			].filter((s) => s.watts >= 1)
		: [];
	const sum = segments.reduce((s, seg) => s + seg.watts, 0);
	const running = live ? runningCircuits(model, live) : [];
	// The last day's points are the same until the next statistics arrive; only the live one moves
	const past = useMemo(() => (power ? powerTimeline(model, power) : []), [model, power]);
	const points = power && total !== undefined ? [...past, { at: Date.now(), watts: total }] : past;

	return (
		<section className="flex shrink-0 flex-col gap-3 rounded-lg border bg-card p-4">
			<div className="flex items-end justify-between gap-3">
				<div className="flex flex-col">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Using now</span>
					<span className="font-light text-5xl tabular-nums leading-tight tracking-tight">{formatWatts(total)}</span>
				</div>
				{baseLoad !== undefined && (
					<div className="flex min-w-0 flex-col items-end text-right">
						<span className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							<Gauge className="size-3.5" />
							Always on
						</span>
						<span className="font-semibold">{formatWatts(baseLoad)}</span>
						<span className="text-muted-foreground text-xs">≈ {formatKwh(monthlyKwh(baseLoad))} a month</span>
					</div>
				)}
			</div>

			{/* The split: one bar, a 2px gap between its circuits */}
			<div className="flex h-3 gap-0.5 overflow-hidden rounded-sm bg-muted" role="img" aria-label="Split by circuit">
				{segments.map((seg) => (
					<span
						key={seg.key}
						title={`${seg.name}: ${formatWatts(seg.watts)}`}
						className="h-full min-w-0.5"
						style={{ width: `${(seg.watts / sum) * 100}%`, background: seg.fill }}
					/>
				))}
			</div>

			{running.length > 0 && (
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-muted-foreground text-xs">Running</span>
					{running.map(({ circuit, watts }) => {
						const parent = circuit.parent && model.circuits.find((c) => c.statId === circuit.parent);
						return (
							<span key={circuit.statId} className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-sm">
								<ChartSwatch color={fillFor(parent || circuit)} />
								{circuit.name}
								<span className="text-muted-foreground tabular-nums">{formatWatts(watts)}</span>
							</span>
						);
					})}
				</div>
			)}

			{/* The last 24 hours (the chart's chunk loads with the dialog; the box holds its place) */}
			{points.length > 1 && (
				<Suspense fallback={<div className="h-28" />}>
					<PowerChart points={points} baseLoad={baseLoad} className="aspect-auto h-28 w-full" />
				</Suspense>
			)}
		</section>
	);
};

/** A device measured within a circuit (the washer in the laundry circuit): a line inside the circuit's row. */
interface WithinRow {
	statId: string;
	name: string;
	kWh: number;
	watts?: number;
}

/**
 * One row of the period's list: swatch, name, share and live draw, energy, and a bar of its share;
 * then the devices measured within it, as lines (they're part of its energy, not more of the house's).
 */
const CircuitRow: React.FC<{
	name: string;
	fill: string;
	kWh: number;
	share: number;
	scale: number;
	watts?: number;
	within?: WithinRow[];
}> = ({ name, fill, kWh, share, scale, watts, within = [] }) => (
	<li className="flex shrink-0 flex-col gap-1.5 px-3 py-2.5">
		<div className="flex items-center gap-2.5">
			<ChartSwatch color={fill} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium text-sm">{name}</span>
				<span className="truncate text-muted-foreground text-xs">
					{Math.round(share * 100)}%{watts !== undefined && ` · ${formatWatts(watts)} now`}
				</span>
			</span>
			<span className="shrink-0 font-semibold text-sm tabular-nums">{formatKwh(kWh)}</span>
		</div>
		<span className="h-1 overflow-hidden rounded-full bg-muted">
			<span className="block h-full rounded-full" style={{ width: `${scale * 100}%`, background: fill }} />
		</span>
		{within.map((device) => (
			<span key={device.statId} className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<CornerDownRight className="size-3.5 shrink-0" />
				<span className="min-w-0 flex-1 truncate">
					{device.name}
					{device.watts !== undefined && ` · ${formatWatts(device.watts)} now`}
				</span>
				<span className="shrink-0 tabular-nums">{formatKwh(device.kWh)}</span>
			</span>
		))}
	</li>
);

const EnergyContent: React.FC = () => {
	// Fetches the Energy settings again on open, so a device added in Home Assistant shows up
	const model = useEnergyModel(true);
	const live = useLivePower(model);
	const [period, setPeriod] = useState<EnergyPeriod>('today');
	const history = useEnergyHistory(model, period, true);
	const power = usePowerHistory(model, true);

	if (!model) {
		return (
			<EmptyState icon={<Zap className="size-10" />}>
				Add a grid meter (and your circuits as devices) to Home Assistant's Energy dashboard to see it here.
			</EmptyState>
		);
	}

	const { summary, buckets } = history;
	const change =
		summary && history.previous !== undefined && compareToPrevious(summary.total, history.previous, period);

	// The list: top-level circuits by energy (each with the devices measured within it), then Untracked
	const rows = summary ? summary.circuits.filter((c) => !c.circuit.parent).sort((a, b) => b.kWh - a.kWh) : [];
	const biggest = summary ? Math.max(summary.untracked, ...rows.map((c) => c.kWh), 0.001) : 1;

	return (
		<div className="grid min-h-0 flex-1 gap-4 max-md:overflow-y-auto md:grid-cols-[minmax(0,1fr)_22rem]">
			<div className="flex min-w-0 flex-col gap-4 md:min-h-0 md:overflow-y-auto">
				<NowCard model={model} live={live} baseLoad={history.baseLoad} power={power} />

				<section className="flex shrink-0 flex-col gap-3 rounded-lg border bg-card p-4 md:min-h-72 md:flex-1">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							{PERIOD_TITLES[period]}
						</h3>
						<ToggleGroup
							variant="outline"
							size="sm"
							value={period}
							onValueChange={(value) => value && setPeriod(value as EnergyPeriod)}
						>
							<ToggleGroupItem value="today" className="px-3">
								Today
							</ToggleGroupItem>
							<ToggleGroupItem value="week" className="px-3">
								Week
							</ToggleGroupItem>
							<ToggleGroupItem value="month" className="px-3">
								Month
							</ToggleGroupItem>
						</ToggleGroup>
					</div>

					{/* The period's total and the change from the previous one; two lines, so nothing moves */}
					<div className="flex h-11 flex-col justify-center">
						{summary ? (
							<>
								<span className="font-semibold">
									{formatKwh(summary.total)} <span className="font-normal text-muted-foreground">so far</span>
								</span>
								{change && (
									<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
										{change.direction === 'down' ? (
											<TrendingDown className="size-3.5 text-success" />
										) : change.direction === 'up' ? (
											<TrendingUp className="size-3.5 text-warning" />
										) : null}
										{change.text}
									</span>
								)}
							</>
						) : (
							!history.error && (
								<span className="flex items-center gap-2 text-muted-foreground text-sm">
									<Loader2 className="size-4 animate-spin" />
									Loading…
								</span>
							)
						)}
					</div>

					{history.error && !summary ? (
						<EmptyState
							icon={<Zap className="size-10" />}
							onRetry={history.retry}
							retrying={history.loading}
							className="flex-1 justify-center"
						>
							Couldn't load the energy history from Home Assistant
						</EmptyState>
					) : (
						// A fixed height stacked (phones); side by side, the card's spare height
						<div className="relative h-56 md:h-auto md:min-h-44 md:flex-1">
							<Suspense fallback={null}>
								{buckets.length > 0 && (
									<PeriodChart
										model={model}
										buckets={buckets}
										period={period}
										className="absolute inset-0 aspect-auto"
									/>
								)}
							</Suspense>
						</div>
					)}
				</section>
			</div>

			{/* Where it went: every circuit this period (the chart's legend too), then what no circuit measures */}
			<section className="flex flex-col gap-2 md:min-h-0">
				<h3 className="shrink-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Where it went</h3>
				{summary ? (
					<ul className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto rounded-lg border bg-card max-md:overflow-visible">
						{rows.map(({ circuit, kWh }) => (
							<CircuitRow
								key={circuit.statId}
								name={circuit.name}
								fill={fillFor(circuit)}
								kWh={kWh}
								share={summary.total > 0 ? kWh / summary.total : 0}
								scale={kWh / biggest}
								watts={live?.circuits[circuit.statId]}
								within={summary.circuits
									.filter((c) => c.circuit.parent === circuit.statId)
									.map((c) => ({
										statId: c.circuit.statId,
										name: c.circuit.name,
										kWh: c.kWh,
										watts: live?.circuits[c.circuit.statId],
									}))}
							/>
						))}
						<CircuitRow
							name="Untracked"
							fill={UNTRACKED_FILL}
							kWh={summary.untracked}
							share={summary.total > 0 ? summary.untracked / summary.total : 0}
							scale={summary.untracked / biggest}
							watts={live?.untracked}
						/>
					</ul>
				) : (
					!history.error && (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<Loader2 className="size-4 animate-spin" />
							Loading…
						</p>
					)
				)}
			</section>
		</div>
	);
};

export interface EnergyDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

/**
 * The house's electricity, from Home Assistant's Energy settings: what it's using now (split by
 * circuit, what's running, the always-on load, the last 24 hours), today by hour or this week or
 * month by day as stacked columns, and every circuit's share of the period.
 */
export const EnergyDialog: React.FC<EnergyDialogProps> = ({ isOpen, onClose }) => (
	<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
		<DialogContent size="workspace">
			<DialogHeader>
				<DialogTitle>Energy</DialogTitle>
				<DialogDescription>Live from the circuit monitor, with history from Home Assistant</DialogDescription>
			</DialogHeader>
			<EnergyContent />
		</DialogContent>
	</Dialog>
);

/** The house's live draw ("905 W"), for a menu item's hint. */
export const HouseWatts: React.FC = () => {
	const watts = useHouseWatts();
	return watts === undefined ? null : <span className="tabular-nums">{watts}</span>;
};

/** The house's live draw as a header chip; opens the energy dialog. Nothing without a grid meter. */
export const EnergyButton: React.FC<{ size?: ButtonProps['size']; className?: string }> = ({
	size = 'sm',
	className,
}) => {
	const [open, setOpen] = useState(false);
	const watts = useHouseWatts();
	if (watts === undefined && !open) return null;
	const label = `Energy: using ${watts ?? formatWatts(undefined)}`;

	return (
		<>
			<Button
				variant="outline"
				size={size}
				onClick={() => setOpen(true)}
				aria-label={label}
				title={label}
				className={className}
			>
				<Zap />
				{/* Room for "1,234 W" / "12.5 kW", so the reading changing never shifts the row */}
				<span className="min-w-[5ch] text-left tabular-nums">{watts ?? formatWatts(undefined)}</span>
			</Button>
			<EnergyDialog isOpen={open} onClose={() => setOpen(false)} />
		</>
	);
};
