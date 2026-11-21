import type { HassEntity, HomeAssistant } from '../types/homeassistant';
import { entityArea } from './lights';
import { MEDIA_FEATURE } from './music';
import { trimmedString as str } from './values';

/**
 * The TVs are Raineworks TV's (`googletv`, [raine-works/ha-googletv](https://github.com/raine-works/ha-googletv)):
 * one `media_player` per TV that knows its apps (with their Google Play icons), its HDMI inputs,
 * what any app is playing (with a poster or cover) and the TV's volume, plus a `remote` and an
 * Activity sensor on the same device.
 */
export const TV_PLATFORM = 'googletv';

/** An app on the TV, as its `apps` attribute lists it. */
export interface TvApp {
	/** Its package (the TV's `app_id` while it's open), what `play_media` with `app` opens. */
	packageName: string;
	name: string;
	/** Its Google Play icon (a URL), when the integration found one. */
	icon?: string;
}

/** What's plugged into an HDMI input, by the `kind` the integration gives it from the input's name. */
export type TvInputKind =
	| 'xbox'
	| 'playstation'
	| 'nintendo_switch'
	| 'nintendo_wii'
	| 'steam'
	| 'apple_tv'
	| 'laptop'
	| 'computer'
	| 'streamer'
	| 'cable'
	| 'disc'
	| 'audio'
	| 'camera'
	| 'console'
	| 'hdmi';

/** One of a TV's HDMI inputs. */
export interface TvInput {
	/** Android TV's input id, what `select_source` takes. */
	id: string;
	/** Its name on the TV ("Xbox"), else "HDMI <port>". */
	label: string;
	port: number;
	kind: TvInputKind;
	/** The name its device gives itself over HDMI-CEC ("Arc Ultra"). */
	device?: string;
}

/** Game consoles, shown with a controller (or their own logo). */
const CONSOLE_KINDS: ReadonlySet<TvInputKind> = new Set([
	'xbox',
	'playstation',
	'nintendo_switch',
	'nintendo_wii',
	'steam',
	'console',
]);

export const isConsoleInput = (input: Pick<TvInput, 'kind'>) => CONSOLE_KINDS.has(input.kind);

/**
 * The apps the launcher leads with, in this order (the rest follow by name). By package, since a
 * maker's own build has its own (Sony's Apple TV is `com.apple.atve.sony.appletv`).
 */
const FEATURED_APPS = [
	['com.google.android.youtube.tv'],
	['com.google.android.youtube.tvunplugged'],
	['com.netflix.ninja'],
	['com.amazon.amazonvideo.livingroom'],
	['com.apple.atve.androidtv.appletv', 'com.apple.atve.sony.appletv'],
	['com.wbd.stream'],
	['com.hulu.livingroomplus'],
	['com.disney.disneyplus'],
];

const featuredRank = (app: TvApp) => {
	const rank = FEATURED_APPS.findIndex((packages) => packages.includes(app.packageName));
	return rank < 0 ? FEATURED_APPS.length : rank;
};

/**
 * Apps the launcher leaves out: the TVs' own apps for their inputs (the inputs are listed
 * themselves), and system packages the integration couldn't name ("com.sony.dtv.timers").
 */
const INPUT_APPS: ReadonlySet<string> = new Set(['com.tcl.tv', 'com.sony.dtv.tvx', 'com.google.android.tv']);

const launcherApp = (app: TvApp) => !INPUT_APPS.has(app.packageName) && app.name !== app.packageName;

/** Names for packages that aren't apps in the list, so what's in front reads well. */
const OTHER_APPS: Record<string, string> = {
	'com.google.android.apps.tv.launcherx': 'Home screen',
	'com.google.android.tvlauncher': 'Home screen',
	'com.google.android.apps.tv.dreamx': 'Screensaver',
	'com.google.android.apps.mediashell': 'Casting',
};

/** What the TV is doing, from its Activity sensor (`sensor.<tv>_activity`). */
export type TvActivity = 'off' | 'screensaver' | 'home' | 'app' | 'playing' | 'paused' | 'input';

const ACTIVITIES: ReadonlySet<string> = new Set(['off', 'screensaver', 'home', 'app', 'playing', 'paused', 'input']);

export type TvState = 'on' | 'off' | 'unavailable';

/** What an app on the TV is playing (title, show or artist, its poster or cover), as the TV reports it. */
export interface TvNowPlaying {
	state: 'playing' | 'paused';
	title: string;
	/** The show, channel or artist ("FX"). */
	subtitle?: string;
	/** Its poster or cover through Home Assistant's proxy (the app's icon when none was found). */
	artwork?: string;
}

