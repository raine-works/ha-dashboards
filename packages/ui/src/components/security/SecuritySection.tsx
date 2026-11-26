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
import { SectionGroup } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';
import { SECTION_SCROLLER } from '../layout/scroll';
import { Button, type ButtonProps, DeviceRow, EmptyState, toast } from '../ui';
import { AlarmCard } from './AlarmCard';
import { CamerasCard } from './CamerasCard';

/** The security section's props. */
export interface SecuritySectionProps {
	/** One row per door and garage bay instead of cards; defaults to on for 10.5" panels. */
	compact?: boolean;
	/** The Cameras card's View all (the Home dashboard's Cameras view on phones); the camera viewer without it. */
	onViewCameras?: () => void;
	/** The Cameras card at its foot (default); a dashboard with a Cameras card of its own leaves it out. */
	cameras?: boolean;
}

const GARAGE_LABELS: Record<GarageStatus, string> = {
	closed: 'Closed',
	closing: 'Closing…',
	opening: 'Opening…',
	stopped: 'Partly open',
	open: 'Open',
	offline: 'Offline',
};

/**
 * Each lock state: its word for the row's status line, and its button, which says what a tap does
 * (docs/design/components.md: a state is never a button's label). The tone colors the status line
 * and icon tile only when something's wrong.
 */
export const LOCK_LOOKS: Record<
	LockStatus,
	{ state: string; label: string; Icon: LucideIcon; variant: ButtonProps['variant']; tone?: 'warning' | 'alarm' }
> = {
	locked: { state: 'Locked', label: 'Unlock', Icon: Unlock, variant: 'secondary' },
	// The one door needing a tap: Lock leads
	unlocked: { state: 'Unlocked', label: 'Lock', Icon: Lock, variant: 'default', tone: 'warning' },
	// No ellipsis: the spinner says it's under way, and the label has to fit its button with full padding
	locking: { state: 'Locking…', label: 'Locking', Icon: Loader2, variant: 'secondary' },
	unlocking: { state: 'Unlocking…', label: 'Unlocking', Icon: Loader2, variant: 'secondary' },
	// A tap tries to lock it again
	jammed: { state: 'Jammed', label: 'Lock again', Icon: TriangleAlert, variant: 'warning', tone: 'alarm' },
	offline: { state: 'Offline', label: 'Lock', Icon: WifiOff, variant: 'secondary' },
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
const SecuritySectionContent: React.FC<SecuritySectionProps> = ({
	compact: compactProp,
	onViewCameras,
	cameras = true,
}) => {
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
						? 'Close'
						: 'Open',
			open: () => move(false),
			close: () => move(true),
			toggle: () => move(status === 'open'),
			stop: () => {
				garagesPending.start(garage.id, 'stopping');
				send('cover', 'stop_cover', garage.id, `Couldn't stop ${garage.name}`, garagesPending.clear);
			},
		};
	});

	const lockButton = (door: (typeof doors)[number]) => (
		<Button variant={door.variant} size="md" onClick={door.toggle} disabled={door.disabled} className="min-w-28">
			<door.Icon className={cn(door.isPending && 'animate-spin')} />
			{door.label}
		</Button>
	);

	/**
	 * A bay's buttons: Stop while it moves (when the opener can stop), Open and Close when it stopped
	 * partway (as two labeled icon buttons), else the one move it can make.
	 */
	const garageActions = (garage: (typeof garages)[number]) => {
		if (garage.isMoving && garage.canStop)
			return (
				<Button variant="destructive" size="md" onClick={garage.stop} loading={garage.stopping} className="min-w-28">
					<Square className="fill-current" />
					Stop
				</Button>
			);
		// Stopped partway: both moves, as labeled icon buttons side by side
		if (garage.status === 'stopped')
			return (
				<>
					<Button
						variant="secondary"
						size="icon-md"
						onClick={garage.open}
						loading={false}
						aria-label={`Open ${garage.name}`}
						title="Open"
					>
						<ArrowUpToLine />
					</Button>
					<Button
						variant="secondary"
						size="icon-md"
						onClick={garage.close}
						loading={false}
						aria-label={`Close ${garage.name}`}
						title="Close"
					>
						<ArrowDownToLine />
					</Button>
				</>
			);
		return (
			<Button
				variant={garage.isOpen ? 'default' : 'secondary'}
				size="md"
				onClick={garage.toggle}
				disabled={garage.disabled}
				loading={false}
				className="min-w-28"
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
					<AlarmCard />
				</ModuleGate>

				{/* A new house: say what shows up here rather than leave the column blank */}
				{!hasAlarm && !hasCameras && found.locks.length === 0 && found.bays.length === 0 && (
					<EmptyState icon={<ShieldOff className="size-10" />}>
						Nothing here yet. Locks, garage doors, an Alarmo alarm and cameras show up as Home Assistant finds them.
					</EmptyState>
				)}

				{/* A DeviceRow per door and per garage bay (docs/design/components.md), in two groups: the state in
				    words on the status line (amber or red with its word only when something's wrong), the button
				    saying what a tap does */}
				{doors.length > 0 && (
					<SectionGroup label="Doors" surface>
						{doors.map((door) => (
							<DeviceRow
								key={door.id}
								icon={<Lock />}
								tone={door.tone ?? 'off'}
								name={door.name}
								status={[door.state, door.hasContact ? (door.isOpen ? 'Open' : 'Closed') : undefined]
									.filter(Boolean)
									.join(' · ')}
								statusTone={door.tone ?? (door.isOpen ? 'warning' : undefined)}
								trailing={lockButton(door)}
							/>
						))}
					</SectionGroup>
				)}
				{garages.length > 0 && (
					<SectionGroup label={garages.length === 1 ? 'Garage door' : 'Garage doors'} surface>
						{garages.map((garage) => (
							<DeviceRow
								key={garage.id}
								icon={<Warehouse />}
								tone={garage.isOpen ? 'warning' : 'off'}
								name={garage.name}
								status={garage.detail}
								statusTone={garage.isOpen ? 'warning' : undefined}
								trailing={garageActions(garage)}
							/>
						))}
					</SectionGroup>
				)}

				{cameras && (
					<ModuleGate id="cameras">
						<CamerasCard compact={compact} onViewAll={onViewCameras} />
					</ModuleGate>
				)}
			</div>
		</section>
	);
};

/** Alarm, door locks and garage bays; a crash here leaves the rest of the panel working. */
export const SecuritySection = withErrorBoundary(SecuritySectionContent, 'Security');

export { CamerasCard } from './CamerasCard';
