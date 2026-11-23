/**
 * The theme catalog as a hook, for the pickers.
 *
 * @module
 */
import { useSyncExternalStore } from 'preact/compat';
import { subscribeThemeCatalog, type ThemeCatalog, themeCatalog } from './catalog';

/** The themes this person can pick and the house theme, re-rendering when they change. */
export function useThemeCatalog(): ThemeCatalog {
	return useSyncExternalStore(subscribeThemeCatalog, themeCatalog);
}
