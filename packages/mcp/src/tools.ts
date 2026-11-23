/**
 * The setup tools: what an assistant needs to check a Home Assistant for the dashboards and set
 * them up. Each connects with HA_URL / HA_TOKEN (an administrator's long-lived token: the
 * registries and dashboards need one), does one job and says what it found or did. The connection
 * is injected so the tests can run them on a made-up house.
 */

import type { HomeAssistantConnection } from '@app/ha-client';
import { type HouseSnapshot, readSnapshot } from '@app/ha-client/snapshot';
import { mergeHouseSources, parseHouseConfig } from '@app/ui/lib/house-config';
import { HOUSEHOLD_LIGHT_LABEL } from '@app/ui/lib/lights';
import { type ModuleHass, moduleReport } from '@app/ui/lib/modules';
import type { Tool } from './server';

/** Opens a connection to Home Assistant for one tool call (closed when the call ends). */
export type Connect = () => Promise<HomeAssistantConnection>;

const DOMAIN = 'raineworks_dashboards';
const json = (value: unknown) => JSON.stringify(value, null, 2);

async function withHass<T>(connect: Connect, work: (ha: HomeAssistantConnection) => Promise<T>): Promise<T> {
	const ha = await connect();
	try {
		return await work(ha);
	} finally {
		ha.close();
	}
}

const yamlOf = (yaml: unknown) => (typeof yaml === 'string' && yaml.trim() ? Bun.YAML.parse(yaml) : undefined);

/** The integration's house settings (its options), which a card's `house` option overrides key by key. */
async function integrationHouse(ha: HomeAssistantConnection): Promise<unknown> {
	const info = await ha.call<{ house?: unknown }>({ type: `${DOMAIN}/info` }).catch(() => undefined);
	return info?.house;
}

/** Lights people switch (not hidden), without the Household Light label, with where they are. */
export function unlabeledLights(snapshot: HouseSnapshot) {
	return Object.values(snapshot.entities)
		.filter((e) => {
			const id = String(e.entity_id);
			return id.startsWith('light.') && !e.hidden && !((e.labels as string[]) ?? []).includes(HOUSEHOLD_LIGHT_LABEL);
		})
		.map((e) => {
			const device = e.device_id ? snapshot.devices[String(e.device_id)] : undefined;
			const areaId = (e.area_id ?? device?.area_id ?? null) as string | null;
			const area = areaId ? snapshot.areas[areaId] : undefined;
			const name = String(snapshot.states[String(e.entity_id)]?.attributes.friendly_name ?? e.name ?? e.entity_id);
			return {
				entity_id: String(e.entity_id),
				name,
				area: (area?.name as string) ?? null,
				floor: (area?.floor_id as string) ?? null,
				device: (device?.name_by_user ?? device?.name ?? null) as string | null,
				model: (device?.model ?? null) as string | null,
				// Indicators and status LEDs are lights too, but not room lights
				looks_like_an_indicator: /\b(led|indicator|status|night ?light|backlight)\b/i.test(
					`${name} ${device?.model ?? ''}`,
				),
			};
		})
		.sort((a, b) => `${a.area ?? '~'} ${a.name}`.localeCompare(`${b.area ?? '~'} ${b.name}`));
}

/** Which keys of a `house` setting the dashboards understood (a wrong shape is quietly ignored). */
export function checkHouse(yaml: string) {
	const raw = (Bun.YAML.parse(yaml) ?? {}) as Record<string, unknown>;
	if (typeof raw !== 'object' || Array.isArray(raw)) return { understood: [], ignored: ['(not a mapping)'] };
	const house = parseHouseConfig(raw);
	const count = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);
	const used: Record<string, boolean> = {
		announce_speaker: !!house.announceSpeaker,
		weather: !!house.weather,
		alarm_panel: !!house.alarmPanel,
		thermostats: (house.thermostats?.length ?? 0) === count(raw.thermostats) && count(raw.thermostats) > 0,
		laundry: !!(house.laundry.washer || house.laundry.dryer),
		guest_wifi_qr: !!house.guestWifiQr,
		live_inputs: house.liveInputs.length === count(raw.live_inputs) && count(raw.live_inputs) > 0,
		tts: !!(house.tts.engine || house.tts.voice),
		birthday_calendar: !!house.birthdayCalendar,
		bedtime_routines: Object.keys(house.bedtimeRoutines).length === count(raw.bedtime_routines),
		modules: Object.keys(house.modules).length === count(raw.modules),
	};
	const keys = Object.keys(raw).filter((k) => raw[k] != null);
	return { understood: keys.filter((k) => used[k]), ignored: keys.filter((k) => !used[k]) };
}