export interface Tv {
	entityId: string;
	name: string;
	state: TvState;
	activity?: TvActivity;
	/** The app in front (its package), while on. */
	appId?: string;
	/** What's on by name: the app, the input on screen, "Home screen", "Screensaver". */
	appName?: string;
	/** The app in front, when it's one of the TV's apps (its icon). */
	app?: TvApp;
	/** The launcher: the TV's apps, the featured ones first. */
	apps: TvApp[];
	inputs: TvInput[];
	/** The input on screen, while one is. */
	input?: TvInput;
	nowPlaying?: TvNowPlaying;
	/** 0–100. */
	volume?: number;
	muted: boolean;
	features: number;
	/** The TV's `remote` entity, which sends key presses (`REMOTE_KEYS`; needs ADB). */
	remoteEntityId?: string;
}

/** Keys the TV's remote sends (`remote.send_command`): Android key codes without `KEYCODE_`. */
export const REMOTE_KEYS = {
	up: 'DPAD_UP',
	down: 'DPAD_DOWN',
	left: 'DPAD_LEFT',
	right: 'DPAD_RIGHT',
	select: 'DPAD_CENTER',
	back: 'BACK',
	home: 'HOME',
} as const;

export type RemoteKey = keyof typeof REMOTE_KEYS;

/** The TV's entity in another domain: the one on the same device, else `<domain>.<object id><suffix>`. */
function siblingOf(
	tv: HassEntity,
	domain: string,
	suffix: string,
	states: Record<string, HassEntity>,
	registries?: Pick<HomeAssistant, 'entities'>,
): string | undefined {
	const entities = registries?.entities;
	const deviceId = entities?.[tv.entity_id]?.device_id;
	if (deviceId && entities) {
		const sameDevice = Object.values(entities).find(
			(e) =>
				e.device_id === deviceId &&
				e.entity_id.startsWith(`${domain}.`) &&
				e.entity_id.endsWith(suffix) &&
				e.entity_id in states,
		);
		if (sameDevice) return sameDevice.entity_id;
	}
	const byName = `${domain}.${tv.entity_id.slice('media_player.'.length)}${suffix}`;
	return byName in states ? byName : undefined;
}

/** The TV's `remote` entity. */
export const remoteFor = (
	tv: HassEntity,
	states: Record<string, HassEntity>,
	registries?: Pick<HomeAssistant, 'entities'>,
) => siblingOf(tv, 'remote', '', states, registries);

/** The TV's Activity sensor. */
export const activityFor = (
	tv: HassEntity,
	states: Record<string, HassEntity>,
	registries?: Pick<HomeAssistant, 'entities'>,
) => siblingOf(tv, 'sensor', '_activity', states, registries);

/** Feature bits the TV reports (it sets and steps volume, opens apps and inputs as sources). */
export const TV_FEATURE = {
	...MEDIA_FEATURE,
	TURN_ON: 128,
	TURN_OFF: 256,
	VOLUME_STEP: 1024,
	SELECT_SOURCE: 2048,
} as const;

export const tvSupports = (tv: Tv, feature: number) => (tv.features & feature) !== 0;

/** TVs are `media_player`s; their activity a sensor of theirs. */
export const TVS_WATCH = (entityId: string) =>
	entityId.startsWith('media_player.') || (entityId.startsWith('sensor.') && entityId.endsWith('_activity'));

/** The TV's apps from its `apps` attribute: the launcher's (named, not an input's), featured first. */
export function toApps(value: unknown): TvApp[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item): TvApp | undefined => {
			const a = item as { package?: unknown; name?: unknown; icon?: unknown };
			const packageName = str(a?.package);
			if (!packageName) return undefined;
			return { packageName, name: str(a.name) ?? packageName, icon: str(a.icon) };
		})
		.filter((app): app is TvApp => !!app && launcherApp(app))
		.sort((a, b) => featuredRank(a) - featuredRank(b) || a.name.localeCompare(b.name));
}

/** The TV's HDMI inputs from its `inputs` attribute, by port. */
export function toInputs(value: unknown): TvInput[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item): TvInput | undefined => {
			const i = item as { id?: unknown; name?: unknown; port?: unknown; kind?: unknown; device?: unknown };
			const id = str(i?.id);
			if (!id) return undefined;
			const port = typeof i.port === 'number' ? i.port : 0;
			return {
				id,
				label: str(i.name) ?? (port ? `HDMI ${port}` : id),
				port,
				kind: (str(i.kind) ?? 'hdmi') as TvInputKind,
				device: str(i.device),
			};
		})
		.filter((input): input is TvInput => !!input)
		.sort((a, b) => a.port - b.port);
}

