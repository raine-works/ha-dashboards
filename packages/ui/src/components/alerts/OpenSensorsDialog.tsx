/**
 * The Open Doors & Windows dialog: every open door, window and garage door, and how long it's been
 * open, with a Close button for those that can close. One per page, opened with
 * `showOpenSensors()`.
 *
 * @module
 */

import {
	AppWindowIcon,
	ArrowDownToLineIcon,
	DoorOpenIcon,
	Loader2Icon,
	ShieldCheckIcon,
	WarehouseIcon,
} from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState, useSyncExternalStore } from 'preact/compat';
import { useHassApi, useHassSelector } from '../../context/HassContext';
import { useNow } from '../../hooks/useNow';
import { discoverOpenings, type OpeningKind, openingsWatch } from '../../lib/alerts';
import { HolidayPeek } from '../holiday/HolidayEgg';
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
	StableLabel,
} from '../ui';

const KIND_ICONS: Record<OpeningKind, React.FC<{ className?: string }>> = {
	door: DoorOpenIcon,
	window: AppWindowIcon,
	garage: WarehouseIcon,
	opening: DoorOpenIcon,
};

// A Close tap shows "Closing…" at once, until the door reports closing (or this long passes)
const CLOSE_PENDING_MS = 15_000;

function openFor(since: string, now: number): string {
	const minutes = Math.floor((now - Date.parse(since)) / 60_000);
	if (minutes < 1) return 'Just now';
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	return hours < 24 ? `${hours} hr ${minutes % 60} min` : `${Math.floor(hours / 24)} days`;
}

// One dialog for the page, whoever opens it (the header's "N Open" button, an opened toast's View):
// each kept its own and both could be open at once, one over the other. PanelAlerts, mounted once
// on every dashboard, renders it
let shown = false;
const shownListeners = new Set<() => void>();

function setShown(next: boolean) {
	if (next === shown) return;
	shown = next;
	for (const listener of shownListeners) listener();
}

const subscribeShown = (listener: () => void) => {
	shownListeners.add(listener);
	return () => {
		shownListeners.delete(listener);
	};
};

/** Open the page's doors & windows dialog (a no-op while it's open). */
export const showOpenSensors = () => setShown(true);

/** The page's one doors & windows dialog, opened with `showOpenSensors()`. */
export const SharedOpenSensorsDialog: React.FC = () => {
	const isOpen = useSyncExternalStore(subscribeShown, () => shown);
	return <OpenSensorsDialog isOpen={isOpen} onClose={() => setShown(false)} />;
};

/** {@link OpenSensorsDialog}'s props. */
export interface OpenSensorsDialogProps {
	/** Whether the dialog is open. */
	isOpen: boolean;
	/** Called when it's dismissed. */
	onClose: () => void;
}

/**
 * Every door, window and garage door that is currently open, with how long it has been open. A
 * door that can close (a garage door) has a Close button; once tapped it stays listed as
 * "Closing…" until it reports closed.
 */
export const OpenSensorsDialog: React.FC<OpenSensorsDialogProps> = ({ isOpen, onClose }) => {
	const { callService, getHass } = useHassApi();
	const now = useNow(isOpen, 30_000);
	// Close tapped (epoch ms), shown as closing until the door reports it
	const [closing, setClosing] = useState<Record<string, number>>({});

	// Open ones, and doors on their way closed (they stay until they report closed)
	const listed = useHassSelector(
		(hass) => (isOpen && hass ? discoverOpenings(hass.states).filter((o) => o.isOpen || o.isClosing) : []),
		{ watch: openingsWatch(() => getHass()?.states) },
	);
	const open = listed.filter((o) => o.isOpen);

	// A tap's "Closing…" ends once the door reports closing (its own state takes over) or closed
	const reported = listed.map((o) => `${o.entityId}:${o.isOpen}:${o.isClosing}`).join('|');
	useEffect(() => {
		setClosing((current) => {
			let next = current;
			for (const id of Object.keys(current)) {
				const o = listed.find((l) => l.entityId === id);
				if (!o || o.isClosing || !o.isOpen) {
					if (next === current) next = { ...current };
					delete next[id];
				}
			}
			return next;
		});
	}, [reported]);
	useEffect(() => {
		const ids = Object.keys(closing);
		if (ids.length === 0) return;
		const timer = setTimeout(() => setClosing({}), CLOSE_PENDING_MS);
		return () => clearTimeout(timer);
	}, [closing]);

	const close = (entityId: string) => {
		setClosing((current) => ({ ...current, [entityId]: Date.now() }));
		callService('cover', 'close_cover', { entity_id: entityId });
	};

	return (
		<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Open Doors & Windows</DialogTitle>
					<DialogDescription>
						{open.length > 0
							? `${open.length} currently open`
							: listed.length > 0
								? 'Closing…'
								: 'Everything is closed'}
					</DialogDescription>
				</DialogHeader>

				{listed.length === 0 ? (
					<EmptyState icon={<HolidayPeek className="size-10" fallback={<ShieldCheckIcon className="size-10" />} />}>
						All doors, windows and garage doors are closed.
					</EmptyState>
				) : (
					// The dialog scrolls inside itself (capped at --panel-height): a vh cap here ignored the
					// toolbar and gave a phone's full-screen dialog a second scroller
					<ul className="flex flex-col divide-y rounded-lg border">
						{listed.map((opening) => {
							const Icon = KIND_ICONS[opening.kind];
							const isClosing = opening.isClosing || opening.entityId in closing;
							return (
								<li key={opening.entityId} className="flex min-h-16 items-center gap-3 px-4 py-2">
									<Icon className="size-5 shrink-0 text-warning" />
									<span className="min-w-0 flex-1 truncate font-medium">{opening.name}</span>
									{/* While it closes, its button says so */}
									{!(isClosing && opening.closable) && (
										<span className="shrink-0 text-muted-foreground text-sm tabular-nums">
											{isClosing ? 'Closing…' : openFor(opening.since, now)}
										</span>
									)}
									{opening.closable && (
										<Button
											variant="outline"
											size="lg"
											onClick={() => close(opening.entityId)}
											disabled={isClosing || !opening.available}
											aria-label={`Close ${opening.name}`}
											className="shrink-0"
										>
											{isClosing ? <Loader2Icon className="animate-spin" /> : <ArrowDownToLineIcon />}
											{/* No ellipsis: the spinner says it's under way (like Security's "Locking") */}
											<StableLabel options={['Close', 'Closing']} value={isClosing ? 1 : 0} />
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
};
