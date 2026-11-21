import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	countMine,
	discoverTodoLists,
	dueOf,
	dueServiceData,
	formatDue,
	isShoppingList,
	matchAssignee,
	moveAfter,
	parseAssignee,
	sameDue,
	splitTodoItems,
	summaryList,
	TODO_FEATURE,
	type TodoItem,
	toDueDate,
	todoBadgeCount,
	todoSupports,
	withAssignee,
} from '../todo';

const entity = (entity_id: string, state: string, attributes: Record<string, unknown>): HassEntity =>
	({ entity_id, state, attributes, last_changed: '', last_updated: '' }) as HassEntity;

describe('discoverTodoLists', () => {
	it('lists todo entities by name with their open count and features', () => {
		const lists = discoverTodoLists({
			'todo.shopping_list': entity('todo.shopping_list', '2', {
				friendly_name: 'Shopping list',
				supported_features: 15,
			}),
			'todo.chores': entity('todo.chores', '0', { friendly_name: 'Chores', supported_features: 127 }),
			'todo.broken': entity('todo.broken', 'unavailable', {}),
			'light.kitchen': entity('light.kitchen', 'on', {}),
		});
		expect(lists.map((l) => [l.entityId, l.open])).toEqual([
			['todo.chores', 0],
			['todo.shopping_list', 2],
		]);
		expect(todoSupports(lists[0], TODO_FEATURE.SET_DUE_DATE)).toBe(true);
		expect(todoSupports(lists[1], TODO_FEATURE.SET_DUE_DATE)).toBe(false);
		expect(todoSupports(lists[1], TODO_FEATURE.DELETE)).toBe(true);
	});
});

describe('todoBadgeCount', () => {
	it('counts open items on every list but the shopping lists', () => {
		const list = (entityId: string, name: string, open: number) => ({ entityId, name, open, features: 0 });
		expect(isShoppingList(list('todo.shopping_list', 'Shopping list', 0))).toBe(true);
		expect(isShoppingList(list('todo.groceries', 'Groceries', 0))).toBe(true);
		expect(isShoppingList(list('todo.chores', 'Chores', 0))).toBe(false);
		expect(
			todoBadgeCount([
				list('todo.chores', 'Chores', 3),
				list('todo.shopping_list', 'Shopping list', 5),
				list('todo.yard', 'Yard', 1),
			]),
		).toBe(4);
	});
});

describe('splitTodoItems', () => {
	it('keeps the list order, completed items apart', () => {
		const { open, completed } = splitTodoItems([
			{ uid: 'a', summary: 'Trash', status: 'needs_action' },
			{ uid: 'b', summary: 'Dishes', status: 'completed' },
			{ uid: 'c', summary: 'Laundry', status: 'needs_action' },
		]);
		expect(open.map((i) => i.uid)).toEqual(['a', 'c']);
		expect(completed.map((i) => i.uid)).toEqual(['b']);
	});
});

describe('formatDue', () => {
	const now = new Date(2026, 9, 19, 12, 0);
	it('labels dates relative to today', () => {
		expect(formatDue('2026-10-19', now)).toEqual({ label: 'Today', tone: 'today' });
		expect(formatDue('2026-10-20', now)).toEqual({ label: 'Tomorrow', tone: 'upcoming' });
		expect(formatDue('2026-10-24', now)).toEqual({ label: 'Sat', tone: 'upcoming' });
		expect(formatDue('2026-10-31', now)).toEqual({ label: 'Oct 31', tone: 'upcoming' });
	});

	it('flags overdue dates and times', () => {
		expect(formatDue('2026-10-18', now)).toEqual({ label: 'Overdue · Yesterday', tone: 'overdue' });
		expect(formatDue('2026-10-12', now)).toEqual({ label: 'Overdue · Oct 12', tone: 'overdue' });
		expect(formatDue(new Date(2026, 9, 19, 9).toISOString(), now)).toEqual({
			label: 'Overdue · Today 9:00 AM',
			tone: 'overdue',
		});
		expect(formatDue(new Date(2026, 9, 19, 17).toISOString(), now)).toEqual({ label: 'Today 5:00 PM', tone: 'today' });
	});
});

