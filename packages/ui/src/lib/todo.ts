/**
 * To-do lists: discovery, the header badge's count, due dates as labels and as service data, and
 * assignment to household members (an "Assigned to" line in an item's description).
 *
 * @module
 */
import type { HassEntity } from '../types/homeassistant';
import { nameList } from './text';
import { dayKey, daysBetween, formatTime, pad2 } from './time';

/** `todo` entity supported_features bits. */
export const TODO_FEATURE = {
	CREATE: 1,
	DELETE: 2,
	UPDATE: 4,
	MOVE: 8,
	SET_DUE_DATE: 16,
	SET_DUE_DATETIME: 32,
	SET_DESCRIPTION: 64,
} as const;

/** A `todo.*` list. */
export interface TodoList {
	/** Its entity id. */
	entityId: string;
	/** Its friendly name. */
	name: string;
	/** Items still to do (the entity's state). */
	open: number;
	/** Its `TODO_FEATURE` bits (test with `todoSupports`). */
	features: number;
}

/** A to-do item, as `todo/item/list` gives it. */
export interface TodoItem {
	/** Its id in the list. */
	uid: string;
	/** Its text. */
	summary: string;
	/** Done or not. */
	status: 'needs_action' | 'completed';
	/** `2026-10-20` or an ISO date-time. */
	due?: string | null;
	/** Its description (an "Assigned to" line, then its note). */
	description?: string | null;
}

/** Whether a list supports a `TODO_FEATURE` (never for no list). */
export const todoSupports = (list: TodoList | undefined, feature: number) => !!list && (list.features & feature) !== 0;

