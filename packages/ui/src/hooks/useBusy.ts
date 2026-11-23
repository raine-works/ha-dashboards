/** Busy buttons: which actions are in flight, until Home Assistant reports their effect. */

import { useEffect, useRef, useState } from 'preact/compat';

// A busy state never outlives this, whatever the action does
const MAX_BUSY_MS = 20_000;

/** The action's result, or undefined once `ms` pass first (outside the hook: the compiler can't take try/finally). */
function settleWithin<T>(action: () => Promise<T> | T, ms: number): Promise<T | undefined> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		Promise.resolve().then(action),
		new Promise<undefined>((resolve) => {
			timer = setTimeout(() => resolve(undefined), ms);
		}),
	]).finally(() => clearTimeout(timer));
}

/**
 * Actions in flight, by key, so their buttons can show that something is happening (Button
 * `loading`). `run` marks the key busy until the action settles: await the service call and then
 * Home Assistant reporting its effect (`useHassApi().waitFor`), since many devices answer the call
 * long before they change.
 *
 * @returns `run(key, action)`, resolving the action's result, or undefined when it takes longer
 * than 20 seconds (the key stops being busy then, whatever the action does); `isBusy(key)`; and
 * `any`. A rejected action rejects `run`, after the key stops being busy.
 */
export function useBusy() {
	const [busy, setBusy] = useState<ReadonlyMap<string, number>>(() => new Map());
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const update = (key: string, delta: number) => {
		if (!mounted.current) return;
		setBusy((prev) => {
			const next = new Map(prev);
			const count = (next.get(key) ?? 0) + delta;
			if (count > 0) next.set(key, count);
			else next.delete(key);
			return next;
		});
	};

	const run = <T>(key: string, action: () => Promise<T> | T): Promise<T | undefined> => {
		update(key, 1);
		return settleWithin(action, MAX_BUSY_MS).finally(() => update(key, -1));
	};

	return {
		run,
		isBusy: (key: string) => busy.has(key),
		/** Any action in flight. */
		any: busy.size > 0,
	};
}

/** What `useBusy` returns, for components handed a parent's busy state. */
export type Busy = ReturnType<typeof useBusy>;