describe('toDueDate', () => {
	it('formats a local date', () => {
		expect(toDueDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
	});
});

describe('assignees', () => {
	it('reads the assignee line and keeps the rest as the note', () => {
		expect(parseAssignee('Assigned to Robin Pike\nUse the blue bags')).toEqual({
			assignee: 'Robin Pike',
			note: 'Use the blue bags',
		});
		expect(parseAssignee('Use the blue bags\nassigned to: Alex')).toEqual({
			assignee: 'Alex',
			note: 'Use the blue bags',
		});
		expect(parseAssignee('Just a note')).toEqual({ assignee: undefined, note: 'Just a note' });
		expect(parseAssignee(null)).toEqual({ assignee: undefined, note: undefined });
	});

	it('writes the assignee first, or nothing for anyone', () => {
		expect(withAssignee('Use the blue bags', 'Robin')).toBe('Assigned to Robin\nUse the blue bags');
		expect(withAssignee(undefined, 'Robin')).toBe('Assigned to Robin');
		expect(withAssignee('Use the blue bags', undefined)).toBe('Use the blue bags');
		expect(withAssignee(undefined, undefined)).toBeNull();
	});

	it('matches a person by full or first name', () => {
		const people = [
			{ name: 'Robin Pike', shortName: 'Robin' },
			{ name: 'Alex Pike', shortName: 'Alex' },
		];
		expect(matchAssignee('robin pike', people)?.shortName).toBe('Robin');
		expect(matchAssignee('Alex', people)?.shortName).toBe('Alex');
		expect(matchAssignee('Sam', people)).toBeUndefined();
		expect(matchAssignee(undefined, people)).toBeUndefined();
	});
});

describe('due values', () => {
	it("reads an item's due as a local day and time", () => {
		expect(dueOf('2026-10-31')).toEqual({ date: '2026-10-31' });
		const local = new Date(2026, 9, 31, 17, 30);
		expect(dueOf(local.toISOString())).toEqual({ date: '2026-10-31', time: '17:30' });
		expect(dueOf(null)).toBeNull();
		expect(dueOf('not a date')).toBeNull();
	});

	it('builds the service data for a list with or without times', () => {
		expect(dueServiceData({ date: '2026-10-31', time: '17:30' }, true)).toEqual({
			due_datetime: '2026-10-31 17:30:00',
		});
		expect(dueServiceData({ date: '2026-10-31', time: '17:30' }, false)).toEqual({ due_date: '2026-10-31' });
		expect(dueServiceData({ date: '2026-10-31' }, true)).toEqual({ due_date: '2026-10-31' });
		expect(dueServiceData(null, true)).toEqual({ due_date: null });
	});

	it('compares dues', () => {
		expect(sameDue(null, null)).toBe(true);
		expect(sameDue({ date: '2026-10-31' }, { date: '2026-10-31' })).toBe(true);
		expect(sameDue({ date: '2026-10-31' }, { date: '2026-10-31', time: '09:00' })).toBe(false);
	});
});

describe('summaryList', () => {
	it('joins a few, then counts the rest', () => {
		expect(summaryList([])).toBe('');
		expect(summaryList(['Dishes'])).toBe('Dishes');
		expect(summaryList(['Dishes', 'Trash'])).toBe('Dishes and Trash');
		expect(summaryList(['Dishes', 'Laundry', 'Trash'])).toBe('Dishes, Laundry and Trash');
		expect(summaryList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
	});
});

describe('moveAfter', () => {
	it('puts an item right after another, or first', () => {
		expect(moveAfter(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
		expect(moveAfter(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['a', 'd', 'b', 'c']);
		expect(moveAfter(['a', 'b', 'c'], 'c', null)).toEqual(['c', 'a', 'b']);
	});
});

describe('countMine', () => {
	const item = (uid: string, description?: string, status: TodoItem['status'] = 'needs_action'): TodoItem => ({
		uid,
		summary: uid,
		status,
		description,
	});
	it('counts open items for anyone or the person, by full or first name', () => {
		const robin = { name: 'Robin Pike', shortName: 'Robin' };
		const items = [
			item('anyone'),
			item('full', 'Assigned to Robin Pike'),
			item('first', 'Assigned to robin\nBring the bins in'),
			item('kai', 'Assigned to Kai Pike'),
			item('stranger', 'Assigned to Grandma'),
			item('done', undefined, 'completed'),
		];
		expect(countMine(items, robin)).toBe(3);
	});
	it('uses what is known per list in the badge, the list total elsewhere', () => {
		const list = (entityId: string, open: number) => ({ entityId, name: entityId, open, features: 0 });
		const lists = [list('todo.chores', 6), list('todo.school', 2), list('todo.shopping_list', 17)];
		expect(todoBadgeCount(lists)).toBe(8);
		expect(todoBadgeCount(lists, { 'todo.chores': 3 })).toBe(5);
	});
});
