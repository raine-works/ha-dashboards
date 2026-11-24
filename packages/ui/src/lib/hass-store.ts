/**
 * The hass store the cards keep their `hass` in, and what selectors need to read from it cheaply:
 * which entities an update changed, whether that touches a selector, and structural equality.
 *
 * @module
 */
import type { HassEntity, HomeAssistant } from '../types/homeassistant';

/**
 * The latest `hass` object, outside the component tree. Home Assistant hands the card a new one
 * on every state change in the house (several a second: CPU, power and audio level sensors), so
 * components subscribe to the parts they show (`useHassSelector`) instead of all re-rendering.
 */
export interface HassStore {
	/** The latest hass, or null before the first. */
	get(): HomeAssistant | null;
	/** Store a new hass and tell every subscriber (nothing when it's the same object). */
	set(hass: HomeAssistant | null): void;
	/** Entity ids whose state the last `set` changed, or null when anything may have (registries, first hass). */
	changed(): ReadonlySet<string> | null;
	/** Call `listener` after every `set`; returns the function that stops it. */
	subscribe(listener: () => void): () => void;
}

/** A new store holding `initial`. A subscriber that throws is logged, and the rest still hear. */
export function createHassStore(initial: HomeAssistant | null = null): HassStore {
	let current = initial;
	let changed: ReadonlySet<string> | null = null;
	const listeners = new Set<() => void>();
	return {
		get: () => current,
		set(hass) {
			if (hass === current) return;
			changed = changedEntities(current, hass);
			current = hass;
			// One subscriber that throws mustn't keep the update from the ones after it
			for (const listener of listeners) {
				try {
					listener();
				} catch (error) {
					console.error('Hass store subscriber failed', error);
				}
			}
		},
		changed: () => changed,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

// Everything but `states`: a change to any of these may affect any selector
const HASS_FIELDS = [
	'entities',
	'devices',
	'areas',
	'floors',
	'config',
	'themes',
	'selectedTheme',
	'services',
	'user',
] as const;

/**
 * The entity ids whose state object differs between two hass objects (Home Assistant replaces only
 * the changed ones), or null when something else changed too.
 */
export function changedEntities(prev: HomeAssistant | null, next: HomeAssistant | null): Set<string> | null {
	if (!prev || !next) return null;
	if (HASS_FIELDS.some((field) => prev[field] !== next[field])) return null;
	if (prev.connection !== next.connection || prev.callWS !== next.callWS) return null;
	const changed = new Set<string>();
	if (prev.states === next.states) return changed;
	let kept = 0;
	for (const id in next.states) {
		const before = prev.states[id];
		if (before === undefined) changed.add(id);
		else {
			kept++;
			if (before !== next.states[id]) changed.add(id);
		}
	}
	// Removed entities
	if (kept !== Object.keys(prev.states).length) {
		for (const id in prev.states) if (!(id in next.states)) changed.add(id);
	}
	return changed;
}

/** Which entities a selector reads: domains (`['light', 'switch']`) or a test on the entity id. */
export type EntityWatch = readonly string[] | ((entityId: string) => boolean);

/** Whether an update that changed `changed` (null: anything) can affect a selector watching `watch`. */
export function touches(changed: ReadonlySet<string> | null, watch: EntityWatch | undefined): boolean {
	if (!changed || !watch) return true;
	for (const id of changed) {
		if (typeof watch === 'function' ? watch(id) : watch.includes(id.slice(0, id.indexOf('.')))) return true;
	}
	return false;
}

/**
 * Structural equality for what selectors return: plain objects, arrays, primitives, Dates and
 * Sets/Maps by identity. Home Assistant keeps an unchanged entity's state object across updates,
 * so most comparisons end at the identity check.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
		return true;
	}
	if (Array.isArray(b)) return false;
	if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && +a === +b;
	if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
	if (Object.getPrototypeOf(a) !== Object.prototype && Object.getPrototypeOf(a) !== null) return false;
	const aKeys = Object.keys(a);
	if (aKeys.length !== Object.keys(b).length) return false;
	for (const key of aKeys) {
		if (!Object.hasOwn(b, key)) return false;
		if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
	}
	return true;
}

/** The states whose entity id passes `test` (a selector's slice of `hass.states`). */
export function pickStates(
	states: Record<string, HassEntity> | undefined,
	test: (entityId: string) => boolean,
): Record<string, HassEntity> {
	const picked: Record<string, HassEntity> = {};
	for (const id in states) if (test(id)) picked[id] = states[id];
	return picked;
}

/**
 * Resolves true once `test` holds for the store's hass (checked now and on each update), or false
 * after `timeoutMs`: for keeping an action's busy state until Home Assistant reports its effect.
 */
export function waitForHass(
	store: HassStore,
	test: (hass: HomeAssistant) => boolean,
	timeoutMs: number,
): Promise<boolean> {
	return new Promise((resolve) => {
		const check = () => {
			const hass = store.get();
			return !!hass && test(hass);
		};
		if (check()) return resolve(true);
		const finish = (result: boolean) => {
			clearTimeout(timer);
			unsubscribe();
			resolve(result);
		};
		const timer = setTimeout(() => finish(false), timeoutMs);
		const unsubscribe = store.subscribe(() => check() && finish(true));
	});
}
