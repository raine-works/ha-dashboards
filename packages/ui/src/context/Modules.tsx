/** Gating a feature's UI on its module (lib/modules.ts): `useModule` and `<ModuleGate>`. */

import type React from 'preact/compat';
import { isModuleOn, type ModuleId, type ModuleState, moduleState, moduleWatch } from '../lib/modules';
import { useHassSelector } from './HassContext';
import { useHouseConfig } from './HouseConfig';

/**
 * Whether a module (lib/modules.ts) is on in this house: detected, and not turned off in the house
 * settings (an opt-in one turned on). Re-renders only when that changes.
 */
export function useModule(id: ModuleId): boolean {
	const house = useHouseConfig();
	return useHassSelector((hass) => !!hass && isModuleOn(id, { hass, house }), { watch: moduleWatch(id) });
}

/**
 * A module's state in this house: `on`, `missing` (the house hasn't what it needs) or `off` (turned
 * off in the house settings), for a card that says why it shows nothing. Re-renders only when it changes.
 */
export function useModuleState(id: ModuleId): ModuleState {
	const house = useHouseConfig();
	return useHassSelector((hass) => (hass ? moduleState(id, { hass, house }) : 'missing'), { watch: moduleWatch(id) });
}

/**
 * Its children only while the module is on: how a dashboard leaves out what the house hasn't (or
 * has turned off), without the children's own hooks running at all.
 */
export const ModuleGate: React.FC<{ id: ModuleId; children: React.ReactNode }> = ({ id, children }) =>
	(useModule(id) ? children : null) as React.ReactElement | null;
