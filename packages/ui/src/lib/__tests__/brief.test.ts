import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	briefAudioFile,
	briefPlayback,
	briefPosition,
	formatBriefEventTime,
	formatBriefUpdated,
	isBriefCurrent,
	toDailyBrief,
} from '../brief';

const sensor = (state: string, attributes: Record<string, unknown>): HassEntity => ({
	entity_id: 'sensor.daily_brief',
	state,
	attributes,
	last_changed: state,
	last_updated: state,
});

const attributes = {
	date: 'Tuesday, October 20',
	summary: "Good morning! Here's your brief.",
	weather: { condition: 'partlycloudy', temperature: 52, high: 69, low: 49, precipitation_probability: 15, unit: '°F' },
	events: [
		{ summary: 'Test Day', start: '2026-10-20', end: '2026-10-21', calendar: 'Holidays', location: '' },
		{ summary: 'Work', start: '2026-10-20T17:00:00-06:00', end: '2026-10-20T21:00:00-06:00', calendar: 'Work' },
	],
	local_news: ['Park reopens | Pioneer Park reopened after years of work.', ''],
	national_news: ['National story.'],
	world_news: [],
	x_trending: ['Everyone is posting about the eclipse.'],
};

describe('toDailyBrief', () => {
	it('reads the brief from the sensor', () => {
		const brief = toDailyBrief(sensor('2026-10-20T14:00:00+00:00', attributes));
		expect(brief?.date).toBe('Tuesday, October 20');
		expect(brief?.weather).toEqual({
			condition: 'partlycloudy',
			temperature: 52,
			high: 69,
			low: 49,
			precipitationProbability: 15,
			unit: '°F',
		});
		expect(brief?.events.map((e) => [e.summary, e.allDay, e.location])).toEqual([
			['Test Day', true, undefined],
			['Work', false, undefined],
		]);
		expect(brief?.news).toEqual({
			local: [{ headline: 'Park reopens', text: 'Pioneer Park reopened after years of work.' }],
			// A brief from before stories had headlines
			national: [{ text: 'National story.' }],
			world: [],
			trending: [{ text: 'Everyone is posting about the eclipse.' }],
		});
	});

	it('is undefined before a brief has been built', () => {
		expect(toDailyBrief(undefined)).toBeUndefined();
		expect(toDailyBrief(sensor('unknown', {}))).toBeUndefined();
	});

	it('drops weather without readings and malformed events', () => {
		const brief = toDailyBrief(
			sensor('2026-10-20T14:00:00+00:00', { ...attributes, weather: { condition: '' }, events: [{ summary: 'x' }] }),
		);
		expect(brief?.weather).toBeUndefined();
		expect(brief?.events).toEqual([]);
	});
});

describe('formatting', () => {
	const brief = toDailyBrief(sensor(new Date(2026, 9, 20, 8, 0).toISOString(), attributes));
	if (!brief) throw new Error('no brief');

	it('says when it was built', () => {
		expect(formatBriefUpdated(brief, new Date(2026, 9, 20, 12))).toBe('8:00 AM');
		expect(formatBriefUpdated(brief, new Date(2026, 9, 21, 7))).toBe('Yesterday 8:00 AM');
		expect(formatBriefUpdated(brief, new Date(2026, 9, 25))).toBe('Oct 20, 8:00 AM');
		expect(isBriefCurrent(brief, new Date(2026, 9, 20, 23))).toBe(true);
		expect(isBriefCurrent(brief, new Date(2026, 9, 21, 7))).toBe(false);
	});

	it('formats event times', () => {
		expect(formatBriefEventTime(brief.events[0])).toBe('All day');
		const start = new Date(2026, 9, 20, 17);
		const event = { summary: 'Work', start, end: new Date(2026, 9, 20, 21), allDay: false, calendar: '' };
		expect(formatBriefEventTime(event)).toBe('5:00 PM – 9:00 PM');
		expect(formatBriefEventTime({ ...event, end: start })).toBe('5:00 PM');
	});
});

const AUDIO_URL = 'https://ha.example.com/local/daily_brief/0123456789abcdef0123456789abcdef.mp3';

