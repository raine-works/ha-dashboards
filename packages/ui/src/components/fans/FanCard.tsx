/**
 * Fans: a DeviceRow each in the Climate section's Fans group (what it's doing, a switch); a tap on its
 * name opens its speed, Oscillate and presets.
 *
 * @module
 */

import { ArrowLeftRight, Fan as FanIcon } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { useEntity, useHassApi, useHassSelector } from '../../context/HassContext';
import { useHeldValue } from '../../hooks/useHeldValue';
import { useOptimistic } from '../../hooks/useOptimistic';
import { discoverFans, FANS_WATCH, type Fan, fanLabel, getFanView } from '../../lib/fans';
import { pickStates } from '../../lib/hass-store';
import { cn } from '../../lib/utils';
import { SectionGroup } from '../layout/Section';
import {
	Button,
	DeviceRow,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Slider,
	Switch,
} from '../ui';

/** Seconds per turn of a running fan's icon: 2.4s at its slowest, 0.6s flat out. */
const spinSeconds = (percentage: number) =>
	`${(2.4 - (Math.min(100, Math.max(0, percentage)) / 100) * 1.8).toFixed(2)}s`;

/**
 * One fan as a DeviceRow: its icon tile (the fan turning faster with the speed), name and state, and its switch;
 * a tap on them opens its speed slider, Oscillate and presets. Every tap shows at once and settles when the fan reports it.
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
	// The speed and modes dialog
	const [adjusting, setAdjusting] = useState(false);

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

	const hasOptions = view.canSetSpeed || view.canOscillate || view.presets.length > 0;

	return (
		// A DeviceRow (docs/design/components.md): its name and what it's doing open the speed, Oscillate and
		// presets; its switch at the end turns it on and off
		<>
			<DeviceRow
				icon={
					<FanIcon
						className={cn(on.value && 'animate-fan-spin motion-reduce:animate-none')}
						style={{ '--fan-spin': spinSeconds(percentage || 50) } as React.CSSProperties}
					/>
				}
				tone={on.value ? 'on' : 'off'}
				name={name}
				status={label}
				onOpen={hasOptions && !unavailable ? () => setAdjusting(true) : undefined}
				disabled={unavailable}
				className={className}
				trailing={
					<Switch
						checked={on.value}
						onCheckedChange={toggle}
						disabled={unavailable}
						aria-label={`${name} ${on.value ? 'on' : 'off'}`}
					/>
				}
			/>

			<Dialog open={adjusting} onOpenChange={setAdjusting}>
				<DialogContent size="detail">
					<DialogHeader>
						<DialogTitle>{name}</DialogTitle>
						<DialogDescription>{label}</DialogDescription>
					</DialogHeader>
					{view.canSetSpeed && (
						<div className="flex items-center gap-4">
							<Slider
								min={0}
								max={100}
								step={view.step}
								value={percentage}
								disabled={unavailable}
								onValueChange={speed.hold}
								onValueCommit={setSpeed}
								aria-label={`${name} speed`}
								className="flex-1"
							/>
							{/* Room for "100%", so the slider never shifts as the speed changes */}
							<span className="min-w-[4ch] shrink-0 text-right font-light text-2xl tabular-nums leading-none">
								{percentage}
								<span className="text-muted-foreground text-sm">%</span>
							</span>
						</div>
					)}
					{(view.canOscillate || view.presets.length > 0) && (
						<div className="flex flex-wrap gap-2">
							{view.canOscillate && (
								<Button
									variant={oscillating.value ? 'default' : 'outline'}
									size="lg"
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
									size="lg"
									onClick={() => setPreset(mode)}
									disabled={unavailable}
									aria-pressed={on.value && preset.value === mode}
								>
									{mode}
								</Button>
							))}
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
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
		<SectionGroup
			label={fans.length > 1 && onCount > 0 ? `Fans · ${onCount} on` : fans.length === 1 ? 'Fan' : 'Fans'}
			surface
			className={className}
		>
			{fans.map((fan) => (
				<FanRow key={fan.entityId} fan={fan} />
			))}
		</SectionGroup>
	);
};