/** Every `todo.*` list (Chores, Shopping list, …), by name, with its open count. */
export function discoverTodoLists(states: Record<string, HassEntity>): TodoList[] {
	return Object.values(states)
		.filter((s) => s.entity_id.startsWith('todo.') && s.state !== 'unavailable')
		.map((s) => ({
			entityId: s.entity_id,
			name: (s.attributes.friendly_name as string | undefined) ?? s.entity_id.slice('todo.'.length),
			open: Number.parseInt(s.state, 10) || 0,
			features: (s.attributes.supported_features as number | undefined) ?? 0,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** A shopping list (`todo.shopping_list`, "Groceries"…): things to buy, not tasks. */
export const isShoppingList = (list: Pick<TodoList, 'entityId' | 'name'>) =>
	/shopping|grocer/i.test(`${list.entityId} ${list.name}`);

/**
 * The header badge's count: open items on every list but the shopping lists. `mine` (a household
 * member signed in) replaces a list's count with what's theirs (`countMine()`), where it's known.
 */
export const todoBadgeCount = (lists: TodoList[], mine?: Record<string, number>) =>
	lists.reduce((sum, l) => (isShoppingList(l) ? sum : sum + (mine?.[l.entityId] ?? l.open)), 0);

/** Lists whose items say whom they're for (an `Assigned to` line): the badge counts a member's own there. */
export const hasAssignment = (list: TodoList) =>
	!isShoppingList(list) && todoSupports(list, TODO_FEATURE.SET_DESCRIPTION);

/** Items to do (in the list's own order), then the completed ones. */
export function splitTodoItems(items: TodoItem[]): { open: TodoItem[]; completed: TodoItem[] } {
	return {
		open: items.filter((i) => i.status !== 'completed'),
		completed: items.filter((i) => i.status === 'completed'),
	};
}

function parseDue(due: string): { date: Date; hasTime: boolean } {
	const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
	if (day) return { date: new Date(+day[1], +day[2] - 1, +day[3]), hasTime: false };
	return { date: new Date(due), hasTime: true };
}

/** How urgent a due date is. */
export type DueTone = 'overdue' | 'today' | 'upcoming';

/** A due date as a label and urgency: "Overdue · Oct 17", "Today", "Today 5:00 PM", "Tomorrow", "Sat", "Oct 31". */
export function formatDue(due: string, now = new Date()): { label: string; tone: DueTone } {
	const { date, hasTime } = parseDue(due);
	const days = daysBetween(now, date);
	const time = hasTime ? formatTime(date) : '';
	const overdue = hasTime ? date < now : days < 0;
	const day =
		days === 0
			? 'Today'
			: days === 1
				? 'Tomorrow'
				: days === -1
					? 'Yesterday'
					: days > 1 && days < 7
						? date.toLocaleDateString('en-US', { weekday: 'short' })
						: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const label = time ? `${day} ${time}` : day;
	if (overdue) return { label: `Overdue · ${label}`, tone: 'overdue' };
	return { label, tone: days === 0 ? 'today' : 'upcoming' };
}

/** A date as `todo` services take it: `2026-10-20`, local. */
export const toDueDate = dayKey;

/** A picked due: a local day, with a time of day (`17:30`) for lists that take one. */
export interface Due {
	/** The day, `YYYY-MM-DD`. */
	date: string;
	/** The time of day, `HH:MM` (24-hour). */
	time?: string;
}

/** An item's due (`2026-10-31` or an ISO date-time) as a local day and time. */
export function dueOf(due?: string | null): Due | null {
	if (!due) return null;
	const { date, hasTime } = parseDue(due);
	if (Number.isNaN(date.getTime())) return null;
	return hasTime
		? { date: toDueDate(date), time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}` }
		: { date: toDueDate(date) };
}

/** Whether two dues are the same (both none, the same day, the same time). */
export const sameDue = (a: Due | null, b: Due | null) => a?.date === b?.date && a?.time === b?.time;

/**
 * A due as `todo.add_item` / `update_item` take it: `due_datetime` (local, for lists with
 * SET_DUE_DATETIME), else `due_date` (a time is dropped); `due_date: null` clears it.
 */
export function dueServiceData(due: Due | null, withTime: boolean): Record<string, string | null> {
	if (!due) return { due_date: null };
	return withTime && due.time ? { due_datetime: `${due.date} ${due.time}:00` } : { due_date: due.date };
}

// Assignment -------------------------------------------------------------------------------
// Home Assistant's to-do items have no assignee, so it's a line in the description ("Assigned to
// Alex"), readable (and editable) in Home Assistant's own to-do page too. No line = anyone's task.

const ASSIGNED = /^\s*assigned to:?\s+(.+?)\s*$/i;

/** The assignee's name and the rest of the description (its note). */
export function parseAssignee(description?: string | null): { assignee?: string; note?: string } {
	const lines = (description ?? '').split('\n');
	const index = lines.findIndex((line) => ASSIGNED.test(line));
	const assignee = index >= 0 ? ASSIGNED.exec(lines[index])?.[1] : undefined;
	const note = lines
		.filter((_, i) => i !== index)
		.join('\n')
		.trim();
	return { assignee, note: note || undefined };
}

/** A description with the assignee's line first (none for anyone), or null when it would be empty. */
export function withAssignee(note: string | undefined, assignee: string | undefined): string | null {
	const text = [assignee ? `Assigned to ${assignee}` : '', note?.trim() ?? ''].filter(Boolean).join('\n');
	return text || null;
}

/** The person an assignee name means: full or first name, ignoring case. */
export function matchAssignee<P extends { name: string; shortName: string }>(
	name: string | undefined,
	people: P[],
): P | undefined {
	if (!name) return undefined;
	const wanted = name.trim().toLowerCase();
	return (
		people.find((p) => p.name.toLowerCase() === wanted) ?? people.find((p) => p.shortName.toLowerCase() === wanted)
	);
}

/**
 * A few items' summaries for one line ("Dishes, Laundry and Trash"), the first `max` and then
 * "and 2 more", so a push about several stays short.
 */
export function summaryList(summaries: string[], max = 3): string {
	const shown = summaries.length > max ? summaries.slice(0, max) : summaries;
	const rest = summaries.length - shown.length;
	return rest > 0 ? `${shown.join(', ')} and ${rest} more` : nameList(shown);
}

/**
 * A list's order (uids) with `uid` moved right after `previous` (null: to the top), as Home
 * Assistant's `todo/item/move` does with `previous_uid`.
 */
export function moveAfter(order: string[], uid: string, previous: string | null): string[] {
	const rest = order.filter((u) => u !== uid);
	const at = previous ? rest.indexOf(previous) + 1 : 0;
	return [...rest.slice(0, at), uid, ...rest.slice(at)];
}

/** Open items that are `person`'s: assigned to them (full or first name) or to anyone (no assignee). */
export function countMine(items: TodoItem[], person: { name: string; shortName: string }): number {
	return items.filter((item) => {
		if (item.status === 'completed') return false;
		const { assignee } = parseAssignee(item.description);
		return !assignee || !!matchAssignee(assignee, [person]);
	}).length;
}
