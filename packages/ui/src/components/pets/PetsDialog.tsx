import { CookieIcon, RefreshCwIcon, RotateCcwIcon, ToiletIcon, UtensilsIcon } from 'lucide-react';
import type React from 'preact/compat';
import { lazy, Suspense, useEffect, useState } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useBusy } from '../../hooks/useBusy';
import { useNow } from '../../hooks/useNow';
import { formatAgo } from '../../lib/people';
import {
	dailyRows,
	discoverFeeders,
	discoverLitterBoxes,
	discoverPets,
	type FeederView,
	formatClockTime,
	formatMeasurement,
	formatUntil,
	type LitterBoxView,
	PET_CARE_WATCH,
	type PetView,
	petStatIds,
	type Tone,
} from '../../lib/pets';
import { cn } from '../../lib/utils';
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Badge,
	Button,
	ChartCard,
	ChartStatus,
	ChartSwatch,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Progress,
	toast,
} from '../ui';
import type { ChartSeries } from './PetCharts';
import { PET_HISTORY_DAYS, usePetHistory } from './usePetHistory';

// How long the snack button stays busy if its state never updates
const SNACK_TIMEOUT_MS = 10_000;

// Recharts (shadcn's charts) loads when the dialog first opens, in a chunk of its own, like the
// energy dialog's; every other page load skips it
const loadCharts = () => import('./PetCharts');
const DailyBars = lazy(() => loadCharts().then((m) => ({ default: m.DailyBars })));
const WeightChart = lazy(() => loadCharts().then((m) => ({ default: m.WeightChart })));

const VISITS_DAYS = 14;
const FOOD_DAYS = 14;
const chartColor = (i: number) => `var(--chart-${(i % 7) + 1})`;
const visitsText = (n: number) => `${n} ${n === 1 ? 'visit' : 'visits'}`;

const progressVariant = (tone: Tone) => (tone === 'muted' ? 'default' : tone);
const badgeVariant = (tone: Tone) => (tone === 'muted' ? 'outline' : tone);
const iconTone: Record<Tone, string> = {
	success: 'bg-success/15 text-success',
	info: 'bg-info/15 text-info',
	warning: 'bg-warning/15 text-warning',
	destructive: 'bg-destructive/15 text-destructive',
	muted: 'bg-muted text-muted-foreground',
};

const Panel: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
	<div className={cn('flex min-w-0 flex-col gap-4 rounded-lg border p-4', className)}>{children}</div>
);

const PanelHeader: React.FC<{
	icon: React.FC<{ className?: string }>;
	tone: Tone;
	title: string;
	badge?: { label: string; tone: Tone };
}> = ({ icon: Icon, tone, title, badge }) => (
	<div className="flex min-w-0 items-center gap-3">
		<span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', iconTone[tone])}>
			<Icon className="size-5" />
		</span>
		<span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
		{badge && <Badge variant={badgeVariant(badge.tone)}>{badge.label}</Badge>}
	</div>
);

const Meter: React.FC<{ label: string; value: number | null; tone: Tone }> = ({ label, value, tone }) => (
	<div className="flex flex-col gap-1.5">
		<div className="flex items-center justify-between text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium tabular-nums">{value == null ? '—' : `${Math.round(value)}%`}</span>
		</div>
		<Progress value={value ?? 0} variant={progressVariant(tone)} />
	</div>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
	<div className="flex items-center justify-between gap-3 text-sm">
		<span className="text-muted-foreground">{label}</span>
		<span className="truncate text-right font-medium">{children}</span>
	</div>
);

