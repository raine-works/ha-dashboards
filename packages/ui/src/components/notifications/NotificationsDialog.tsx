/**
 * Home Assistant's persistent notifications: the live list and the dialog to dismiss them.
 *
 * @module
 */

import { BellOff, Trash2, X } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassConnection } from '../../context/HassContext';
import { useNow } from '../../hooks/useNow';
import {
	applyNotificationsEvent,
	type NotificationsEvent,
	type PersistentNotification,
	sortNotifications,
	toPlainText,
} from '../../lib/notifications';
import { formatAgo } from '../../lib/people';
import { serviceErrorMessage } from '../../lib/service-calls';
import { HolidayPeek } from '../holiday/HolidayEgg';
import {
	Button,
	ConfirmButton,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
	SwipeRow,
	type SwipeRowAction,
	toast,
} from '../ui';

// A dismissed notification stays hidden this long if Home Assistant hasn't reported it gone
const PENDING_MS = 10_000;
// With none left, "You're all caught up" shows this long before the dialog closes itself
const EMPTY_CLOSE_MS = 500;

/** What `useNotifications` returns: the notifications shown, and the ways to dismiss them. */
export interface Notifications {
	/** Newest first, without the ones just dismissed. */
	notifications: PersistentNotification[];
	/** Home Assistant has reported none left (not just the ones dismissed hidden while it catches up). */
	cleared: boolean;
	/** Hide one at once and dismiss it; a failure shows it again with a toast. */
	dismiss: (id: string) => void;
	/** Hide them all at once and dismiss them; a failure shows them again with a toast. */
	dismissAll: () => void;
}

/**
 * Home Assistant's persistent notifications, live (`persistent_notification/subscribe` pushes every
 * change). Dismissing hides a notification at once, until Home Assistant reports it removed.
 */
export function useNotifications(): Notifications {
	const connection = useHassConnection();
	const { callService } = useHassApi();
	const [all, setAll] = useState<Record<string, PersistentNotification>>({});
	const [loaded, setLoaded] = useState(false);
	const [hidden, setHidden] = useState<string[]>([]);

	useEffect(() => {
		setAll({});
		setLoaded(false);
		if (!connection?.subscribeMessage) return;
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		connection
			.subscribeMessage<NotificationsEvent>(
				(event) => {
					if (cancelled) return;
					setAll((current) => applyNotificationsEvent(current, event));
					setLoaded(true);
				},
				{ type: 'persistent_notification/subscribe' },
			)
			.then((unsub) => {
				if (cancelled) unsub();
				else unsubscribe = unsub;
			})
			.catch(() => {});
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [connection]);

	// Optimistic hiding lasts until Home Assistant reports the removal (or gives up)
	useEffect(() => {
		setHidden((current) => {
			const next = current.filter((id) => id in all);
			return next.length === current.length ? current : next;
		});
	}, [all]);
	useEffect(() => {
		if (hidden.length === 0) return;
		const timer = setTimeout(() => setHidden([]), PENDING_MS);
		return () => clearTimeout(timer);
	}, [hidden]);

	return {
		notifications: sortNotifications(all).filter((n) => !hidden.includes(n.notification_id)),
		cleared: loaded && Object.keys(all).length === 0,
		// A failed dismiss shows its notification again, with Home Assistant's reason
		dismiss: (id) => {
			setHidden((current) => [...current, id]);
			callService('persistent_notification', 'dismiss', { notification_id: id }, { errors: 'throw' }).catch((err) => {
				setHidden((current) => current.filter((h) => h !== id));
				toast.error("Couldn't dismiss the notification", { description: serviceErrorMessage(err) });
			});
		},
		dismissAll: () => {
			setHidden(Object.keys(all));
			callService('persistent_notification', 'dismiss_all', {}, { errors: 'throw' }).catch((err) => {
				setHidden([]);
				toast.error("Couldn't dismiss the notifications", { description: serviceErrorMessage(err) });
			});
		},
	};
}

/** The notifications dialog's props: `useNotifications`' result, whether it's open and what closes it. */
export interface NotificationsDialogProps extends Notifications {
	isOpen: boolean;
	onClose: () => void;
}

/**
 * Home Assistant's notifications, newest first: dismiss them one at a time (swipe either way, or its X),
 * or all at once (two taps). With none left it closes itself after a moment.
 */
export const NotificationsDialog: React.FC<NotificationsDialogProps> = ({
	isOpen,
	onClose,
	notifications,
	cleared,
	dismiss,
	dismissAll,
}) => {
	const now = useNow(isOpen, 30_000);

	const count = notifications.length;
	// Nothing left to dismiss: once Home Assistant reports none (never on a dismiss still on its way, or
	// before the first list arrives), close after the empty state has shown
	useEffect(() => {
		if (!isOpen || !cleared) return;
		const timer = setTimeout(onClose, EMPTY_CLOSE_MS);
		return () => clearTimeout(timer);
	}, [isOpen, cleared, onClose]);
	// Swiped either way, like a phone's own notifications
	const dismissAction = (id: string): SwipeRowAction => ({
		label: 'Dismiss',
		icon: <BellOff />,
		tone: 'destructive',
		onAction: () => dismiss(id),
	});

	return (
		<Dialog open={isOpen} onOpenChange={(value) => !value && onClose()}>
			<DialogContent size="workspace">
				<DialogHeader>
					<DialogTitle>Notifications</DialogTitle>
					<DialogDescription className="short:hidden">
						{count === 0 ? 'Nothing new' : `${count} from Home Assistant`}
					</DialogDescription>
				</DialogHeader>

				{count === 0 ? (
					<EmptyState icon={<HolidayPeek className="size-10" fallback={<BellOff className="size-10" />} />}>
						You're all caught up.
					</EmptyState>
				) : (
					<>
						<ul className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1">
							{notifications.map((n) => (
								<SwipeRow
									key={n.notification_id}
									start={dismissAction(n.notification_id)}
									end={dismissAction(n.notification_id)}
									className="shrink-0"
									contentClassName="flex items-start gap-2 rounded-lg border bg-card py-2 pr-1.5 pl-3"
								>
									<div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
										<div className="flex items-baseline gap-2">
											<span className="wrap-break-word min-w-0 flex-1 font-medium">
												{n.title ? toPlainText(n.title) : 'Notification'}
											</span>
											<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
												{formatAgo(n.created_at, now)}
											</span>
										</div>
										<p className="wrap-break-word whitespace-pre-line text-muted-foreground text-sm">
											{toPlainText(n.message)}
										</p>
									</div>
									<Button
										variant="ghost"
										size="icon-lg"
										onClick={() => dismiss(n.notification_id)}
										aria-label={`Dismiss ${n.title || 'notification'}`}
										title="Dismiss"
										className="shrink-0"
									>
										<X />
									</Button>
								</SwipeRow>
							))}
						</ul>
						{/* On phones, across the dialog's full width like every dialog's bottom buttons */}
						<div className="mt-auto flex shrink-0 justify-end max-sm:*:flex-1">
							<ConfirmButton
								size="xl"
								icon={<Trash2 />}
								label="Dismiss all"
								confirmLabel="Tap to dismiss all"
								onConfirm={dismissAll}
							/>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
};