/** What the TV says is playing: playing or paused, with a title. */
export function toNowPlaying(entity: HassEntity): TvNowPlaying | undefined {
	if (entity.state !== 'playing' && entity.state !== 'paused') return undefined;
	const a = entity.attributes;
	const title = str(a.media_title);
	if (!title) return undefined;
	return {
		state: entity.state,
		title,
		subtitle: str(a.media_artist),
		artwork: str(a.entity_picture),
	};
}

export function toTv(entity: HassEntity, activityState?: string): Tv {
	const a = entity.attributes;
	const state: TvState = entity.state === 'unavailable' ? 'unavailable' : entity.state === 'off' ? 'off' : 'on';
	const on = state === 'on';
	const apps = toApps(a.apps);
	const inputs = toInputs(a.inputs);
	const appId = on ? str(a.app_id) : undefined;
	const input = on ? inputs.find((i) => i.id === a.input) : undefined;
	const app = appId ? apps.find((x) => x.packageName === appId) : undefined;
	const reported = str(a.app_name);
	const activity = activityState && ACTIVITIES.has(activityState) ? (activityState as TvActivity) : undefined;
	const appName = !on
		? undefined
		: input
			? input.label
			: activity === 'screensaver'
				? 'Screensaver'
				: activity === 'home'
					? 'Home screen'
					: (app?.name ??
						(appId && OTHER_APPS[appId]) ??
						(reported && reported !== appId ? reported : undefined) ??
						appId);
	return {
		entityId: entity.entity_id,
		name: str(a.friendly_name) ?? entity.entity_id,
		state,
		activity,
		appId,
		appName,
		app: input ? undefined : app,
		apps,
		inputs,
		input,
		nowPlaying: on && !input ? toNowPlaying(entity) : undefined,
		volume: on && typeof a.volume_level === 'number' ? Math.round(a.volume_level * 100) : undefined,
		muted: on && a.is_volume_muted === true,
		features: typeof a.supported_features === 'number' ? a.supported_features : 0,
	};
}

/**
 * Every TV, by name: the integration's `media_player`s, not hidden. Music Assistant calls things
 * TVs too (its dashboard displays, Party mode's cast targets, the Library's WiiM Pro among them).
 * Without the entity registry (tests), by device class alone.
 */
export function discoverTvs(states: Record<string, HassEntity>, registries?: Pick<HomeAssistant, 'entities'>): Tv[] {
	const registry = registries?.entities;
	return Object.values(states)
		.filter((s) => {
			if (!s.entity_id.startsWith('media_player.') || s.attributes.device_class !== 'tv') return false;
			if (s.attributes.mass_player_type != null) return false;
			if (!registry) return true;
			const entry = registry[s.entity_id];
			return entry?.platform === TV_PLATFORM && !entry.hidden;
		})
		.map((s) => {
			const activity = activityFor(s, states, registries);
			return {
				...toTv(s, activity ? states[activity]?.state : undefined),
				remoteEntityId: remoteFor(s, states, registries),
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The TV in a speaker's room (its area, else its device's): the one a soundbar plays the sound of. */
export function tvInArea(
	tvs: Tv[],
	speakerId: string,
	registries: Pick<HomeAssistant, 'entities' | 'devices'>,
): Tv | undefined {
	const area = entityArea(registries, speakerId);
	return area ? tvs.find((tv) => entityArea(registries, tv.entityId) === area) : undefined;
}

/** The TV to show: the preferred one if it exists, else one that's on, else the first. */
export function defaultTv(tvs: Tv[], preferred?: string): string | undefined {
	if (preferred && tvs.some((tv) => tv.entityId === preferred)) return preferred;
	return (tvs.find((tv) => tv.state === 'on') ?? tvs[0])?.entityId;
}

/** "YouTube TV · Spider-Man: Homecoming", "Xbox", "Screensaver", "On", "Off" or "Unavailable". */
export function tvStatus(tv: Tv): string {
	if (tv.state === 'unavailable') return 'Unavailable';
	if (tv.state === 'off') return 'Off';
	const app = tv.appName ?? 'On';
	return tv.nowPlaying ? `${app} · ${tv.nowPlaying.title}` : app;
}