const PetTile: React.FC<{ pet: PetView; color: string }> = ({ pet, color }) => (
	<div className="flex min-w-0 items-center gap-4 overflow-hidden rounded-lg border p-4">
		<Avatar className="size-14">
			<AvatarImage src={pet.picture} alt={pet.name} />
			<AvatarFallback>{pet.initials}</AvatarFallback>
		</Avatar>
		<div className="flex min-w-0 flex-1 flex-col gap-0.5">
			<span className="flex min-w-0 items-center gap-2">
				<span className="truncate font-semibold text-lg">{pet.name}</span>
				{/* Its color in the charts */}
				<ChartSwatch color={color} />
			</span>
			<span className="text-muted-foreground text-sm">
				{pet.weight ? formatMeasurement(pet.weight) : 'Weight unknown'}
			</span>
		</div>
		<div className="flex shrink-0 flex-col items-end">
			<span className="font-semibold text-3xl tabular-nums leading-none">{pet.visitsToday ?? '—'}</span>
			<span className="text-muted-foreground text-xs">{pet.visitsToday === 1 ? 'visit today' : 'visits today'}</span>
		</div>
	</div>
);

const LitterBoxPanel: React.FC<{ litter: LitterBoxView }> = ({ litter }) => {
	const { callService, waitFor } = useHassApi();
	const busy = useBusy();

	// Busy until the robot reports the cycle (status or vacuum state), or the button's last press changes
	const cycle = () =>
		busy.run('cycle', () =>
			callService('vacuum', 'start', { entity_id: litter.entityId }, { errors: 'throw' })
				.then(() =>
					waitFor((hass) => discoverLitterBoxes(hass.states).some((l) => l.entityId === litter.entityId && l.cycling)),
				)
				.catch(() => toast.error("Couldn't start a clean cycle", { description: litter.name })),
		);
	const reset = () => {
		const button = litter.resetButton;
		if (!button) return;
		const pressedFrom = litter.lastReset;
		return busy.run('reset', () =>
			callService('button', 'press', { entity_id: button }, { errors: 'throw' })
				.then(() => waitFor((hass) => hass.states[button]?.state !== pressedFrom))
				.then((done) => done && toast.success('Litter box reset', { description: litter.name }))
				.catch(() => toast.error("Couldn't reset the litter box", { description: litter.name })),
		);
	};

	return (
		<Panel>
			<PanelHeader
				icon={ToiletIcon}
				tone={litter.tone}
				title={litter.name}
				badge={{ label: litter.statusLabel, tone: litter.tone }}
			/>
			<Meter label="Waste drawer" value={litter.wasteDrawer} tone={litter.wasteTone} />
			<Meter label="Litter level" value={litter.litterLevel} tone={litter.litterTone} />
			{/* A row the buttons share, never narrower than their content */}
			<div className="mt-auto flex gap-2">
				<Button
					size="xl"
					onClick={cycle}
					loading={busy.isBusy('cycle')}
					disabled={!litter.available || litter.cycling}
					className="flex-1"
				>
					<RefreshCwIcon />
					{litter.cycling ? 'Cycling' : 'Cycle'}
				</Button>
				{litter.resetButton && (
					<Button
						size="xl"
						variant="outline"
						className="flex-1"
						onClick={reset}
						loading={busy.isBusy('reset')}
						disabled={!litter.available}
					>
						<RotateCcwIcon />
						Reset
					</Button>
				)}
			</div>
		</Panel>
	);
};

