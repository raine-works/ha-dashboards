/**
 * The security section: the alarm, the cameras, door locks and contacts, and garage bays.
 *
 * @module
 */

import {
	ArrowDownToLine,
	ArrowUpToLine,
	Loader2,
	Lock,
	type LucideIcon,
	Shield,
	ShieldOff,
	Square,
	TriangleAlert,
	Unlock,
	Warehouse,
	WifiOff,
} from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { CONFIRM_TIMEOUT_MS, useHassApi, useHassSelector } from '../../context/HassContext';
import { ModuleGate, useModule } from '../../context/Modules';
import { COMPACT_PANEL_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { pickStates } from '../../lib/hass-store';
import {
	discoverDoorLocks,
	discoverGarageBays,
	type GaragePending,
	type GarageStatus,
	garagePendingDone,
	garageStatus,
	LOCK_FAULTS_ENTITY,
	type LockStatus,
	lockFaultEntity,
	lockFaultsIn,
	lockStatus,
	securityWatch,
} from '../../lib/security';
import { serviceErrorMessage } from '../../lib/service-calls';
import { cn } from '../../lib/utils';
import { withErrorBoundary } from '../layout/ErrorBoundary';
import { SectionHeader } from '../layout/SectionHeader';
import { SECTION_SCROLLER } from '../layout/scroll';
import { Button, type ButtonProps, Card, EmptyState, toast } from '../ui';
import { AlarmCard } from './AlarmCard';
import { CamerasCard } from './CamerasCard';

/** The security section's props. */
export interface SecuritySectionProps {
	/** One row per door and garage bay instead of cards; defaults to on for 10.5" panels. */
	compact?: boolean;
	/** The Cameras card's View all (the Home dashboard's Cameras view on phones); the camera viewer without it. */
	onViewCameras?: () => void;
}

const GARAGE_LABELS: Record<GarageStatus, string> = {
	closed: 'Closed',
	closing: 'Closing…',
	opening: 'Opening…',
	stopped: 'Partly open',
	open: 'Open',
	offline: 'Offline',
};

const LOCK_LOOKS: Record<LockStatus, { label: string; Icon: LucideIcon; variant: ButtonProps['variant'] }> = {
	locked: { label: 'Locked', Icon: Lock, variant: 'secondary' },
	unlocked: { label: 'Unlocked', Icon: Unlock, variant: 'destructive' },
	// No ellipsis: the spinner says it's under way, and the label has to fit its button with full padding
	locking: { label: 'Locking', Icon: Loader2, variant: 'secondary' },
	unlocking: { label: 'Unlocking', Icon: Loader2, variant: 'destructive' },
	// A tap tries to lock it again
	jammed: { label: 'Jammed', Icon: TriangleAlert, variant: 'warning' },
	offline: { label: 'Offline', Icon: WifiOff, variant: 'outline' },
};

/** Actions on their way, by entity, until Home Assistant reports them (or the confirm timeout). */
function usePending<T extends string>() {
	const [pending, setPending] = useState<Record<string, T>>({});
	const clear = (id: string, only?: T) =>
		setPending((prev) => {
			if (!(id in prev) || (only && prev[id] !== only)) return prev;
			const next = { ...prev };
			delete next[id];
			return next;
		});
	/** Give up on `action` after the confirm timeout, if Home Assistant hasn't reported it by then. */
	const expire = (id: string, action: T) => setTimeout(() => clear(id, action), CONFIRM_TIMEOUT_MS);
	/** Show `action` on its way; `held` keeps it with no timeout (until `expire` or `clear`). */
	const start = (id: string, action: T, held = false) => {
		setPending((prev) => ({ ...prev, [id]: action }));
		if (!held) expire(id, action);
	};
	return { pending, start, clear, expire, setPending };
}

/** Alarm, door locks (with contact sensors), garage bays and camera snapshots, discovered from Home Assistant. */
const SecuritySectionContent: React.FC<SecuritySectionProps> = ({ compact: compactProp, onViewCameras }) => {
	const { callService, getHass } = useHassApi();
	const smallPanel = useMediaQuery(COMPACT_PANEL_QUERY);
	const compact = compactProp ?? smallPanel;

	// Every lock (with its door's contact) and garage door; a new one appears on its own
	const found = useHassSelector(
		(hass) =>
			hass
				? { locks: discoverDoorLocks(hass, hass.states), bays: discoverGarageBays(hass, hass.states) }
				: { locks: [], bays: [] },
		{ watch: securityWatch(() => getHass()?.states) },
	);
	const ids = new Set([
		LOCK_FAULTS_ENTITY,
		...found.locks.map((l) => lockFaultEntity(l.id)),
		...found.locks.flatMap((l) => (l.contactId ? [l.id, l.contactId] : [l.id])),
		...found.bays.map((b) => b.id),
	]);
	// Only these entities' states, so the section re-renders when one of them changes
	const states = useHassSelector((hass) => pickStates(hass?.states, (id) => ids.has(id)), {
		watch: (id) => ids.has(id),
	});

	const locks = usePending<'locking' | 'unlocking'>();
	const garagesPending = usePending<GaragePending>();
	const hasAlarm = useModule('alarm');
	const hasCameras = useModule('cameras');

	// Done once Home Assistant reports the target
	const lockKey = found.locks.map((l) => states[l.id]?.state).join('|');
	useEffect(() => {
		locks.setPending((prev) => {
			let next = prev;
			for (const [id, target] of Object.entries(prev)) {
				const state = states[id]?.state;
				if ((target === 'locking' && state === 'locked') || (target === 'unlocking' && state === 'unlocked')) {
					if (next === prev) next = { ...prev };
					delete next[id];
				}
			}
			return next;
		});
	}, [lockKey]);
	const bayKey = found.bays.map((b) => states[b.id]?.state).join('|');
	useEffect(() => {
		garagesPending.setPending((prev) => {
			let next = prev;
			for (const [id, target] of Object.entries(prev)) {
				const state = states[id]?.state;
				if (garagePendingDone(target, state)) {
					if (next === prev) next = { ...prev };
					delete next[id];
				}
			}
			return next;
		});
	}, [bayKey]);

	// A failed call (the lock is offline, Z-Wave timed out) says so at once instead of spinning for 10s
	const send = (domain: string, service: string, id: string, failure: string, clear: (id: string) => void) => {
		callService(domain, service, { entity_id: id }, { errors: 'throw' }).catch((err) => {
			clear(id);
			toast.error(failure, { id: `security:${id}`, description: serviceErrorMessage(err) });
		});
	};

	const faults = lockFaultsIn(
		states,
		found.locks.map((l) => l.id),
	);
	const doors = found.locks.map((door) => {
		const status = lockStatus(states[door.id]?.state, locks.pending[door.id], faults.has(door.id));
		const contact = door.contactId ? states[door.contactId] : undefined;
		const isPending = status === 'locking' || status === 'unlocking';
		const lock = status !== 'locked';
		const isOpen = contact?.state === 'on';
		const look = LOCK_LOOKS[status];
		return {
			...door,
			status,
			...look,
			// Locking an open door waits for it to close (script.safe_lock_door)
			label: status === 'locking' && isOpen ? 'When closed' : look.label,
			hasContact: !!contact,
			isOpen,
			isPending,
			disabled: isPending || status === 'offline',
			toggle: () => {
				if (lock && door.contactId) {
					// Locks only once the door is closed, so the deadbolt never extends into an open door. The
					// script waits for that (up to 10 minutes), so "Locking" stays until it returns, then
					// until the lock reports locked
					locks.start(door.id, 'locking', true);
					callService(
						'script',
						'safe_lock_door',
						{ lock_entity: door.id, door_sensor: door.contactId },
						{ errors: 'throw' },
					).then(
						() => locks.expire(door.id, 'locking'),
						(err) => {
							locks.clear(door.id);
							toast.error(`Couldn't lock ${door.name}`, {
								id: `security:${door.id}`,
								description: serviceErrorMessage(err),
							});
						},
					);
					return;
				}
				locks.start(door.id, lock ? 'locking' : 'unlocking');
				send(
					'lock',
					lock ? 'lock' : 'unlock',
					door.id,
					`Couldn't ${lock ? 'lock' : 'unlock'} ${door.name}`,
					locks.clear,
				);
			},
		};
	});

	const garages = found.bays.map((garage) => {
		const entity = states[garage.id];
		const pending = garagesPending.pending[garage.id];
		const position = entity?.attributes.current_position;
		const status = garageStatus(entity?.state, pending, position);
		const isMoving = status === 'opening' || status === 'closing';
		const isOpen = status === 'open' || status === 'opening' || status === 'stopped';
		const displayStatus = GARAGE_LABELS[status];
		// cover.stop_cover (feature 8): the Konnected openers stop mid-move
		const canStop = ((Number(entity?.attributes.supported_features) || 0) & 8) !== 0;
		const move = (close: boolean) => {
			garagesPending.start(garage.id, close ? 'closing' : 'opening');
			send(
				'cover',
				close ? 'close_cover' : 'open_cover',
				garage.id,
				`Couldn't ${close ? 'close' : 'open'} ${garage.name}`,
				garagesPending.clear,
			);
		};
		return {
			...garage,
			status,
			isOpen,
			isMoving,
			canStop,
			stopping: pending === 'stopping',
			displayStatus,
			// "40% open" in the compact rows
			detail: status === 'stopped' && typeof position === 'number' ? `${position}% open` : displayStatus,
			disabled: (isMoving && !canStop) || status === 'offline',
			// No ellipsis on a moving door's button: its spinner says so, as on the lock buttons
			buttonLabel: isMoving
				? displayStatus.replace(/\.+$/, '')
				: status === 'offline'
					? displayStatus
					: status === 'open'
						? 'Close door'
						: 'Open door',
			open: () => move(false),
			close: () => move(true),
			toggle: () => move(status === 'open'),
			stop: () => {
				garagesPending.start(garage.id, 'stopping');
				send('cover', 'stop_cover', garage.id, `Couldn't stop ${garage.name}`, garagesPending.clear);
			},
		};
	});

	const lockButton = (door: (typeof doors)[number], size: 'xl' | 'lg', className?: string) => (
		<Button variant={door.variant} size={size} onClick={door.toggle} disabled={door.disabled} className={className}>
			<door.Icon className={cn(door.isPending && 'animate-spin')} />
			{/* The button's width comes from its layout (w-36, or its card), so the label needn't hold one */}
			{door.label}
		</Button>
	);

	/**
	 * A bay's buttons: Stop while it moves (when the opener can stop), Open and Close when it stopped
	 * partway, else the one move it can make. Two buttons never squeeze into one's room: a row's
	 * narrow slot gets icon buttons, a card stacks them.
	 */
	const garageActions = (garage: (typeof garages)[number], size: 'xl' | 'lg') => {
		if (garage.isMoving && garage.canStop)
			return (
				<Button variant="destructive" size={size} onClick={garage.stop} loading={garage.stopping} className="w-full">
					<Square className="fill-current" />
					Stop
				</Button>
			);
		if (garage.status === 'stopped')
			return size === 'lg' ? (
				<div className="flex w-full justify-end gap-2">
					<Button
						variant="secondary"
						size="icon-lg"
						onClick={garage.open}
						loading={false}
						aria-label={`Open ${garage.name}`}
						title="Open"
					>
						<ArrowUpToLine />
					</Button>
					<Button
						variant="default"
						size="icon-lg"
						onClick={garage.close}
						loading={false}
						aria-label={`Close ${garage.name}`}
						title="Close"
					>
						<ArrowDownToLine />
					</Button>
				</div>
			) : (
				<div className="flex w-full flex-col gap-2">
					<Button variant="secondary" size={size} onClick={garage.open} loading={false} className="w-full">
						<ArrowUpToLine />
						Open
					</Button>
					<Button variant="default" size={size} onClick={garage.close} loading={false} className="w-full">
						<ArrowDownToLine />
						Close
					</Button>
				</div>
			);
		return (
			<Button
				variant={garage.isOpen ? 'default' : 'secondary'}
				size={size}
				onClick={garage.toggle}
				disabled={garage.disabled}
				loading={false}
				className="w-full"
			>
				{/* The icon turns into a spinner in place */}
				{garage.isMoving ? (
					<Loader2 className="animate-spin" />
				) : garage.status === 'offline' ? (
					<WifiOff />
				) : (
					<Warehouse />
				)}
				{garage.buttonLabel}
			</Button>
		);
	};

	return (
		<section className={cn('flex h-full min-h-0 flex-col', compact ? 'gap-3' : 'gap-4')}>
			{/* Section Header */}
			<SectionHeader icon={<Shield />} title="Security" />
			{/* Scrolls under the section title when the cards don't fit, to the screen's bottom edge like the other columns */}
			<div className={cn('flex min-h-0 flex-1 flex-col', SECTION_SCROLLER, compact ? 'gap-3' : 'gap-4')}>
				<ModuleGate id="alarm">
					<AlarmCard compact={compact} />
				</ModuleGate>

				{/* A new house: say what shows up here rather than leave the column blank */}
				{!hasAlarm && !hasCameras && found.locks.length === 0 && found.bays.length === 0 && (
					<EmptyState icon={<ShieldOff className="size-10" />}>
						Nothing here yet. Locks, garage doors, an Alarmo alarm and cameras show up as Home Assistant finds them.
					</EmptyState>
				)}

				{/* One card, a row per door and per garage bay, at every size: the same look on the 15" and
				    10.5" panels, desktops and phones */}
				<Card className="shrink-0 gap-0 py-0.5">
					{doors.map((door, i) => (
						<div key={door.id} className={cn('flex items-center gap-3 px-4 py-1.5 touch:py-0.5', i > 0 && 'border-t')}>
							<Lock className="size-5 shrink-0 text-muted-foreground" />
							{/* Status under the name: three columns leave little room for a badge beside it */}
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate font-semibold">{door.name}</span>
								{door.hasContact && (
									<span className={cn('text-xs', door.isOpen ? 'text-warning' : 'text-muted-foreground')}>
										{door.isOpen ? 'Open' : 'Closed'}
									</span>
								)}
							</div>
							{lockButton(door, 'lg', 'w-36')}
						</div>
					))}
					{garages.map((garage) => (
						<div key={garage.id} className="flex items-center gap-3 border-t px-4 py-1.5 touch:py-0.5">
							<Warehouse
								className={cn('size-5 shrink-0', garage.isOpen ? 'text-foreground' : 'text-muted-foreground')}
							/>
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate font-semibold">{garage.name}</span>
								<span className={cn('truncate text-xs', garage.isOpen ? 'text-warning' : 'text-muted-foreground')}>
									{garage.detail}
								</span>
							</div>
							<div className="w-36 shrink-0">{garageActions(garage, 'lg')}</div>
						</div>
					))}
				</Card>

				<ModuleGate id="cameras">
					<CamerasCard compact={compact} onViewAll={onViewCameras} />
				</ModuleGate>
			</div>
		</section>
	);
};

/** Alarm, door locks and garage bays; a crash here leaves the rest of the panel working. */
export const SecuritySection = withErrorBoundary(SecuritySectionContent, 'Security');
