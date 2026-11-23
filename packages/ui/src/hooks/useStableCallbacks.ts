/** Callbacks with a stable identity, so memoized list rows skip re-rendering with their list. */

import { useLayoutEffect, useRef, useState } from 'preact/compat';

// biome-ignore lint/suspicious/noExplicitAny: any callback signature
type Callbacks = Record<string, (...args: any[]) => unknown>;

/**
 * The same callbacks every render, each calling the latest version passed in. For handlers handed to
 * a list's memoized rows (`memo`): a fresh closure per render, as the React Compiler can't keep one
 * inside a `.map`, made every row re-render with the list (a queue drag re-rendered all 50 songs on
 * each pointer move). Call them from events and effects, never during render.
 */
export function useStableCallbacks<T extends Callbacks>(callbacks: T): T {
	const latest = useRef(callbacks);
	useLayoutEffect(() => {
		latest.current = callbacks;
	});
	const [stable] = useState(
		() =>
			Object.fromEntries(
				Object.keys(callbacks).map((name) => [name, (...args: unknown[]) => latest.current[name]?.(...args)]),
			) as T,
	);
	return stable;
}
