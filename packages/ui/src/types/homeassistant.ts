/**
 * The parts of Home Assistant's frontend `hass` object, and the data in it, that the dashboards
 * use. Typed by hand (narrower than the frontend's own types) so the cards don't depend on
 * Home Assistant's frontend source.
 *
 * @module
 */

/** An entity's attributes: the few read everywhere are typed, the rest are `unknown`. */
export interface HassEntityAttributes {
	friendly_name?: string;
	entity_picture?: string;
	brightness?: number;
	temperature?: number | null;
	target_temp_low?: number | null;
	target_temp_high?: number | null;
	current_temperature?: number | null;
	hvac_modes?: string[];
	[key: string]: unknown;
}

/** An entity's state as in `hass.states`; `last_changed` / `last_updated` are ISO timestamps. */
export interface HassEntity {
	entity_id: string;
	state: string;
	attributes: HassEntityAttributes;
	last_changed: string;
	last_updated: string;
}

/** A `state_changed` event; `old_state` is null for a new entity, `new_state` for a removed one. */
export interface HassStateChangeEvent {
	data: {
		entity_id: string;
		old_state: HassEntity | null;
		new_state: HassEntity | null;
	};
}

/** Entity registry entry as the frontend receives it (`hass.entities`). */
export interface HassEntityRegistryEntry {
	entity_id: string;
	name?: string | null;
	area_id?: string | null;
	device_id?: string | null;
	labels?: string[];
	hidden?: boolean;
	/** The integration the entity comes from (`googletv`, `music_assistant`). */
	platform?: string;
}

/** Device registry entry as the frontend receives it (`hass.devices`). */
export interface HassDeviceRegistryEntry {
	id: string;
	area_id?: string | null;
	name?: string | null;
	/** The name given in Home Assistant (Settings → Devices → rename), over the integration's `name`. */
	name_by_user?: string | null;
	manufacturer?: string | null;
	model?: string | null;
}

/** An area (`hass.areas`), optionally on a floor. */
export interface HassArea {
	area_id: string;
	name: string;
	floor_id?: string | null;
}

/** A floor (`hass.floors`); `level` orders floors (0 is the ground floor), null when unset. */
export interface HassFloor {
	floor_id: string;
	name: string;
	level?: number | null;
}

/** The events the websocket connection fires (see `HomeAssistant.connection.addEventListener`). */
export type ConnectionEvent = 'ready' | 'disconnected' | 'reconnect-error';

/**
 * The `hass` object Home Assistant's frontend hands a card. Everything but `states` and
 * `callService` is optional: older frontends, the demo's mock and tests leave parts out.
 */
export interface HomeAssistant {
	states: Record<string, HassEntity>;
	connection?: {
		subscribeEvents: (callback: (event: HassStateChangeEvent) => void, eventType?: string) => Promise<() => void>;
		subscribeMessage?: <T = unknown>(
			callback: (event: T) => void,
			message: Record<string, unknown>,
		) => Promise<() => void>;
		sendMessagePromise: (message: Record<string, unknown>) => Promise<unknown>;
		socket?: WebSocket;
		/** Whether the websocket is up (home-assistant-js-websocket's Connection). */
		connected?: boolean;
		/** `ready` after (re)connecting, `disconnected` when the socket drops, `reconnect-error` when it can't get back. */
		addEventListener?: (event: ConnectionEvent, listener: () => void) => void;
		removeEventListener?: (event: ConnectionEvent, listener: () => void) => void;
	};
	callService: (domain: string, service: string, serviceData?: Record<string, unknown>) => Promise<unknown>;
	callWS?: <T = unknown>(message: Record<string, unknown>) => Promise<T>;
	/** Home Assistant's REST API as the signed-in user (`path` without `/api/`). */
	callApi?: <T = unknown>(method: 'GET' | 'POST', path: string, parameters?: Record<string, unknown>) => Promise<T>;
	/** Authenticated fetch against the HA REST API. */
	fetchWithAuth?: (path: string, init?: RequestInit) => Promise<Response>;
	/** Core config; external_url/internal_url as set under Settings → System → Network. */
	config?: {
		external_url?: string | null;
		internal_url?: string | null;
		/** `length` is "mi" for imperial installs. */
		unit_system?: { length?: string };
		/** The integrations loaded (`assist_pipeline`, `music_assistant`…). */
		components?: string[];
	};
	/** The user's sidebar setting in this browser (Profile → "Always hide the sidebar"). */
	dockedSidebar?: 'docked' | 'always_hidden' | 'auto';
	/** Registries (entity → device → area → floor), as loaded by the frontend. */
	entities?: Record<string, HassEntityRegistryEntry>;
	devices?: Record<string, HassDeviceRegistryEntry>;
	areas?: Record<string, HassArea>;
	floors?: Record<string, HassFloor>;
	/** Theme state; `darkMode` is the user's resolved choice (Auto follows the device). */
	themes?: { darkMode?: boolean; theme?: string };
	/** This browser's theme choice (Profile → Browser settings); `dark` unset = Auto. */
	selectedTheme?: { theme?: string; dark?: boolean } | null;
	/** Registered services by domain. */
	services?: Record<string, Record<string, unknown>>;
	user?: {
		id: string;
		name: string;
		is_admin: boolean;
		is_owner: boolean;
	};
}
