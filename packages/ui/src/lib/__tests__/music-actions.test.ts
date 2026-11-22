import { describe, expect, it } from 'bun:test';
import type { HassEntity, HomeAssistant } from '../../types/homeassistant';
import { castParty, editQueue, getPartyLink, getQueuePage, hasMusicActions, partyDisplays } from '../music';

/** A hass whose websocket records each call and answers with `answer`. */
function fakeHass(answer: unknown, withActions = true) {
	const calls: Record<string, unknown>[] = [];
	const hass = {
		callWS: async (msg: Record<string, unknown>) => {
			calls.push(msg);
			return { response: answer };
		},
		services: withActions ? { music_assistant: { get_queue_items: {} } } : { music_assistant: {} },
	} as unknown as HomeAssistant;
	return { hass, calls };
}

const speaker = { entityId: 'media_player.kitchen', queueId: 'q1' };

describe("the fork's actions (raine-works/ha-music-assistant)", () => {
	it('are used only when Music Assistant has them', () => {
		expect(hasMusicActions(fakeHass(null).hass)).toBe(true);
		expect(hasMusicActions(fakeHass(null, false).hass)).toBe(false);
	});

	it('reads the queue with get_queue_items, by the speaker', async () => {
		const { hass, calls } = fakeHass({
			'media_player.kitchen': { current_index: 2, total: 9, offset: 2, items: [{ id: 'a', index: 2, name: 'Song' }] },
		});
		const page = await getQueuePage(hass, speaker, { limit: 5 });
		expect(calls[0]).toMatchObject({
			domain: 'music_assistant',
			service: 'get_queue_items',
			service_data: { limit: 5 },
			target: { entity_id: 'media_player.kitchen' },
		});
		expect(page?.entries[0]?.name).toBe('Song');
	});

	it('without them, the queue and the Party link are not there', async () => {
		const { hass, calls } = fakeHass(undefined, false);
		expect(await getQueuePage(hass, speaker)).toBeUndefined();
		expect(await getPartyLink(hass)).toEqual({ url: null, status: 0 });
		await expect(editQueue(hass, speaker, 'a', { action: 'play' })).rejects.toThrow();
		expect(calls).toEqual([]);
	});

	it('edits the queue with edit_queue; resume names no item', async () => {
		const { hass, calls } = fakeHass(undefined);
		await editQueue(hass, speaker, 'a', { action: 'move', shift: -1 });
		await editQueue(hass, speaker, '', { action: 'resume' });
		expect(calls[0]).toMatchObject({
			service: 'edit_queue',
			service_data: { entity_id: 'media_player.kitchen', action: 'move', item: 'a', shift: -1 },
		});
		expect(calls[1]?.service_data).toEqual({ entity_id: 'media_player.kitchen', action: 'resume' });
	});

	it('reads the Party link', async () => {
		expect(await getPartyLink(fakeHass({ url: 'https://ma/?join=X' }).hass)).toEqual({
			url: 'https://ma/?join=X',
			status: 200,
		});
		expect((await getPartyLink(fakeHass({ url: null }).hass)).url).toBeNull();
	});
});

describe('the Party Dashboard on TVs', () => {
	const state = (id: string, name: string, deviceClass: string, s = 'idle', content?: string) =>
		({
			entity_id: id,
			state: s,
			attributes: { friendly_name: name, device_class: deviceClass, media_content_id: content },
		}) as unknown as HassEntity;
	const states = {
		'media_player.kai_s_tv': state('media_player.kai_s_tv', "Kai's TV", 'tv', 'playing', 'party'),
		'media_player.home_theater_tv': state('media_player.home_theater_tv', 'Home Theater TV', 'tv'),
		'media_player.library_wiim': state('media_player.library_wiim', 'Library WiiM', 'tv'),
		'media_player.kitchen': state('media_player.kitchen', 'Kitchen', 'speaker'),
	};
	const entities = Object.fromEntries(
		Object.keys(states).map((id) => [id, { entity_id: id, platform: 'music_assistant' }]),
	) as unknown as HomeAssistant['entities'];

	it("lists Music Assistant's displays named as the house's TVs, and which show it", () => {
		expect(partyDisplays({ states, entities }, new Set(["Kai's TV", 'Home Theater TV']))).toEqual([
			{ id: 'media_player.home_theater_tv', name: 'Home Theater TV', showing: false },
			{ id: 'media_player.kai_s_tv', name: "Kai's TV", showing: true },
		]);
	});

	it("leaves out a display that's unavailable", () => {
		const offline = {
			...states,
			'media_player.kai_s_tv': state('media_player.kai_s_tv', "Kai's TV", 'tv', 'unavailable'),
		};
		expect(partyDisplays({ states: offline, entities }, new Set(["Kai's TV", 'Home Theater TV']))).toEqual([
			{ id: 'media_player.home_theater_tv', name: 'Home Theater TV', showing: false },
		]);
	});

	it('shows it with play_media and takes it off with turn_off', async () => {
		const { hass, calls } = fakeHass(undefined);
		await castParty(hass, 'media_player.kai_s_tv', true);
		await castParty(hass, 'media_player.kai_s_tv', false);
		expect(calls[0]).toMatchObject({
			domain: 'media_player',
			service: 'play_media',
			service_data: { media_content_type: 'dashboard', media_content_id: 'party' },
		});
		expect(calls[1]).toMatchObject({ domain: 'media_player', service: 'turn_off' });
	});
});
