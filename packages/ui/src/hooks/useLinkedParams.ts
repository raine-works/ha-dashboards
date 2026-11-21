import { useEffect, useState } from 'preact/compat';

/**
 * Runs `check` now and whenever the page's URL changes without a reload: Home Assistant's in-app
 * navigation (it fires `location-changed` on window; the Companion app navigates to a
 * notification's URL when it's already open) and Back. Returns its cleanup, for an effect.
 */
export function watchLocation(check: () => void): () => void {
	check();
	window.addEventListener('location-changed', check);
	window.addEventListener('popstate', check);
	return () => {
		window.removeEventListener('location-changed', check);
		window.removeEventListener('popstate', check);
	};
}

/**
 * Query parameters a link opens something with (a notification's tap action, e.g.
 * `?todo=todo.chores&item=<uid>`), read on load and on Home Assistant's in-app navigation (the
 * Companion app navigates to a notification's URL when it's already open), then taken off the URL
 * so a reload doesn't open it again. Null until a link names `names[0]`; `clear` once handled.
 */
export function useLinkedParams<K extends string>(names: readonly [K, ...K[]]): [Record<K, string> | null, () => void] {
	const [linked, setLinked] = useState<Record<K, string> | null>(null);

	useEffect(
		() =>
			watchLocation(() => {
				const url = new URL(window.location.href);
				if (!url.searchParams.get(names[0])) return;
				const values = {} as Record<K, string>;
				for (const name of names) {
					values[name] = url.searchParams.get(name) ?? '';
					url.searchParams.delete(name);
				}
				setLinked(values);
				window.history.replaceState(window.history.state, '', url);
			}),
		[],
	);

	return [linked, () => setLinked(null)];
}
