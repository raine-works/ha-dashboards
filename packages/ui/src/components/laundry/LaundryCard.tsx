/**
 * The washer and dryer: their states from the house settings' `laundry` sensors, the card showing
 * them side by side, and the toasts when one finishes.
 *
 * @module
 */

import { WashingMachineIcon, WindIcon } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useEntity, useHassApi } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import { isRecent, serverNow } from '../../lib/alerts';
import type { ApplianceEntities, HouseConfig } from '../../lib/house-config';
import { type ApplianceStatus, applianceFinished, getApplianceView, type LaundryMachine } from '../../lib/laundry';
import { cn } from '../../lib/utils';
import { Card, Separator, toast } from '../ui';

export type { ApplianceEntities } from '../../lib/house-config';

/** The laundry card's machines (the sensors each reads), and its layout classes. */
export interface LaundryCardProps {
	washer: ApplianceEntities;
	dryer: ApplianceEntities;
	className?: string;
}

/** A machine the house settings leave out: never known, so never shown. */
const missing = (name: string): ApplianceEntities => ({ name, machineState: '', jobState: '', timeRemaining: '' });

/** The house's washer and dryer (the house settings' `laundry`). */
export const laundryRoom = ({ laundry }: HouseConfig): Omit<LaundryCardProps, 'className'> => ({
	washer: laundry.washer ?? missing('Washer'),
	dryer: laundry.dryer ?? missing('Dryer'),
});

/**
 * Each machine status's classes, in theme status tokens: its text, its icon tile and its dot
 * (running is info blue and pulses, paused is amber, complete is green, idle is muted).
 */
export const STATUS_STYLES: Record<ApplianceStatus, { text: string; tile: string; dot: string }> = {
	running: { text: 'text-info', tile: 'bg-info/15 text-info', dot: 'bg-info animate-pulse' },
	paused: { text: 'text-warning', tile: 'bg-warning/15 text-warning', dot: 'bg-warning' },
	complete: { text: 'text-success', tile: 'bg-success/15 text-success', dot: 'bg-success' },
	idle: { text: 'text-muted-foreground', tile: 'bg-muted text-muted-foreground', dot: '' },
};

/** A washer's or dryer's state as the laundry shows it: its view and time left, and whether it's known. */
export interface LaundryMachineState extends LaundryMachine {
	/** Home Assistant knows the machine (its state entity exists). */
	known: boolean;
	/** When its machine or job state last changed (ISO). */
	since?: string;
}

/** One machine's state, from its machine state, job state and time remaining sensors. */
function useMachine(entities: ApplianceEntities): LaundryMachineState {
	const machine = useEntity(entities.machineState);
	const job = useEntity(entities.jobState);
	const remaining = useEntity(entities.timeRemaining);
	return {
		name: entities.name,
		view: getApplianceView(machine?.state, job?.state, remaining?.state),
		minutesLeft: remaining?.state,
		known: !!machine,
		since: [machine?.last_changed, job?.last_changed].filter(Boolean).sort().at(-1),
	};
}

/** The washer's and dryer's states. */
export function useLaundry(room?: Omit<LaundryCardProps, 'className'>): LaundryMachineState[] {
	const house = laundryRoom(useHouseConfig());
	return [useMachine((room ?? house).washer), useMachine((room ?? house).dryer)];
}

/**
 * "Washer done" toast when a cycle finishes just now (not on first render, reconnect, or a page
 * waking up hours later). Mount it once, always.
 */
export function useLaundryFinishedToasts(machines: LaundryMachineState[]) {
	const { getHass } = useHassApi();
	// Each machine's last status seen (state, not a ref, so the React Compiler keeps the hook)
	const [seen, setSeen] = useState<Record<string, ApplianceStatus>>({});
	const key = machines.map((m) => `${m.name}:${m.known ? m.view.status : ''}`).join('|');
	useEffect(() => {
		const next = { ...seen };
		const now = serverNow(getHass()?.states);
		for (const machine of machines) {
			if (!machine.known || seen[machine.name] === machine.view.status) continue;
			if (applianceFinished(seen[machine.name], machine.view.status) && isRecent(machine.since, now)) {
				toast.success(`${machine.name} done`, {
					id: `laundry:${machine.name}`,
					description: 'Ready to unload',
					duration: 30_000,
				});
			}
			next[machine.name] = machine.view.status;
		}
		setSeen(next);
	}, [key]);
}

const Appliance: React.FC<{ machine: LaundryMachineState; Icon: React.FC<{ className?: string }> }> = ({
	machine,
	Icon,
}) => {
	const { view } = machine;
	const style = STATUS_STYLES[view.status];
	return (
		<div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3">
			{/* Name on top, status at the bottom, so the tile reads well at any height */}
			<div className="flex min-w-0 items-center gap-2.5">
				<span className={cn('flex size-12 shrink-0 items-center justify-center rounded-lg', style.tile)}>
					<Icon className="size-6" />
				</span>
				<div className="flex items-center gap-1.5 font-medium text-muted-foreground text-sm uppercase tracking-wide">
					{machine.name}
					{style.dot && <span className={cn('size-1.5 rounded-full', style.dot)} />}
				</div>
			</div>
			<div className="flex min-w-0 flex-col gap-2">
				<div className="min-w-0">
					<div className="truncate font-semibold text-2xl leading-tight">{view.headline}</div>
					<div className={cn('truncate text-sm', style.text)}>{view.detail}</div>
				</div>
				{/* Only time remaining is known (no total), so running shows an indeterminate bar */}
				{view.status === 'running' && (
					<div className="h-1 overflow-hidden rounded-full bg-info/20">
						<div className="size-full animate-pulse bg-info" />
					</div>
				)}
			</div>
		</div>
	);
};

/** Washer and dryer side by side. */
export const LaundryCard: React.FC<LaundryCardProps> = ({ className, ...room }) => {
	const [washer, dryer] = useLaundry(room);
	return (
		<Card className={cn('flex-row gap-2 p-2', className)}>
			<Appliance machine={washer} Icon={WashingMachineIcon} />
			<Separator orientation="vertical" className="data-[orientation=vertical]:h-auto" />
			<Appliance machine={dryer} Icon={WindIcon} />
		</Card>
	);
};
