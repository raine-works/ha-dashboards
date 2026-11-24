/**
 * To-do hooks: the lists, a list's items live, and a household member's own counts.
 *
 * @module
 */

import { useEffect, useState } from 'preact/compat';
import { useHassConnection, useHassSelector } from '../../context/HassContext';
import { householdPerson } from '../../lib/people';
import { countMine, discoverTodoLists, hasAssignment, type TodoItem, type TodoList } from '../../lib/todo';
import type { HomeAssistant } from '../../types/homeassistant';

/** Every to-do list with its open count, live (discovered, so a new list appears on its own). */
export function useTodoLists(): TodoList[] {
	return useHassSelector((hass) => discoverTodoLists(hass?.states ?? {}), { watch: ['todo'] });
}

/**
 * A list's items, live (`todo/item/subscribe` pushes every change) while `enabled`. `failed` when
 * Home Assistant refused the subscription (an empty list would read as "Nothing left"); `retry`
 * subscribes again.
 */
export function useTodoItems(entityId: string | undefined, enabled: boolean) {
	const connection = useHassConnection();
	const [items, setItems] = useState<TodoItem[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);

	// `attempt` subscribes again on retry
	useEffect(() => {
		setItems([]);
		setLoaded(false);
		setFailed(false);
		if (!enabled || !entityId || !connection?.subscribeMessage) return;
		let cancelled = false;
		let unsubscribe: (() => void) | undefined;
		connection
			.subscribeMessage<{ items?: TodoItem[] }>(
				(event) => {
					if (cancelled) return;
					setItems(event.items ?? []);
					setLoaded(true);
				},
				{ type: 'todo/item/subscribe', entity_id: entityId },
			)
			.then((unsub) => {
				if (cancelled) unsub();
				else unsubscribe = unsub;
			})
			.catch((error) => {
				if (cancelled) return;
				console.error(`Couldn't subscribe to ${entityId}'s items:`, error);
				setFailed(true);
			});
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [enabled, entityId, connection, attempt]);

	const retry = () => setAttempt((n) => n + 1);
	return { items, loaded, failed, retry };
}

// Module level: the React Compiler can't take optional chaining in a selector inside the hook
function memberNames(hass: HomeAssistant | null): { name: string; shortName: string } | null {
	const person = hass ? householdPerson(hass.states, hass.user?.id) : undefined;
	const name = String(person?.attributes.friendly_name ?? '').trim();
	return name ? { name, shortName: name.split(/\s+/)[0] } : null;
}

/** The signed-in household member's names (for matching `Assigned to` lines), else null. */
function useHouseholdMember(): { name: string; shortName: string } | null {
	return useHassSelector(memberNames, { watch: (id) => id.startsWith('person.') });
}

/**
 * For the header badge, with a household member signed in: each list with assignment (Chores) →
 * how many of its open items are theirs or anyone's, live over `todo/item/subscribe` (the entity's
 * state counts everyone's). Undefined for anyone else (the wall panels, the admin): the lists'
 * own counts stand. A list not loaded yet is left out, so it counts in full until it is.
 */
export function useMyTodoCounts(lists: TodoList[]): Record<string, number> | undefined {
	const connection = useHassConnection();
	const member = useHouseholdMember();
	const [items, setItems] = useState<Record<string, TodoItem[]>>({});
	const ids = member ? lists.filter(hasAssignment).map((l) => l.entityId) : [];
	const key = ids.join(',');

	useEffect(() => {
		setItems({});
		if (!key || !connection?.subscribeMessage) return;
		let cancelled = false;
		const unsubscribes: (() => void)[] = [];
		for (const entityId of key.split(',')) {
			connection
				.subscribeMessage<{ items?: TodoItem[] }>(
					(event) => {
						if (!cancelled) setItems((current) => ({ ...current, [entityId]: event.items ?? [] }));
					},
					{ type: 'todo/item/subscribe', entity_id: entityId },
				)
				.then((unsub) => {
					if (cancelled) unsub();
					else unsubscribes.push(unsub);
				})
				// The badge then shows the list's whole count
				.catch((error) => console.error(`Couldn't subscribe to ${entityId}'s items:`, error));
		}
		return () => {
			cancelled = true;
			for (const unsub of unsubscribes) unsub();
		};
	}, [key, connection]);

	if (!member) return undefined;
	return Object.fromEntries(
		Object.entries(items)
			.filter(([entityId]) => ids.includes(entityId))
			.map(([entityId, listItems]) => [entityId, countMine(listItems, member)]),
	);
}
