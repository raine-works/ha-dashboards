// A `hass` for the demo house: what the dashboards read (states, registries, services, config, the
// user) and do (callService changes the states the way Home Assistant would, roughly; callWS and
// the connection's subscriptions answer with the demo's data or nothing). Each change makes a new
// hass object with the changed entity's state replaced, as Home Assistant does, and hands it to
// `onChange` (the page sets it on every card).
import type { HassEntity, HomeAssistant } from '@app/ui/types';
import { AREAS, DEMO_DEVICES, DEMO_ENTITIES, DEMO_TODO, demoStates, FLOORS } from './house';

type Data = Record<string, unknown>;

const SERVICES: Record<string, string[]> = {
	light: ['turn_on', 'turn_off', 'toggle'],
	switch: ['turn_on', 'turn_off', 'toggle'],
	lock: ['lock', 'unlock'],
	cover: ['open_cover', 'close_cover', 'stop_cover', 'set_cover_position'],
	climate: ['set_temperature', 'set_hvac_mode'],
	fan: ['turn_on', 'turn_off', 'set_percentage', 'oscillate'],
	todo: ['add_item', 'update_item', 'remove_item'],
	persistent_notification: ['dismiss', 'dismiss_all'],
	scene: ['create', 'turn_on'],
	tts: ['speak'],
};

const ids = (data: Data): string[] => {
	const id = data.entity_id;
	return Array.isArray(id) ? id.map(String) : id ? [String(id)] : [];
};

/** The demo hass, and `set()` for the page to apply a state change from outside (a door opening). */
export function createDemoHass(onChange: (hass: HomeAssistant) => void) {
	let hass: HomeAssistant;
	const now = () => new Date().toISOString();

	const update = (changes: Record<string, (s: HassEntity) => Partial<HassEntity>>) => {
		const states = { ...hass.states };
		for (const [id, change] of Object.entries(changes)) {
			const before = states[id];
			if (!before) continue;
			const next = change(before);
			states[id] = {
				...before,
				...next,
				attributes: { ...before.attributes, ...(next.attributes ?? {}) },
				last_changed: next.state && next.state !== before.state ? now() : before.last_changed,
				last_updated: now(),
			};
		}
		hass = { ...hass, states };
		onChange(hass);
	};

	const each = (data: Data, change: (s: HassEntity) => Partial<HassEntity>) =>
		update(Object.fromEntries(ids(data).map((id) => [id, change])));

	/** What each action does to the demo house. */
	const act = (domain: string, service: string, data: Data) => {
		const on = (s: HassEntity) => (service === 'toggle' ? s.state !== 'on' : service === 'turn_on');
		if (domain === 'light' || domain === 'switch' || (domain === 'fan' && service.startsWith('turn_'))) {
			// All off: by label
			if (data.label_id) {
				const labeled = Object.values(hass.entities ?? {}).filter((e) => e.labels?.includes(String(data.label_id)));
				return each({ entity_id: labeled.map((e) => e.entity_id) }, () => ({ state: 'off' }));
			}
			return each(data, (s) => {
				const lit = on(s);
				const brightness =
					data.brightness_pct != null ? Math.round((Number(data.brightness_pct) / 100) * 255) : s.attributes.brightness;
				return {
					state: lit ? 'on' : 'off',
					attributes: lit ? { brightness: brightness ?? 255, color_mode: s.attributes.color_mode ?? 'brightness' } : {},
				};
			});
		}
		if (domain === 'lock') return each(data, () => ({ state: service === 'lock' ? 'locked' : 'unlocked' }));
		if (domain === 'cover') {
			const position = service === 'open_cover' ? 100 : service === 'close_cover' ? 0 : Number(data.position ?? 0);
			if (service === 'stop_cover') return;
			return each(data, () => ({
				state: position > 0 ? 'open' : 'closed',
				attributes: { current_position: position },
			}));
		}
		if (domain === 'climate')
			return each(data, (s) =>
				service === 'set_hvac_mode'
					? { state: String(data.hvac_mode) }
					: { state: s.state, attributes: Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'entity_id')) },
			);
		if (domain === 'fan') {
			if (service === 'set_percentage')
				return each(data, () => ({
					state: Number(data.percentage) > 0 ? 'on' : 'off',
					attributes: { percentage: Number(data.percentage) },
				}));
			if (service === 'oscillate') return each(data, () => ({ attributes: { oscillating: !!data.oscillating } }));
		}
	};

	/** Answers to subscriptions (the to-do lists' items; nothing else streams in the demo). */
	const subscribeMessage = async <T>(callback: (event: T) => void, message: Data) => {
		if (message.type === 'todo/item/subscribe')
			queueMicrotask(() => callback({ items: DEMO_TODO[String(message.entity_id)] ?? [] } as T));
		if (message.type === 'persistent_notification/subscribe')
			queueMicrotask(() => callback({ type: 'current', notifications: {} } as T));
		return () => {};
	};

	hass = {
		states: demoStates(),
		entities: DEMO_ENTITIES,
		devices: DEMO_DEVICES,
		areas: AREAS,
		floors: FLOORS,
		services: Object.fromEntries(
			Object.entries(SERVICES).map(([domain, list]) => [domain, Object.fromEntries(list.map((s) => [s, {}]))]),
		),
		config: { unit_system: { length: 'mi' }, components: ['assist_pipeline', 'todo', 'calendar', 'weather'] },
		themes: { darkMode: true },
		user: { id: 'demo-user', name: 'Alex Rivera', is_admin: false, is_owner: false },
		callService: async (domain, service, data = {}) => {
			act(domain, service, data);
			return {};
		},
		callWS: async <T>(message: Data) => {
			// A service call with a response (calendars' events, scripts): none in the demo
			if (message.type === 'call_service') {
				act(String(message.domain), String(message.service), (message.service_data as Data) ?? {});
				return { response: {} } as T;
			}
			return [] as T;
		},
		connection: {
			subscribeEvents: async () => () => {},
			subscribeMessage,
			sendMessagePromise: async () => ({}),
			connected: true,
			addEventListener: () => {},
			removeEventListener: () => {},
		},
	} as HomeAssistant;

	return {
		get: () => hass,
		/** Change an entity's state from outside, as a device would (the kitchen window closing). */
		set: (id: string, state: string, attributes: Data = {}) => update({ [id]: () => ({ state, attributes }) }),
	};
}
