import type { HomeAssistantConnection } from './index';

/** What the dashboards see of a Home Assistant, in the frontend's own shapes (`hass`). */
export interface HouseSnapshot {
	states: Record<string, { entity_id: string; state: string; attributes: Record<string, unknown> }>;
	entities: Record<string, Record<string, unknown>>;
	devices: Record<string, Record<string, unknown>>;
	areas: Record<string, Record<string, unknown>>;
	floors: Record<string, Record<string, unknown>>;
	services: Record<string, Record<string, unknown>>;
	config: { components: string[]; version?: string; location_name?: string };
}

type Row = Record<string, unknown>;
const byKey = (rows: Row[], key: string) => Object.fromEntries(rows.map((row) => [String(row[key]), row]));

/**
 * Reads states, the registries (entities, devices, areas, floors), services and config as the
 * frontend has them (the entity registry's `hidden` from `hidden_by`), so lib code written for
 * `hass` runs on it unchanged. Needs an admin's token (the registries' list commands).
 */
export async function readSnapshot(ha: HomeAssistantConnection): Promise<HouseSnapshot> {
	const [states, entities, devices, areas, floors, services, config] = await Promise.all([
		ha.call<Row[]>({ type: 'get_states' }),
		ha.call<Row[]>({ type: 'config/entity_registry/list' }),
		ha.call<Row[]>({ type: 'config/device_registry/list' }),
		ha.call<Row[]>({ type: 'config/area_registry/list' }),
		ha.call<Row[]>({ type: 'config/floor_registry/list' }).catch(() => []),
		ha.call<Record<string, Record<string, unknown>>>({ type: 'get_services' }),
		ha.call<HouseSnapshot['config']>({ type: 'get_config' }),
	]);
	return {
		states: byKey(states, 'entity_id') as HouseSnapshot['states'],
		entities: byKey(
			entities.map((e) => ({
				entity_id: e.entity_id,
				name: e.name ?? e.original_name ?? null,
				area_id: e.area_id ?? null,
				device_id: e.device_id ?? null,
				labels: e.labels ?? [],
				hidden: e.hidden_by != null,
				platform: e.platform,
			})),
			'entity_id',
		),
		devices: byKey(devices, 'id'),
		areas: byKey(areas, 'area_id'),
		floors: byKey(floors, 'floor_id'),
		services,
		config,
	};
}
