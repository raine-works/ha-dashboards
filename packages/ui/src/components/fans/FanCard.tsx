import { ArrowLeftRight, Fan as FanIcon } from 'lucide-react';
import type React from 'preact/compat';
import { Fragment } from 'preact/compat';
import { useEntity, useHassApi, useHassSelector } from '../../context/HassContext';
import { useHeldValue } from '../../hooks/useHeldValue';
import { useOptimistic } from '../../hooks/useOptimistic';
import { discoverFans, FANS_WATCH, type Fan, fanLabel, getFanView } from '../../lib/fans';
import { pickStates } from '../../lib/hass-store';
import { cn } from '../../lib/utils';
import { Button, Card, CardDescription, CardHeader, CardTitle, ChipRow, Separator, Slider } from '../ui';

/** Seconds per turn of a running fan's icon: 2.4s at its slowest, 0.6s flat out. */
const spinSeconds = (percentage: number) =>
	`${(2.4 - (Math.min(100, Math.max(0, percentage)) / 100) * 1.8).toFixed(2)}s`;

/**
 * One fan: a toggle tile (its icon turning faster with the speed), name and state, the speed with a
 * slider, then Oscillate and the fan's presets. Every tap shows at once and settles when the fan reports it.
 */
export const FanRow: React.FC<{ fan: Fan; className?: string }> = ({ fan, className }) => {
	const { callService } = useHassApi();
	const { entityId, name } = fan;
	const view = getFanView(useEntity(entityId));
	const unavailable = view.status === 'unavailable';
	const on = useOptimistic(view.status === 'on');
	const oscillating = useOptimistic(view.oscillating);
	const preset = useOptimistic(view.preset);
	// The set speed shows until the fan reports it
	const speed = useHeldValue(view.percentage, (held, reported) => Math.abs(held - reported) <= view.step);
	// Whole percents: a three-speed fan's slider steps are 33.333…
	const percentage = on.value ? Math.round(speed.value) : 0;

	const toggle = () => {
		on.set(!on.value);
		callService('fan', on.value ? 'turn_off' : 'turn_on', { entity_id: entityId });
	};
	const setSpeed = (value: number) => {
		speed.commit(value);
		on.set(value > 0);
		// A speed replaces a preset on most fans
		preset.set(undefined);
		callService('fan', 'set_percentage', { entity_id: entityId, percentage: value });
	};
	const toggleOscillation = () => {
		oscillating.set(!oscillating.value);
		callService('fan', 'oscillate', { entity_id: entityId, oscillating: !oscillating.value });
	};
	const setPreset = (mode: string) => {
		preset.set(mode);
		on.set(true);
		callService('fan', 'set_preset_mode', { entity_id: entityId, preset_mode: mode });
	};

	// What it shows now, the optimistic picks included
	const label = fanLabel(unavailable ? 'unavailable' : on.value ? 'on' : 'off', {
		percentage,
		preset: preset.value,
		oscillating: oscillating.value,
		canSetSpeed: view.canSetSpeed,
	});

	return (
		// The tile, name and speed on top; the slider and chips under them, the row's full width
		<div className={cn('flex flex-col gap-3 p-4', className)}>
			<div className="flex items-center gap-3.5">
				<Button
					variant={on.value ? 'default' : 'secondary'}
					size="icon-xl"
					onClick={toggle}
					disabled={unavailable}
					aria-label={`Turn ${name} ${on.value ? 'off' : 'on'}`}
					aria-pressed={on.value}
					className="shrink-0"
				>
					<FanIcon
						className={cn('size-5', on.value && 'animate-fan-spin motion-reduce:animate-none')}
						style={{ '--fan-spin': spinSeconds(percentage || 50) } as React.CSSProperties}
					/>
				</Button>
				<div className="flex min-w-0 flex-1 items-start justify-between gap-3">
					<div className="flex min-w-0 flex-col">
						<span className="truncate font-semibold">{name}</span>
						<span className="truncate text-muted-foreground text-sm">{label}</span>
					</div>
					{/* Room for "100%", so the name never shifts as the speed changes */}
					{view.canSetSpeed && !unavailable && (
						<span className="min-w-[4ch] shrink-0 text-right font-light text-2xl tabular-nums leading-none">
							{percentage}
							<span className="text-muted-foreground text-sm">%</span>
						</span>
					)}
				</div>
			</div>

			{view.canSetSpeed && (
				<Slider
					min={0}
					max={100}
					step={view.step}
					value={percentage}
					disabled={unavailable}
					onValueChange={speed.hold}
					onValueCommit={setSpeed}
					aria-label={`${name} speed`}
				/>
			)}

			{/* Chips that scroll sideways, so a fan with many presets still fits a narrow column */}
			{(view.canOscillate || view.presets.length > 0) && (
				<ChipRow>
					{view.canOscillate && (
						<Button
							variant={oscillating.value ? 'default' : 'outline'}
							size="sm"
							onClick={toggleOscillation}
							disabled={unavailable}
							aria-pressed={oscillating.value}
						>
							<ArrowLeftRight />
							Oscillate
						</Button>
					)}
					{view.presets.map((mode) => (
						<Button
							key={mode}
							variant={on.value && preset.value === mode ? 'default' : 'outline'}
							size="sm"
							onClick={() => setPreset(mode)}
							disabled={unavailable}
							aria-pressed={on.value && preset.value === mode}
						>
							{mode}
						</Button>
					))}
				</ChipRow>
			)}
		</div>
	);
};

/** Every fan in the house (discovered) in one card, a row each. Nothing when there are none. */
export const FansCard: React.FC<{ className?: string }> = ({ className }) => {
	const fans = useHassSelector((hass) => (hass ? discoverFans(hass, hass.states) : []), { watch: FANS_WATCH });
	const fanIds = new Set(fans.map((f) => f.entityId));
	const states = useHassSelector((hass) => pickStates(hass?.states, (id) => fanIds.has(id)), {
		watch: (id) => fanIds.has(id),
	});
	if (fans.length === 0) return null;

	const onCount = fans.filter((f) => states[f.entityId]?.state === 'on').length;
	return (
		<Card className={cn('gap-0 py-0', className)}>
			<CardHeader className="items-center gap-3 border-b px-4 py-3 [.border-b]:pb-3">
				<div className="flex min-w-0 items-center gap-3">
					<FanIcon className="size-5 shrink-0 text-info" />
					<div className="min-w-0">
						<CardTitle className="truncate text-lg">{fans.length === 1 ? 'Fan' : 'Fans'}</CardTitle>
						<CardDescription className="truncate">
							{fans.length === 1
								? (fans[0].area ?? fans[0].name)
								: onCount === 0
									? 'All off'
									: `${onCount} of ${fans.length} on`}
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			{fans.map((fan, i) => (
				<Fragment key={fan.entityId}>
					{i > 0 && <Separator />}
					<FanRow fan={fan} />
				</Fragment>
			))}
		</Card>
	);
};