const speaker = (entity_id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity => ({
	entity_id,
	state,
	attributes: { mass_player_type: 'player', friendly_name: entity_id.split('.')[1], ...attributes },
	last_changed: '',
	last_updated: '',
});

describe('brief audio', () => {
	it('reads the recording, once there is one', () => {
		const brief = toDailyBrief(
			sensor('2026-10-20T14:00:00+00:00', { ...attributes, audio_url: AUDIO_URL, audio_duration: '118.27' }),
		);
		expect(brief?.audio).toEqual({ url: AUDIO_URL, duration: 118.27 });
		// A missing length isn't 0 (which read every pause as the end)
		expect(
			toDailyBrief(sensor('2026-10-20T14:00:00+00:00', { ...attributes, audio_url: AUDIO_URL, audio_duration: null }))
				?.audio,
		).toEqual({ url: AUDIO_URL, duration: undefined });
		expect(
			toDailyBrief(sensor('2026-10-20T14:00:00+00:00', { ...attributes, audio_url: null }))?.audio,
		).toBeUndefined();
	});

	it('names the file a speaker reports', () => {
		expect(briefAudioFile(`${AUDIO_URL}?token=1`)).toBe('0123456789abcdef0123456789abcdef.mp3');
	});

	it('finds the speakers playing or paused on the brief', () => {
		const audio = { url: AUDIO_URL, duration: 118 };
		const states = {
			'media_player.kitchen': speaker('media_player.kitchen', 'playing', {
				media_content_id: AUDIO_URL,
				media_position: 10,
				media_position_updated_at: '2026-10-20T14:00:00+00:00',
				media_duration: 118.3,
			}),
			// Sonos reports a pause as idle, with the media kept
			'media_player.library': speaker('media_player.library', 'idle', {
				media_title: '0123456789abcdef0123456789abcdef.mp3',
				media_position: 40,
			}),
			// Played to the end
			'media_player.ensuite': speaker('media_player.ensuite', 'idle', {
				media_content_id: AUDIO_URL,
				media_position: 117,
			}),
			'media_player.basement': speaker('media_player.basement', 'playing', { media_content_id: 'spotify://track/1' }),
			'media_player.tv': speaker('media_player.tv', 'playing', { media_content_id: AUDIO_URL, mass_player_type: null }),
		};
		const playing = briefPlayback(states, audio);
		expect(playing.map((p) => [p.entityId, p.state])).toEqual([
			['media_player.kitchen', 'playing'],
			['media_player.library', 'paused'],
		]);
		expect(briefPlayback(states, undefined)).toEqual([]);

		const kitchen = playing[0];
		expect(briefPosition(kitchen, Date.parse('2026-10-20T14:00:05+00:00'))).toBe(15);
		expect(briefPosition(kitchen, Date.parse('2026-10-20T15:00:00+00:00'))).toBe(118.3);
		expect(briefPosition(playing[1], Date.parse('2026-10-20T15:00:00+00:00'))).toBe(40);
	});

	it('a group is one entry, its leader named for the group', () => {
		const audio = { url: AUDIO_URL, duration: 118 };
		const grouped = (id: string, name: string, members: string[]) =>
			speaker(id, 'playing', { media_content_id: AUDIO_URL, group_members: members, friendly_name: name });
		const pair = ['media_player.kitchen', 'media_player.library'];
		const four = ['media_player.office', 'media_player.den', 'media_player.patio', 'media_player.garage'];
		const states = {
			'media_player.kitchen': grouped('media_player.kitchen', 'Kitchen', pair),
			'media_player.library': grouped('media_player.library', 'Library', pair),
			'media_player.office': grouped('media_player.office', 'Office', four),
			'media_player.den': grouped('media_player.den', 'Den', four),
			'media_player.patio': grouped('media_player.patio', 'Patio', four),
			'media_player.garage': grouped('media_player.garage', 'Garage', four),
		};
		expect(briefPlayback(states, audio).map((p) => [p.entityId, p.name])).toEqual([
			['media_player.kitchen', 'Kitchen + Library'],
			['media_player.office', 'Office + 3 more'],
		]);
		// A follower still shows when its leader doesn't report the recording
		const { 'media_player.kitchen': _, ...noLeader } = states;
		expect(briefPlayback(noLeader, audio).map((p) => p.entityId)).toContain('media_player.library');
	});
});