/** A dashboard's whole config: one panel view hosting the card. */
export function dashboardConfig(card: Record<string, unknown>) {
	return { views: [{ title: 'Home', path: 'home', panel: true, cards: [card] }] };
}

/**
 * The server's tools, each connecting with `connect` when it runs. Those that change Home
 * Assistant are marked `writes`; a failure throws, for the assistant to see.
 */
export function setupTools(connect: Connect): Tool[] {
	return [
		{
			name: 'integration_status',
			description:
				'Whether the Raineworks Dashboards integration is installed and set up on this Home Assistant, its version, the household it found, and which dashboards use its cards. Start here.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: () =>
				withHass(connect, async (ha) => {
					const entries = await ha.call<{ entry_id: string; state: string }[]>({
						type: 'config_entries/get',
						domain: DOMAIN,
					});
					const info = entries.some((e) => e.state === 'loaded')
						? await ha.call<Record<string, unknown>>({ type: `${DOMAIN}/info` }).catch(() => null)
						: null;
					const dashboards = await ha.call<{ url_path: string; title: string; mode: string }[]>({
						type: 'lovelace/dashboards/list',
					});
					return json({
						installed: entries.length > 0,
						state: entries[0]?.state ?? 'not set up',
						version: info?.version ?? null,
						household: info?.household ?? null,
						dashboards: dashboards.map((d) => ({ url_path: d.url_path, title: d.title, mode: d.mode })),
						next: entries.length
							? undefined
							: 'Install "Raineworks Dashboards" from the Home Assistant Marketplace (Settings → Marketplace; custom repository https://github.com/raine-works/ha-dashboards), restart, then add the integration.',
					});
				}),
		},
		{
			name: 'capability_report',
			description:
				"Which dashboard features (modules) this Home Assistant has, which are missing and what each missing one needs, and which the house settings turn off. Uses the integration's house settings; pass house_yaml to add a card's own (they win key by key).",
			inputSchema: {
				type: 'object',
				properties: { house_yaml: { type: 'string', description: "A card's `house` settings, as YAML" } },
				additionalProperties: false,
			},
			run: (args) =>
				withHass(connect, async (ha) => {
					const [snapshot, fromIntegration] = await Promise.all([readSnapshot(ha), integrationHouse(ha)]);
					// What the dashboards see: the integration's settings under the card's
					const house = parseHouseConfig(mergeHouseSources(fromIntegration, yamlOf(args.house_yaml)));
					const rows = moduleReport({ hass: snapshot as unknown as ModuleHass, house });
					return json({
						on: rows.filter((r) => r.state === 'on').map((r) => r.name),
						missing: rows.filter((r) => r.state === 'missing').map((r) => ({ module: r.name, needs: r.needs })),
						off: rows.filter((r) => r.state === 'off').map((r) => r.name),
					});
				}),
		},
		{
			name: 'list_floors',
			description:
				"The floors and their areas, for a wall panel's `floor` option and for checking every room's lights are in an area on a floor.",
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: () =>
				withHass(connect, async (ha) => {
					const snapshot = await readSnapshot(ha);
					const areas = Object.values(snapshot.areas);
					return json({
						floors: Object.values(snapshot.floors).map((f) => ({
							floor_id: f.floor_id,
							name: f.name,
							level: f.level ?? null,
							areas: areas.filter((a) => a.floor_id === f.floor_id).map((a) => a.name),
						})),
						areas_without_a_floor: areas.filter((a) => !a.floor_id).map((a) => a.name),
					});
				}),
		},
		{
			name: 'find_unlabeled_lights',
			description:
				'Lights without the "Household Light" label, which the lighting section lists by floor and room. Room lights (lamps, ceiling lights, light switches) should get it; indicators, status LEDs and panel lights should not (looks_like_an_indicator flags likely ones). Ask the user before labeling.',
			inputSchema: { type: 'object', properties: {}, additionalProperties: false },
			run: () => withHass(connect, async (ha) => json(unlabeledLights(await readSnapshot(ha)))),
		},
		{
			name: 'label_household_lights',
			description:
				'Gives these lights the "Household Light" label (creating the label if needed), so the dashboards list them. Changes Home Assistant: confirm the list with the user first.',
			writes: true,
			inputSchema: {
				type: 'object',
				properties: { entity_ids: { type: 'array', items: { type: 'string' }, description: 'light.* entity ids' } },
				required: ['entity_ids'],
				additionalProperties: false,
			},
			run: (args) =>
				withHass(connect, async (ha) => {
					const ids = (args.entity_ids as unknown[]).filter((id): id is string => typeof id === 'string');
					if (!ids.length || ids.some((id) => !id.startsWith('light.')))
						throw new Error('entity_ids must be light.* entity ids');
					const labels = await ha.call<{ label_id: string }[]>({ type: 'config/label_registry/list' });
					if (!labels.some((l) => l.label_id === HOUSEHOLD_LIGHT_LABEL))
						await ha.call({ type: 'config/label_registry/create', name: 'Household Light', icon: 'mdi:lightbulb' });
					const labeled: string[] = [];
					for (const id of ids) {
						const entry = await ha.call<{ labels?: string[] }>({ type: 'config/entity_registry/get', entity_id: id });
						const current = entry.labels ?? [];
						if (!current.includes(HOUSEHOLD_LIGHT_LABEL)) {
							await ha.call({
								type: 'config/entity_registry/update',
								entity_id: id,
								labels: [...current, HOUSEHOLD_LIGHT_LABEL],
							});
							labeled.push(id);
						}
					}
					return json({ labeled, already_labeled: ids.filter((id) => !labeled.includes(id)) });
				}),
		},
		{
			name: 'create_dashboard',
			description:
				'Creates a dashboard hosting one of the cards: "home" (desktops and phones) or "wall_panel" (a wall tablet, with its name, floor and optional timer). Changes Home Assistant: confirm with the user first.',
			writes: true,
			inputSchema: {
				type: 'object',
				properties: {
					title: { type: 'string', description: 'Its name in the sidebar' },
					url_path: { type: 'string', description: 'Its URL, with a hyphen (dashboard-kitchen)' },
					card: { type: 'string', enum: ['home', 'wall_panel'] },
					name: { type: 'string', description: 'wall_panel: the panel\'s name ("Kitchen wall panel")' },
					floor: { type: 'string', description: 'wall_panel: a floor_id from list_floors' },
					timer: { type: 'boolean', description: 'wall_panel: a countdown timer in the header' },
				},
				required: ['title', 'url_path', 'card'],
				additionalProperties: false,
			},
			run: (args) =>
				withHass(connect, async (ha) => {
					const urlPath = String(args.url_path);
					if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(urlPath))
						throw new Error('url_path must be lowercase words joined by hyphens, with at least one hyphen');
					const card: Record<string, unknown> =
						args.card === 'wall_panel'
							? {
									type: 'custom:wall-panel-dashboard',
									...(args.name ? { name: String(args.name) } : {}),
									...(args.floor ? { floor: String(args.floor) } : {}),
									...(args.timer ? { timer: true } : {}),
								}
							: { type: 'custom:home-dashboard' };
					await ha.call({
						type: 'lovelace/dashboards/create',
						url_path: urlPath,
						title: String(args.title),
						mode: 'storage',
						icon: args.card === 'wall_panel' ? 'mdi:tablet' : 'mdi:home',
						show_in_sidebar: true,
						require_admin: false,
					});
					await ha.call({ type: 'lovelace/config/save', url_path: urlPath, config: dashboardConfig(card) });
					return json({
						created: `/${urlPath}/home`,
						card,
						next:
							args.card === 'wall_panel'
								? "Point the tablet at this dashboard, then add it on the integration's page (Add wall panel) for its status light and wake."
								: undefined,
					});
				}),
		},
		{
			name: 'check_house_settings',
			description:
				"Which keys of a card's `house` settings (YAML) the dashboards understood. A value of the wrong shape is ignored without an error, so check settings this way before relying on them.",
			inputSchema: {
				type: 'object',
				properties: { yaml: { type: 'string', description: 'The house settings, as YAML' } },
				required: ['yaml'],
				additionalProperties: false,
			},
			run: async (args) => json(checkHouse(String(args.yaml))),
		},
	];
}
