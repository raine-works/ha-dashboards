import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	activityFor,
	defaultTv,
	discoverTvs,
	isConsoleInput,
	remoteFor,
	TV_FEATURE,
	TV_PLATFORM,
	toApps,
	toInputs,
	toTv,
	tvInArea,
	tvStatus,
	tvSupports,
} from '../tv';

const entity = (entity_id: string, state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
	entity_id,
	state,
	attributes,
	last_changed: '',
	last_updated: '',
});

// What Raineworks TV reports (the Master Suite TV's supported_features)
const tvEntity = (entity_id: string, state: string, attributes: HassEntity['attributes'] = {}) =>
	entity(entity_id, state, { device_class: 'tv', supported_features: 1204157, ...attributes });

const APPS = [
	{ package: 'com.raineworks.tvbridge', name: 'com.raineworks.tvbridge', icon: null },
	{ package: 'com.disney.disneyplus', name: 'Disney+', icon: 'https://play-lh.example/disney' },
	{ package: 'com.android.vending', name: 'Play Store', icon: null },
	{ package: 'com.tcl.tv', name: 'TV input', icon: null },
	{ package: 'com.netflix.ninja', name: 'Netflix', icon: 'https://play-lh.example/netflix' },
	{ package: 'com.apple.atve.sony.appletv', name: 'Apple TV', icon: 'https://play-lh.example/appletv' },
	{ package: 'com.google.android.youtube.tvunplugged', name: 'YouTube TV', icon: 'https://play-lh.example/yttv' },
	{ package: 'com.angel.tv', name: 'Angel', icon: 'https://play-lh.example/angel' },
];

const INPUTS = [
	{
		id: 'com.tcl.tvinput/.TvPassThroughService/HW16',
		port: 2,
		name: 'Nintendo',
		kind: 'nintendo_switch',
		device: null,
	},
	{ id: 'com.tcl.tvinput/.TvPassThroughService/HW15', port: 1, name: 'Xbox', kind: 'xbox', device: null },
	{ id: 'com.tcl.tvinput/.TvPassThroughService/HW18', port: 4, name: 'HDMI 4', kind: 'hdmi', device: 'Arc Ultra' },
];

