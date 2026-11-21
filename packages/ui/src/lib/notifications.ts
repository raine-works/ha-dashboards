// Home Assistant's persistent notifications (the bell in HA's sidebar), streamed over
// `persistent_notification/subscribe`: a `current` event with every notification, then `added`,
// `updated` and `removed` events with the ones that changed.

export interface PersistentNotification {
	notification_id: string;
	title?: string | null;
	message: string;
	created_at: string;
}

export interface NotificationsEvent {
	type: 'current' | 'added' | 'updated' | 'removed';
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
