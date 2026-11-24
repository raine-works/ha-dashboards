/**
 * Labels in the entity registry: whether a house uses one at all.
 *
 * @module
 */
import type { HomeAssistant } from '../types/homeassistant';

// The labels the entity registry uses, worked out once per registry (Home Assistant replaces the
// object when the registry changes)
const labelsInUse = new WeakMap<object, Set<string>>();

/**
 * Whether any entity in the registry carries `label`: a label that picks what the dashboards list
 * (Household Speaker, Household TV) takes over from discovery only once a house uses it.
 */
export function labelInUse(entities: HomeAssistant['entities'] | null | undefined, label: string): boolean {
	if (!entities) return false;
	let used = labelsInUse.get(entities);
	if (!used) {
		used = new Set(Object.values(entities).flatMap((e) => e.labels ?? []));
		labelsInUse.set(entities, used);
	}
	return used.has(label);
}
