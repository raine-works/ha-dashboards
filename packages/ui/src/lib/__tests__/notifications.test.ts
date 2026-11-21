import { describe, expect, it } from 'bun:test';
import { applyNotificationsEvent, type PersistentNotification, sortNotifications, toPlainText } from '../notifications';

const note = (id: string, created_at: string, title = id): PersistentNotification => ({
	notification_id: id,
	title,
	message: `${id} message`,
	created_at,
});

describe('applyNotificationsEvent', () => {
	const a = note('a', '2026-10-20T10:00:00Z');
	const b = note('b', '2026-10-20T11:00:00Z');

	it('replaces everything on current', () => {
		expect(applyNotificationsEvent({ a }, { type: 'current', notifications: { b } })).toEqual({ b });
	});

	it('adds and updates by id', () => {
		const updated = { ...a, message: 'changed' };
		expect(applyNotificationsEvent({ a }, { type: 'added', notifications: { b } })).toEqual({ a, b });
		expect(applyNotificationsEvent({ a, b }, { type: 'updated', notifications: { a: updated } })).toEqual({
			a: updated,
			b,
		});
	});

	it('removes by id, leaving the input untouched', () => {
		const current = { a, b };
		expect(applyNotificationsEvent(current, { type: 'removed', notifications: { a } })).toEqual({ b });
		expect(current).toEqual({ a, b });
	});
});

describe('sortNotifications', () => {
	it('puts the newest first', () => {
		const older = note('older', '2026-10-19T08:00:00Z');
		const newer = note('newer', '2026-10-20T08:00:00Z');
		expect(sortNotifications({ older, newer }).map((n) => n.notification_id)).toEqual(['newer', 'older']);
	});
});

describe('toPlainText', () => {
	it('keeps link text and drops Markdown marks', () => {
		expect(toPlainText('New devices found. [Check it out](/config/integrations/dashboard).')).toBe(
			'New devices found. Check it out.',
		);
		expect(toPlainText('The **Washer** is _done_ in `laundry`')).toBe('The Washer is done in laundry');
		expect(toPlainText('## Heading\nBody')).toBe('Heading\nBody');
		expect(toPlainText('See <https://example.com>')).toBe('See https://example.com');
	});

	it('leaves snake_case names and lone asterisks alone', () => {
		expect(toPlainText('sensor.litter_robot_waste_drawer at 5 * 2')).toBe('sensor.litter_robot_waste_drawer at 5 * 2');
		expect(toPlainText('2 * 3 * 4 and 2 ** 3 ** 4')).toBe('2 * 3 * 4 and 2 ** 3 ** 4');
		expect(toPlainText('*really* and _done_')).toBe('really and done');
	});

	it('keeps paragraphs, collapsing extra blank lines', () => {
		expect(toPlainText('One\n\n\n\nTwo\nThree')).toBe('One\n\nTwo\nThree');
	});
});
