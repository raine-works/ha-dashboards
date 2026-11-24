/**
 * Home Assistant's persistent notifications (the bell in HA's sidebar), streamed over
 * `persistent_notification/subscribe`: a `current` event with every notification, then `added`,
 * `updated` and `removed` events with the ones that changed.
 *
 * @module
 */

/** A persistent notification, as Home Assistant sends it. */
export interface PersistentNotification {
	/** Its id (dismissing it takes this). */
	notification_id: string;
	/** Its title, if it has one. */
	title?: string | null;
	/** Its Markdown body. */
	message: string;
	/** When it was created (ISO). */
	created_at: string;
}

/** An event of `persistent_notification/subscribe`. */
export interface NotificationsEvent {
	/** `current`: every notification; the others: the ones added, updated or removed. */
	type: 'current' | 'added' | 'updated' | 'removed';
	/** The notifications it's about, by id. */
	notifications: Record<string, PersistentNotification>;
}

/** The notifications after an event (a new object when anything changed). */
export function applyNotificationsEvent(
	current: Record<string, PersistentNotification>,
	event: NotificationsEvent,
): Record<string, PersistentNotification> {
	if (event.type === 'current') return { ...event.notifications };
	if (event.type === 'removed') {
		const next = { ...current };
		for (const id of Object.keys(event.notifications)) delete next[id];
		return next;
	}
	return { ...current, ...event.notifications };
}

/** Newest first. */
export function sortNotifications(notifications: Record<string, PersistentNotification>): PersistentNotification[] {
	return Object.values(notifications).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/**
 * A notification's Markdown as plain text: links keep their text (the panels never navigate away
 * from the dashboard), emphasis, code and heading marks go, line breaks stay.
 */
export function toPlainText(markdown: string): string {
	return (
		markdown
			.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
			.replace(/<([a-z]+:[^>\s]+)>/gi, '$1')
			// Marks hug their text, as in parseInline(): "2 * 3 * 4" is arithmetic, not emphasis
			.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
			.replace(/(^|[^*\w])([*_])(?=[^\s*_])([^*_\n]+?)(?<=\S)\2(?=[^*\w]|$)/g, '$1$3')
			.replace(/`([^`]+)`/g, '$1')
			.replace(/^#{1,6}\s+/gm, '')
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	);
}
