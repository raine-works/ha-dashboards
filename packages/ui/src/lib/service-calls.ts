import type { HassEntity, HomeAssistant } from '../types/homeassistant';

// What a failed call was trying to do, as "Couldn't <verb> <target>"
const VERBS: Record<string, string> = {
	turn_on: 'turn on',
	turn_off: 'turn off',
	toggle: 'toggle',
	lock: 'lock',
	unlock: 'unlock',
	open_cover: 'open',
	close_cover: 'close',
	stop_cover: 'stop',
	set_cover_position: 'move',
	media_play: 'play',
	media_pause: 'pause',
	media_play_pause: 'play or pause',
	media_stop: 'stop',
	media_next_track: 'skip on',
	media_previous_track: 'go back on',
	media_seek: 'seek on',
	volume_set: 'set the volume of',
	volume_mute: 'mute',
	volume_up: 'turn up',
	volume_down: 'turn down',
	play_media: 'play on',
	shuffle_set: 'change shuffle on',
	repeat_set: 'change repeat on',
	join: 'group',
	unjoin: 'ungroup',
	press: 'press',
	send_command: 'send to',
	set_hvac_mode: 'change the mode of',
	set_preset_mode: 'change the preset of',
	select_option: 'change',
	dismiss: 'dismiss the notification',
	dismiss_all: 'dismiss the notifications',
};

/** Domains whose `turn_on` starts something rather than switching it on. */
const RUN_DOMAINS = new Set(['script', 'scene', 'automation']);

const entityIds = (data: Record<string, unknown>): string[] => {
	const ids = data.entity_id;
	if (typeof ids === 'string')
		return ids
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean);
	return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
};

const friendlyName = (id: string, states: Record<string, HassEntity> | undefined) =>
	(states?.[id]?.attributes?.friendly_name as string | undefined) ??
	id
		.slice(id.indexOf('.') + 1)
		.replace(/_/g, ' ')
		.replace(/^\w/, (c) => c.toUpperCase());

/**
 * A failed service call in words ("Couldn't lock Front Entry", "Couldn't turn on Kitchen +2"), for
 * the toast that reports it: the service's verb and the entities' names.
 */
export function describeServiceCall(
	domain: string,
	service: string,
	data: Record<string, unknown> = {},
	states?: Record<string, HassEntity>,
): string {
	const ids = entityIds(data);
	// A script called as its own service (`script.daily_brief_generate`)
	if (domain === 'script' && ids.length === 0 && !(service in VERBS)) {
		return `Couldn't run ${friendlyName(`script.${service}`, states)}`;
	}
	const verb =
		RUN_DOMAINS.has(domain) && service === 'turn_on' ? 'run' : (VERBS[service] ?? service.replace(/_/g, ' '));
	let target = '';
	if (ids.length > 0) target = friendlyName(ids[0], states) + (ids.length > 1 ? ` +${ids.length - 1}` : '');
	else if (typeof data.label_id === 'string') target = `the ${data.label_id.replace(/_/g, ' ')}s`;
	return `Couldn't ${verb}${target ? ` ${target}` : ''}`;
}

/** Home Assistant's reason for a failure: websocket errors are `{ code, message }`, others Errors. */
export function serviceErrorMessage(err: unknown): string | undefined {
	if (!err) return undefined;
	if (typeof err === 'string') return err;
	if (typeof err === 'object') {
		const { message, error } = err as { message?: unknown; error?: { message?: unknown } };
		if (typeof message === 'string' && message) return message;
		if (typeof error?.message === 'string' && error.message) return error.message;
	}
	return undefined;
}

/**
 * Call a service that answers with data (`return_response`: a search, a queue, a calendar's
 * events, a script's result), over the websocket. Its response, or undefined; rejects when Home
 * Assistant does, or isn't connected yet.
 */
export async function callForResponse<T = unknown>(
	hass: Pick<HomeAssistant, 'callWS'>,
	domain: string,
	service: string,
	data: Record<string, unknown> = {},
	target?: Record<string, unknown>,
): Promise<T | undefined> {
	if (!hass.callWS) throw new Error('Home Assistant connection not ready');
	const result = await hass.callWS<{ response?: T }>({
		type: 'call_service',
		domain,
		service,
		service_data: data,
		...(target ? { target } : {}),
		return_response: true,
	});
	return result?.response;
}
