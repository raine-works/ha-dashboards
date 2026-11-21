import type React from 'preact/compat';
import { createContext, useContext, useLayoutEffect, useMemo, useReducer, useRef } from 'preact/compat';
import { toast } from '../components/ui/sonner';
import { createHassStore, deepEqual, type EntityWatch, type HassStore, touches, waitForHass } from '../lib/hass-store';
import { describeServiceCall, serviceErrorMessage } from '../lib/service-calls';
import type { HassEntity, HomeAssistant } from '../types/homeassistant';

export interface HassApi {
	store: HassStore;
	/** The latest hass object, for event handlers and effects (reading it doesn't re-render). */
	getHass: () => HomeAssistant | null;
	/**
	 * Call a service on the latest hass. A failure shows a toast ("Couldn't lock Front Entry" with
	 * Home Assistant's reason) and resolves undefined; `errors: 'throw'` rejects instead, without the
	 * toast, for callers that report it themselves (a wrong alarm PIN).
	 */
	callService: (
		domain: string,
		service: string,
		serviceData?: Record<string, unknown>,
		options?: CallServiceOptions,
	) => Promise<unknown>;
	/** Resolves true once `test` holds for Home Assistant's state (false after `timeoutMs`). */
	waitFor: (test: (hass: HomeAssistant) => boolean, timeoutMs?: number) => Promise<boolean>;
}

export interface CallServiceOptions {
	/** `toast` (default): report a failure and resolve undefined. `throw`: reject, for the caller to report. */
	errors?: 'toast' | 'throw';
}

/** How long an action waits for Home Assistant to report its effect, by default. */
export const CONFIRM_TIMEOUT_MS = 10_000;

function createHassApi(store: HassStore): HassApi {
	return {
		store,
		getHass: store.get,
		waitFor: (test, timeoutMs = CONFIRM_TIMEOUT_MS) => waitForHass(store, test, timeoutMs),
		async callService(domain, service, serviceData = {}, { errors = 'toast' } = {}) {
			const hass = store.get();
			if (!hass) {
				if (errors === 'throw') throw new Error('Not connected to Home Assistant');
				return;
			}
			try {
				return await hass.callService(domain, service, serviceData);
			} catch (err: unknown) {
				console.error(`Failed to call service ${domain}.${service}:`, err);
				if (errors === 'throw') throw err;
				const title = describeServiceCall(domain, service, serviceData, store.get()?.states);
				// One toast per action and target: repeated taps on a dead device don't stack up
				toast.error(title, { id: `service:${title}`, description: serviceErrorMessage(err) });
			}
		},
	};
}

const HassContext = createContext<HassApi>(createHassApi(createHassStore()));

/** Provides the store; its value never changes, so a state update re-renders only subscribers. */
export const HassProvider: React.FC<{ store: HassStore; children: React.ReactNode }> = ({ store, children }) => {
	const api = useMemo(() => createHassApi(store), [store]);
	return <HassContext.Provider value={api}>{children}</HassContext.Provider>;
};

/** `callService`, `getHass` and `waitFor`, stable across updates: using them never re-renders. */
export const useHassApi = () => useContext(HassContext);

export interface SelectorOptions<T> {
	/**
	 * The entities the selector reads (domains or an entity id test). An update that changed none
	 * of them skips the selector. Leave it out when the selector reads anything else.
	 */
	watch?: EntityWatch;
	/** When a new selection counts as unchanged (default: structurally equal). */
	isEqual?: (a: T, b: T) => boolean;
}

/**
 * Select what a component shows from hass; it re-renders only when the selection changes
 * (structurally, by default: an equal array or object keeps its previous identity, so memoized
 * children skip too). Selectors run on Home Assistant updates (several a second), so keep them
 * cheap, and pass `watch` when they scan many states.
 */
export function useHassSelector<T>(
	select: (hass: HomeAssistant | null) => T,
	{ watch, isEqual = deepEqual }: SelectorOptions<T> = {},
): T {
	'use no memo';
	const { store } = useContext(HassContext);
	const [, rerender] = useReducer((n: number) => n + 1, 0);
	const latest = useRef<{ select: typeof select; watch?: EntityWatch; isEqual: typeof isEqual; value: T } | null>(null);

	let value = select(store.get());
	if (latest.current && isEqual(latest.current.value, value)) value = latest.current.value;

	useLayoutEffect(() => {
		latest.current = { select, watch, isEqual, value };
	});
	useLayoutEffect(() => {
		const check = (all = false) => {
			const current = latest.current;
			if (!current || (!all && !touches(store.changed(), current.watch))) return;
			if (!current.isEqual(current.select(store.get()), current.value)) rerender(0);
		};
		check(true); // an update between render and subscribing
		return store.subscribe(check);
	}, [store]);

	return value;
}

/** One entity's state; re-renders when Home Assistant replaces it (i.e. when it changes). */
export const useEntity = (entityId: string): HassEntity | undefined =>
	useHassSelector((hass) => hass?.states[entityId], { watch: (id) => id === entityId, isEqual: Object.is });

/** Whether the websocket API (callWS) is available yet. */
export const useHassReady = () => useHassSelector((hass) => !!hass?.callWS, { watch: [] });

/** The websocket connection (changes only on reconnect), for subscriptions in effects. */
export const useHassConnection = () =>
	useHassSelector((hass) => hass?.connection ?? null, { watch: [], isEqual: Object.is });