describe('TVs', () => {
	it("discovers only Raineworks TV's TVs, never Music Assistant's dashboard displays", () => {
		const reg = (entity_id: string, platform: string, hidden = false) => ({ entity_id, platform, hidden });
		const tvs = discoverTvs(
			{
				'media_player.master_suite_master_suite_tv': tvEntity('media_player.master_suite_master_suite_tv', 'off', {
					friendly_name: 'Master Suite TV',
				}),
				'media_player.theater_home_theater_tv': tvEntity('media_player.theater_home_theater_tv', 'idle', {
					friendly_name: 'Home Theater TV',
				}),
				// Music Assistant's dashboard displays: a TV's Chromecast and the Library's WiiM Pro
				'media_player.master_suite_tv': tvEntity('media_player.master_suite_tv', 'idle'),
				'media_player.library': tvEntity('media_player.library', 'idle'),
				'media_player.hidden_tv': tvEntity('media_player.hidden_tv', 'off'),
				'media_player.kitchen': entity('media_player.kitchen', 'idle', { mass_player_type: 'player' }),
			},
			{
				entities: {
					'media_player.master_suite_master_suite_tv': reg('media_player.master_suite_master_suite_tv', TV_PLATFORM),
					'media_player.theater_home_theater_tv': reg('media_player.theater_home_theater_tv', TV_PLATFORM),
					'media_player.master_suite_tv': reg('media_player.master_suite_tv', 'music_assistant'),
					'media_player.library': reg('media_player.library', 'music_assistant'),
					'media_player.hidden_tv': reg('media_player.hidden_tv', TV_PLATFORM, true),
				},
			},
		);
		expect(tvs.map((tv) => tv.entityId)).toEqual([
			'media_player.theater_home_theater_tv',
			'media_player.master_suite_master_suite_tv',
		]);
	});

	it('lists only TVs with the Household TV label once any has it', () => {
		const tvs = discoverTvs(
			{
				'media_player.theater_tv': tvEntity('media_player.theater_tv', 'idle', { friendly_name: 'Theater TV' }),
				'media_player.garage_tv': tvEntity('media_player.garage_tv', 'off', { friendly_name: 'Garage TV' }),
			},
			{
				entities: {
					'media_player.theater_tv': {
						entity_id: 'media_player.theater_tv',
						platform: TV_PLATFORM,
						labels: ['household_tv'],
					},
					'media_player.garage_tv': { entity_id: 'media_player.garage_tv', platform: TV_PLATFORM },
				},
			},
		);
		expect(tvs.map((tv) => tv.entityId)).toEqual(['media_player.theater_tv']);
	});

	it('lists the launcher: featured apps first, the rest by name, without unnamed packages or the input app', () => {
		expect(toApps(APPS).map((app) => app.name)).toEqual([
			'YouTube TV',
			'Netflix',
			'Apple TV',
			'Disney+',
			'Angel',
			'Play Store',
		]);
		expect(toApps(APPS)[0]).toEqual({
			packageName: 'com.google.android.youtube.tvunplugged',
			name: 'YouTube TV',
			icon: 'https://play-lh.example/yttv',
		});
		expect(toApps(undefined)).toEqual([]);
	});

	it('reads the inputs by port, with their kind and HDMI-CEC device', () => {
		const inputs = toInputs(INPUTS);
		expect(inputs.map((i) => i.label)).toEqual(['Xbox', 'Nintendo', 'HDMI 4']);
		expect(inputs[2]).toMatchObject({ port: 4, kind: 'hdmi', device: 'Arc Ultra' });
		expect(isConsoleInput(inputs[0])).toBe(true);
		expect(isConsoleInput(inputs[2])).toBe(false);
	});

	it('reads what plays with its poster, the app, volume and features', () => {
		const tv = toTv(
			tvEntity('media_player.master_suite_master_suite_tv', 'playing', {
				friendly_name: 'Master Suite TV',
				apps: APPS,
				app_id: 'com.google.android.youtube.tvunplugged',
				app_name: 'YouTube TV',
				media_title: 'Spider-Man: Homecoming',
				media_artist: 'FX',
				entity_picture: '/api/media_player_proxy/media_player.master_suite_master_suite_tv?token=x',
				volume_level: 0.1,
				is_volume_muted: false,
			}),
			'playing',
		);
		expect(tv).toMatchObject({
			state: 'on',
			activity: 'playing',
			appName: 'YouTube TV',
			volume: 10,
			muted: false,
			nowPlaying: {
				state: 'playing',
				title: 'Spider-Man: Homecoming',
				subtitle: 'FX',
				artwork: '/api/media_player_proxy/media_player.master_suite_master_suite_tv?token=x',
			},
		});
		expect(tv.app?.icon).toBe('https://play-lh.example/yttv');
		expect(tvStatus(tv)).toBe('YouTube TV · Spider-Man: Homecoming');
		expect(tvSupports(tv, TV_FEATURE.VOLUME_SET)).toBe(true);
		expect(tvSupports(tv, TV_FEATURE.SELECT_SOURCE)).toBe(true);
		expect(tvSupports(tv, TV_FEATURE.TURN_OFF)).toBe(true);
	});

	it('shows the input on screen by its name, with nothing playing', () => {
		const tv = toTv(
			tvEntity('media_player.theater', 'on', {
				apps: APPS,
				inputs: INPUTS,
				input: 'com.tcl.tvinput/.TvPassThroughService/HW15',
				app_id: 'com.tcl.tv',
				app_name: 'Xbox',
			}),
			'input',
		);
		expect(tv.input?.label).toBe('Xbox');
		expect(tv.appName).toBe('Xbox');
		expect(tv.app).toBeUndefined();
		expect(tvStatus(tv)).toBe('Xbox');
	});

	it('names the screensaver and home screen from the Activity sensor, else the package', () => {
		const screensaver = tvEntity('media_player.theater', 'idle', {
			app_id: 'com.google.android.apps.tv.dreamx',
			app_name: 'com.google.android.apps.tv.dreamx',
		});
		expect(toTv(screensaver, 'screensaver').appName).toBe('Screensaver');
		expect(toTv(screensaver).appName).toBe('Screensaver');
		const unknown = tvEntity('media_player.theater', 'on', { app_id: 'com.example.tv', app_name: 'com.example.tv' });
		expect(toTv(unknown, 'app').appName).toBe('com.example.tv');
		expect(toTv(unknown, 'home').appName).toBe('Home screen');
	});

	it('ignores stale attributes while off', () => {
		const tv = toTv(
			tvEntity('media_player.theater', 'off', { app_id: 'com.netflix.ninja', volume_level: 0.2, media_title: 'X' }),
			'off',
		);
		expect(tv).toMatchObject({ state: 'off', appId: undefined, volume: undefined, muted: false });
		expect(tv.nowPlaying).toBeUndefined();
		expect(tvStatus(tv)).toBe('Off');
	});

	it('finds the remote and the Activity sensor on the TV’s device, else by name', () => {
		const tv = tvEntity('media_player.theater_home_theater_tv', 'on');
		const states = {
			[tv.entity_id]: tv,
			'remote.theater_home_theater_tv': entity('remote.theater_home_theater_tv', 'on'),
			'sensor.theater_home_theater_tv_activity': entity('sensor.theater_home_theater_tv_activity', 'home'),
			'remote.tv_2': entity('remote.tv_2', 'on'),
			'sensor.tv_activity_2': entity('sensor.tv_activity_2', 'app'),
		};
		expect(remoteFor(tv, states)).toBe('remote.theater_home_theater_tv');
		expect(activityFor(tv, states)).toBe('sensor.theater_home_theater_tv_activity');
		const registries = {
			entities: {
				[tv.entity_id]: { entity_id: tv.entity_id, device_id: 'd1' },
				'remote.tv_2': { entity_id: 'remote.tv_2', device_id: 'd1' },
			},
		};
		expect(remoteFor(tv, states, registries)).toBe('remote.tv_2');
		const tvs = discoverTvs(states);
		expect(tvs[0]).toMatchObject({ remoteEntityId: 'remote.theater_home_theater_tv', activity: 'home' });
	});

	it('defaults to the preferred TV, else one that is on', () => {
		const tvs = discoverTvs({
			'media_player.a': tvEntity('media_player.a', 'off', { friendly_name: 'A' }),
			'media_player.b': tvEntity('media_player.b', 'on', { friendly_name: 'B' }),
		});
		expect(defaultTv(tvs)).toBe('media_player.b');
		expect(defaultTv(tvs, 'media_player.a')).toBe('media_player.a');
		expect(defaultTv(tvs, 'media_player.gone')).toBe('media_player.b');
		expect(defaultTv([])).toBeUndefined();
	});

	it('finds the TV in a speaker’s room', () => {
		const tvs = discoverTvs({ 'media_player.tv': tvEntity('media_player.tv', 'on') });
		const registries = {
			entities: {
				'media_player.tv': { entity_id: 'media_player.tv', area_id: 'theater' },
				'media_player.soundbar': { entity_id: 'media_player.soundbar', area_id: 'theater' },
				'media_player.kitchen': { entity_id: 'media_player.kitchen', area_id: 'kitchen' },
			},
			devices: {},
		};
		expect(tvInArea(tvs, 'media_player.soundbar', registries)?.entityId).toBe('media_player.tv');
		expect(tvInArea(tvs, 'media_player.kitchen', registries)).toBeUndefined();
	});
});