const FeederPanel: React.FC<{ feeder: FeederView; now: number }> = ({ feeder, now }) => {
	const { callService } = useHassApi();
	const [giving, setGiving] = useState(false);
	// The button's state (its last press) when we pressed it; a newer one means the feeder took it.
	// State, not a ref: the React Compiler skips a component that writes one
	const [pressedFrom, setPressedFrom] = useState<string | null>(null);

	useEffect(() => {
		if (!giving || feeder.lastSnack === pressedFrom) return;
		setGiving(false);
		toast.success('Snack on the way', { description: feeder.name });
	}, [feeder.lastSnack]);

	useEffect(() => {
		if (!giving) return;
		const timer = setTimeout(() => setGiving(false), SNACK_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [giving]);

	const giveSnack = () => {
		if (!feeder.snackButton) return;
		setPressedFrom(feeder.lastSnack);
		setGiving(true);
		callService('button', 'press', { entity_id: feeder.snackButton }, { errors: 'throw' }).catch(() => {
			setGiving(false);
			toast.error("Couldn't give a snack", { description: feeder.name });
		});
	};

	const foodLow = feeder.foodTone === 'warning' || feeder.foodTone === 'destructive';

	return (
		<Panel>
			<PanelHeader
				icon={UtensilsIcon}
				tone={feeder.foodTone}
				title={feeder.name}
				badge={foodLow ? { label: 'Food low', tone: feeder.foodTone } : undefined}
			/>
			<Meter label="Food level" value={feeder.foodLevel} tone={feeder.foodTone} />
			<div className="flex flex-col gap-2">
				<Row label="Next feeding">
					{feeder.nextFeeding
						? `${formatClockTime(feeder.nextFeeding, now)} · ${formatUntil(feeder.nextFeeding, now)}`
						: '—'}
				</Row>
				<Row label="Last feeding">{feeder.lastFeeding ? formatClockTime(feeder.lastFeeding, now) : '—'}</Row>
				<Row label="Dispensed today">{feeder.dispensedToday ? formatMeasurement(feeder.dispensedToday, 2) : '—'}</Row>
				{feeder.snackButton && (
					<Row label="Last snack">{feeder.lastSnack ? formatAgo(feeder.lastSnack, now) : '—'}</Row>
				)}
			</div>
			{feeder.snackButton && (
				<Button size="xl" onClick={giveSnack} loading={giving} className="mt-auto w-full">
					<CookieIcon />
					Give snack
				</Button>
			)}
		</Panel>
	);
};

export interface PetsDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

/**
 * The pets (litter box visits today, weight), their last two weeks of visits and month of weight as
 * charts, the food dispensed a day, and beside them the litter box and feeder with their controls,
 * laid out like the weather dialog: charts sharing the main column's height, devices in a side column.
 */
export const PetsDialog: React.FC<PetsDialogProps> = ({ isOpen, onClose }) => {
	const now = useNow(isOpen, 30_000);

	const pets = useHassSelector((hass) => (isOpen && hass ? discoverPets(hass.states) : []), {
		watch: PET_CARE_WATCH,
	});
	const litterBoxes = useHassSelector((hass) => (isOpen && hass ? discoverLitterBoxes(hass.states) : []), {
		watch: PET_CARE_WATCH,
	});
	const feeders = useHassSelector((hass) => (isOpen && hass ? discoverFeeders(hass.states) : []), {
		watch: PET_CARE_WATCH,
	});
	const visits = pets.reduce((sum, p) => sum + (p.visitsToday ?? 0), 0);

	// The pets in the charts' first colors, the feeders after them
	const petSeries: ChartSeries[] = pets.map((p, i) => ({ key: p.id, name: p.name, color: chartColor(i) }));
	const fed = feeders.filter((f) => f.dispensedId);
	const foodSeries: ChartSeries[] = fed.map((f, i) => ({
		key: `food_${i}`,
		name: f.name,
		color: chartColor(pets.length + i),
	}));
	const { rows, error } = usePetHistory(
		[...pets.flatMap((p) => Object.values(petStatIds(p))), ...fed.map((f) => f.dispensedId as string)],
		isOpen,
	);
	const today = new Date(now);
	// Today's statistics lag up to an hour behind the sensors, so today's columns take the live values
	const withToday = (data: ReturnType<typeof dailyRows>, live: Record<string, number | null | undefined>) => {
		const last = data.at(-1);
		if (last) for (const [key, value] of Object.entries(live)) if (value != null) last[key] = value;
		return data;
	};
	const visitsData = rows
		? withToday(
				dailyRows(
					rows,
					pets.map((p) => ({ key: p.id, statId: petStatIds(p).visits, type: 'change' })),
					VISITS_DAYS,
					today,
				),
				Object.fromEntries(pets.map((p) => [p.id, p.visitsToday])),
			)
		: undefined;
	const weightData = rows
		? dailyRows(
				rows,
				pets.map((p) => ({ key: p.id, statId: petStatIds(p).weight, type: 'mean' })),
				PET_HISTORY_DAYS,
				today,
			)
		: undefined;
	const foodData = rows
		? withToday(
				dailyRows(
					rows,
					fed.map((f, i) => ({ key: `food_${i}`, statId: f.dispensedId as string, type: 'change' })),
					FOOD_DAYS,
					today,
				),
				Object.fromEntries(fed.map((f, i) => [`food_${i}`, f.dispensedToday?.value])),
			)
		: undefined;
	const weightUnit = pets.find((p) => p.weight)?.weight?.unit ?? '';
	const foodUnit = fed.find((f) => f.dispensedToday)?.dispensedToday?.unit ?? '';
	const status = <ChartStatus error={error && !rows ? "Couldn't load the history" : undefined} />;

	return (
		<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
			<DialogContent size="workspace">
				<DialogHeader>
					<DialogTitle>Pets</DialogTitle>
					<DialogDescription>
						{pets.length === 0 ? 'No pets found' : `${visits} litter box ${visits === 1 ? 'visit' : 'visits'} today`}
					</DialogDescription>
				</DialogHeader>

				<div className="grid min-h-0 flex-1 gap-4 max-md:overflow-y-auto md:grid-cols-[minmax(0,1fr)_22rem]">
					{/* Side by side the charts share the column's height, never below their own, the column scrolling
					    then; stacked on a phone, the dialog scrolls */}
					<div className="flex min-w-0 flex-col gap-3 md:min-h-0 md:overflow-y-auto">
						<div className="grid shrink-0 grid-cols-2 gap-3 max-sm:grid-cols-1">
							{pets.map((pet, i) => (
								<PetTile key={pet.entityId} pet={pet} color={chartColor(i)} />
							))}
						</div>
						{pets.length > 0 && (
							<ChartCard
								title="Litter box visits"
								detail={`Last ${VISITS_DAYS} days`}
								legend={petSeries}
								className="max-md:h-60 md:grow md:basis-0"
							>
								<Suspense fallback={status}>
									{visitsData ? (
										<DailyBars
											data={visitsData}
											series={petSeries}
											format={visitsText}
											className="absolute inset-0 aspect-auto"
										/>
									) : (
										status
									)}
								</Suspense>
							</ChartCard>
						)}
						<div className="grid shrink-0 gap-3 md:grow md:basis-0 lg:grid-cols-2">
							{pets.length > 0 && (
								<ChartCard title="Weight" detail="Daily average, 30 days" legend={petSeries} className="max-lg:h-60">
									<Suspense fallback={status}>
										{weightData ? (
											<WeightChart
												data={weightData}
												series={petSeries}
												unit={weightUnit}
												className="absolute inset-0 aspect-auto"
											/>
										) : (
											status
										)}
									</Suspense>
								</ChartCard>
							)}
							{fed.length > 0 && (
								<ChartCard
									title="Food dispensed"
									detail={`Last ${FOOD_DAYS} days`}
									legend={foodSeries}
									className="max-lg:h-60"
								>
									<Suspense fallback={status}>
										{foodData ? (
											<DailyBars
												data={foodData}
												series={foodSeries}
												format={(n) => `${Number(n.toFixed(2))} ${foodUnit}`.trim()}
												className="absolute inset-0 aspect-auto"
											/>
										) : (
											status
										)}
									</Suspense>
								</ChartCard>
							)}
						</div>
					</div>

					{/* The devices, their controls at hand; the column scrolls on a short screen */}
					<div className="flex min-w-0 flex-col gap-3 md:min-h-0 md:overflow-y-auto">
						{litterBoxes.map((litter) => (
							<LitterBoxPanel key={litter.entityId} litter={litter} />
						))}
						{feeders.map((feeder) => (
							<FeederPanel key={feeder.entityId} feeder={feeder} now={now} />
						))}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
