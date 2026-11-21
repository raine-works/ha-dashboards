import { beforeAll, describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import {
	ANNOUNCEMENT_PRESETS,
	announceTargets,
	broadcastRecording,
	broadcastText,
	discoverIntercomSpeakers,
	intercomTargetLabel,
	PHONE_MESSAGE_MAX,
	PHONE_PRESETS,
	phoneMessage,
	phoneMessageSender,
	purgeStaleRecordings,
} from '../intercom';
import { useFixtureHouse } from './house-fixture';

useFixtureHouse();

const player = (entity_id: string, state: string, attributes: HassEntity['attributes']): HassEntity => ({
	entity_id,
	state,
	attributes,
	last_changed: '',
	last_updated: '',
});

describe('discoverIntercomSpeakers', () => {
	it('lists only Music Assistant players, sorted by name', () => {
		const states = Object.fromEntries(
			[
				player('media_player.kitchen_kitchen', 'idle', { friendly_name: 'Kitchen', mass_player_type: 'player' }),
				player('media_player.basement', 'playing', { friendly_name: 'Basement', app_id: 'music_assistant' }),
				player('media_player.theater_tv', 'on', { friendly_name: 'Home Theater TV', app_id: 'com.netflix.ninja' }),
				player('media_player.living_room_living_room_speaker', 'idle', { friendly_name: 'G6 Instant Speaker' }),
				player('media_player.athena', 'unavailable', { friendly_name: 'Athena', mass_player_type: 'player' }),
				// A soundbar playing its TV's sound
				player('media_player.home_theater', 'playing', {
					friendly_name: 'Home Theater',
					mass_player_type: 'player',
					source: 'TV',
					app_id: 'tv',
					active_queue: null,
				}),
			].map((e) => [e.entity_id, e]),
		);

		expect(discoverIntercomSpeakers(states)).toEqual([
			{ entityId: 'media_player.athena', name: 'Athena', available: false, isPlaying: false, tvAudio: false },
			{ entityId: 'media_player.basement', name: 'Basement', available: true, isPlaying: true, tvAudio: false },
			{ entityId: 'media_player.home_theater', name: 'Home Theater', available: true, isPlaying: true, tvAudio: true },
			{ entityId: 'media_player.kitchen_kitchen', name: 'Kitchen', available: true, isPlaying: false, tvAudio: false },
		]);
	});

	it("leaves out Music Assistant's browser players", () => {
		const states = Object.fromEntries(
			[
				player('media_player.kitchen_kitchen', 'idle', { friendly_name: 'Kitchen', mass_player_type: 'player' }),
				player('media_player.web_chrome_on_mac_2', 'idle', {
					friendly_name: 'Web (Chrome on Mac)',
					mass_player_type: 'player',
				}),
			].map((e) => [e.entity_id, e]),
		);
		const hass = {
			entities: {
				'media_player.web_chrome_on_mac_2': { entity_id: 'media_player.web_chrome_on_mac_2', device_id: 'chrome' },
			},
			devices: { chrome: { id: 'chrome', model: 'Web Player' } },
		};
		expect(discoverIntercomSpeakers(states, hass).map((s) => s.name)).toEqual(['Kitchen']);
	});
});

describe('broadcastRecording', () => {
	const options = { speakers: ['media_player.kitchen_kitchen'], volume: 60, chime: false };
	const samples = new Float32Array(1600);
	const signedPath = '/media/local/intercom_1.wav?authSig=x';

	beforeAll(() => {
		(globalThis as { window?: unknown }).window = { location: { origin: 'https://panel.test' } };
	});

	const fakeHass = (upload: Response, config?: HomeAssistant['config']) => {
		const calls: { service: string; data?: Record<string, unknown> }[] = [];
		const hass = {
			states: {},
			config,
			fetchWithAuth: async () => upload,
			callWS: async () => ({ url: signedPath }),
			callService: async (domain: string, service: string, data?: Record<string, unknown>) => {
				calls.push({ service: `${domain}.${service}`, data });
			},
		} as unknown as HomeAssistant;
		return { hass, calls };
	};
	const uploaded = () => Response.json({ media_content_id: 'media-source://media_source/local/intercom_1.wav' });

	it('announces the uploaded clip via the external URL Music Assistant can reach', async () => {
		const { hass, calls } = fakeHass(uploaded(), { external_url: 'https://ha.example.com' });
		await broadcastRecording(hass, samples, 16000, options);
		expect(calls).toEqual([
			{
				service: 'music_assistant.play_announcement',
				data: {
					entity_id: options.speakers,
					url: `https://ha.example.com${signedPath}`,
					announce_volume: 60,
					use_pre_announce: false,
				},
			},
		]);
	});

	it('plays the same clip on the TVs as an announcement over what is on', async () => {
		const { hass, calls } = fakeHass(uploaded(), { external_url: 'https://ha.example.com' });
		const tv = 'media_player.master_suite_master_suite_tv';
		await broadcastRecording(hass, samples, 16000, { ...options, tvs: [tv] });
		expect(calls).toContainEqual({
			service: 'media_player.play_media',
			data: {
				entity_id: [tv],
				media_content_type: 'music',
				media_content_id: `https://ha.example.com${signedPath}`,
				announce: true,
			},
		});
		// TVs alone: no Music Assistant call
		const tvOnly = fakeHass(uploaded(), { external_url: 'https://ha.example.com' });
		await broadcastRecording(tvOnly.hass, samples, 16000, { ...options, speakers: [], tvs: [tv] });
		expect(tvOnly.calls.map((c) => c.service)).toEqual(['media_player.play_media']);
	});

	it("uploads to the integration when it's loaded: any user, no local media", async () => {
		const posted: { path: string; init?: RequestInit }[] = [];
		const asked: unknown[] = [];
		const hass = {
			states: {},
			config: { external_url: 'https://ha.example.com', components: ['raineworks_dashboards'] },
			fetchWithAuth: async (path: string, init?: RequestInit) => {
				posted.push({ path, init });
				return Response.json({ url: '/api/raineworks_dashboards/clips/abc.wav?authSig=y' });
			},
			callWS: async (msg: unknown) => asked.push(msg),
			callService: async () => {},
			user: { is_admin: false },
		} as unknown as HomeAssistant;
		const calls: unknown[] = [];
		hass.callService = (async (_d: string, _s: string, data: unknown) => calls.push(data)) as never;
		await broadcastRecording(hass, samples, 16000, options);
		expect(posted.map((p) => p.path)).toEqual(['/api/raineworks_dashboards/clips']);
		expect(posted[0]?.init?.headers).toEqual({ 'Content-Type': 'audio/wav' });
		// No local media upload, resolve or removal
		expect(asked).toEqual([]);
		expect((calls[0] as { url: string }).url).toBe(
			'https://ha.example.com/api/raineworks_dashboards/clips/abc.wav?authSig=y',
		);
		// And no sweep of local media: the integration deletes its clips
		expect(await purgeStaleRecordings({ ...hass, user: { is_admin: true } } as never)).toBe(0);
		expect(asked).toEqual([]);
	});

	it('falls back to the page origin without an external URL', async () => {
		const { hass, calls } = fakeHass(uploaded(), { external_url: null });
		await broadcastRecording(hass, samples, 16000, options);
		expect(calls[0].data?.url).toBe(`https://panel.test${signedPath}`);
	});

	it('explains the admin requirement when the upload is unauthorized', async () => {
		const { hass, calls } = fakeHass(new Response(null, { status: 401 }));
		await expect(broadcastRecording(hass, samples, 16000, options)).rejects.toThrow('admin user');
		expect(calls).toEqual([]);
	});
});

describe('purgeStaleRecordings', () => {
	const now = 1_800_000_000_000;
	const minutesAgo = (m: number) => now - m * 60_000;
	const item = (title: string) => ({ title, media_content_id: `media-source://media_source/local/${title}` });

	const fakeHass = (isAdmin = true) => {
		const removed: string[] = [];
		const hass = {
			states: {},
			user: { id: 'u', name: 'Panel', is_admin: isAdmin, is_owner: false },
			callWS: async (msg: Record<string, unknown>) => {
				if (msg.type === 'media_source/browse_media') {
					return {
						children: [
							item(`intercom_${minutesAgo(30)}.wav`),
							item(`intercom_${minutesAgo(2)}.wav`),
							item('doorbell_snapshot.jpg'),
							item(`intercom_${minutesAgo(30)}.mp3`),
						],
					};
				}
				removed.push(String(msg.media_content_id));
				return null;
			},
		} as unknown as HomeAssistant;
		return { hass, removed };
	};

	it('removes only intercom clips older than the max age', async () => {
		const { hass, removed } = fakeHass();
		expect(await purgeStaleRecordings(hass, 10 * 60_000, now)).toBe(1);
		expect(removed).toEqual([`media-source://media_source/local/intercom_${minutesAgo(30)}.wav`]);
	});

	it('does nothing for non-admin users', async () => {
		const { hass, removed } = fakeHass(false);
		expect(await purgeStaleRecordings(hass, 10 * 60_000, now)).toBe(0);
		expect(removed).toEqual([]);
	});
});

describe('phone messages', () => {
	it('titles a message with its sender and keeps it to the limit', () => {
		const sent = phoneMessage('Robin', `  ${'x'.repeat(PHONE_MESSAGE_MAX + 20)}  `, 1000);
		expect(sent.title).toBe('From Robin');
		expect(sent.message).toHaveLength(PHONE_MESSAGE_MAX);
		expect(sent.data.tag).toBe('intercom_1000');
		expect(phoneMessage(undefined, 'Hi').title).toBe('From home');
	});

	it('names the person, else the wall panel', () => {
		expect(phoneMessageSender('Robin', 'Kitchen wall panel')).toBe('Robin');
		expect(phoneMessageSender(undefined, 'Kitchen wall panel')).toBe('the Kitchen wall panel');
		expect(phoneMessageSender(undefined, undefined)).toBeUndefined();
	});

	it('has quick messages within the limit', () => {
		for (const { presets } of PHONE_PRESETS)
			for (const preset of presets) expect(preset.length).toBeLessThanOrEqual(PHONE_MESSAGE_MAX);
	});

	it('keeps quick messages and categories unique', () => {
		for (const categories of [PHONE_PRESETS, ANNOUNCEMENT_PRESETS]) {
			const ids = categories.map((c) => c.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const { presets } of categories) expect(presets.length).toBeGreaterThan(0);
		}
		const phones = PHONE_PRESETS.flatMap((c) => c.presets);
		expect(new Set(phones).size).toBe(phones.length);
		const labels = ANNOUNCEMENT_PRESETS.flatMap((c) => c.presets.map((p) => p.label));
		expect(new Set(labels).size).toBe(labels.length);
	});
});

describe('announceTargets', () => {
	const speaker = (id: string, members?: string[]) =>
		({ entity_id: id, state: 'idle', attributes: members ? { group_members: members } : {} }) as unknown as HassEntity;
	const states = {
		'media_player.library': speaker('media_player.library', [
			'media_player.library',
			'media_player.left',
			'media_player.right',
		]),
		'media_player.left': speaker('media_player.left', [
			'media_player.library',
			'media_player.left',
			'media_player.right',
		]),
		'media_player.right': speaker('media_player.right', [
			'media_player.library',
			'media_player.left',
			'media_player.right',
		]),
		'media_player.kitchen': speaker('media_player.kitchen', ['media_player.kitchen']),
		'media_player.basement': speaker('media_player.basement'),
	};

	it("sends a group's announcement once, to its leader", () => {
		expect(announceTargets(states, ['media_player.left', 'media_player.right', 'media_player.library'])).toEqual([
			'media_player.library',
		]);
	});

	it('keeps speakers that play alone', () => {
		expect(announceTargets(states, ['media_player.kitchen', 'media_player.left', 'media_player.basement'])).toEqual([
			'media_player.kitchen',
			'media_player.library',
			'media_player.basement',
		]);
	});
});

describe('broadcastText on the TVs', () => {
	it("says it on each TV in the house's voice, and on the speakers as before", async () => {
		const calls: { service: string; data?: Record<string, unknown> }[] = [];
		const hass = {
			states: {},
			services: { script: { play_announcement: {} } },
			callService: async (domain: string, service: string, data?: Record<string, unknown>) => {
				calls.push({ service: `${domain}.${service}`, data });
			},
		} as unknown as HomeAssistant;
		const tv = 'media_player.master_suite_master_suite_tv';
		await broadcastText(hass, 'Dinner is ready', {
			speakers: ['media_player.kitchen_kitchen'],
			tvs: [tv],
			volume: 60,
			chime: true,
		});
		expect(calls.map((c) => c.service).sort()).toEqual(['script.play_announcement', 'tts.speak']);
		// The script would also say it on every TV that's on: the dashboards send to the picked TVs themselves
		expect(calls.find((c) => c.service === 'script.play_announcement')?.data?.tvs).toBe(false);
		expect(calls.find((c) => c.service === 'tts.speak')?.data).toEqual({
			entity_id: 'tts.house_voice',
			media_player_entity_id: tv,
			message: 'Dinner is ready',
			options: { voice: 'nova' },
		});
	});
});

describe('intercomTargetLabel', () => {
	const name = (id: string) => ({ 'media_player.kitchen': 'Kitchen', 'media_player.tv': 'Master Suite TV' })[id] ?? id;
	it('names one, counts several, joins speakers and TVs', () => {
		expect(intercomTargetLabel(['media_player.kitchen'], [], name)).toBe('Kitchen');
		expect(intercomTargetLabel(['a', 'b'], [], name)).toBe('2 speakers');
		expect(intercomTargetLabel(['a', 'b'], ['media_player.tv'], name)).toBe('2 speakers and Master Suite TV');
		expect(intercomTargetLabel([], ['x', 'y'], name)).toBe('2 TVs');
		expect(intercomTargetLabel([], [], name)).toBe('nothing');
	});
});

describe("broadcastText through the integration's announce", () => {
	it("uses it when it's there: a person's own, so no quiet hours, and no TVs from here", async () => {
		const calls: { service: string; data?: Record<string, unknown> }[] = [];
		const hass = {
			states: {},
			services: { raineworks_dashboards: { announce: {} }, script: { play_announcement: {} } },
			callService: async (domain: string, service: string, data?: Record<string, unknown>) => {
				calls.push({ service: `${domain}.${service}`, data });
			},
		} as unknown as HomeAssistant;
		await broadcastText(hass, 'Dinner', { speakers: ['media_player.kitchen'], volume: 80, chime: true });
		expect(calls).toEqual([
			{
				service: 'raineworks_dashboards.announce',
				data: {
					message: 'Dinner',
					speakers: ['media_player.kitchen'],
					volume: 80,
					chime: true,
					quiet_hours: false,
					tvs: false,
				},
			},
		]);
	});
});
