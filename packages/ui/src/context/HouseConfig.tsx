import { useSyncExternalStore } from 'preact/compat';
import { type HouseConfig, houseConfig, subscribeHouseConfig } from '../lib/house-config';

/** The house's settings (lib/house-config.ts), re-rendering when a card's `house` option changes. */
export const useHouseConfig = (): HouseConfig => useSyncExternalStore(subscribeHouseConfig, houseConfig);
