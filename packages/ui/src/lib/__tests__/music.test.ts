import { describe, expect, it } from 'bun:test';
import type { HassEntity } from '../../types/homeassistant';
import {
	appendEpisodes,
	applyGroupVolume,
	applyQueueEdit,
	byArtist,
	currentPosition,
	defaultPlayer,
	discoverMusicPlayers,
	episodeItem,
	episodeProgress,
	findMusicConfigEntry,
	formatEpisodeDate,
	formatEpisodeLength,
	formatTrackTime,
	fullSizeCover,
	groupFollowers,
	groupVolume,
	hasEnded,
	hasMedia,
	hasTrack,
	isNowPlaying,
	isPaused,
	isSpeaker,
	joinableSpeakers,
	liveInputs,
	MEDIA_FEATURE,
	mediaKindOf,
	nextRepeat,
	type QueueEntry,
	queueIsCurrent,
	resumePosition,
	speakerNames,
	supports,
	toEpisodePage,
	toMediaItems,
	toMusicPlayer,
	toQueuePage,
	toQueueSummary,
	toSearchResults,
	toTracks,
} from '../music';
import { useFixtureHouse } from './house-fixture';

const player = (entity_id: string, state: string, attributes: HassEntity['attributes'] = {}): HassEntity => ({
	entity_id,
	state,
	attributes: { mass_player_type: 'player', ...attributes },
	last_changed: '',
	last_updated: '',
});

describe('music players', () => {
	it('discovers Music Assistant players only, by name', () => {
		const players = discoverMusicPlayers({
			'media_player.kitchen': player('media_player.kitchen', 'idle', { friendly_name: 'Kitchen' }),
			'media_player.library': player('media_player.library', 'playing', { friendly_name: 'Library' }),
			'media_player.basement': player('media_player.basement', 'off', { friendly_name: 'Basement' }),
			'media_player.tv': {
				...player('media_player.tv', 'on', { friendly_name: 'TV' }),
				attributes: { friendly_name: 'TV' },
			},
		});
		expect(players.map((p) => p.name)).toEqual(['Basement', 'Kitchen', 'Library']);
	});

	it('reads now playing, volume, shuffle and repeat', () => {
		const p = toMusicPlayer(
			player('media_player.library', 'playing', {
				friendly_name: 'Library',
				media_title: 'Love Letter',
				media_artist: 'Knox',
				media_album_name: 'Love Letter',
				media_duration: 158,
				volume_level: 0.63,
				is_volume_muted: false,
				shuffle: true,
				repeat: 'one',
				entity_picture: 'https://music/art.jpg',
				entity_picture_local: '/api/media_player_proxy/media_player.library?token=x',
				supported_features: MEDIA_FEATURE.PAUSE | MEDIA_FEATURE.SEEK,
			}),
		);
		expect(p).toMatchObject({
			state: 'playing',
			title: 'Love Letter',
			artist: 'Knox',
			duration: 158,
			volume: 63,
			shuffle: true,
			repeat: 'one',
			artwork: '/api/media_player_proxy/media_player.library?token=x',
			groupMembers: [],
		});
		expect(supports(p, MEDIA_FEATURE.SEEK)).toBe(true);
		expect(supports(p, MEDIA_FEATURE.GROUPING)).toBe(false);
	});

	it('treats unknown states as unavailable', () => {
		expect(toMusicPlayer(player('media_player.x', 'unknown')).state).toBe('unavailable');
	});

	it('marks group followers with their leader', () => {
		const members = ['media_player.kitchen', 'media_player.library'];
		expect(toMusicPlayer(player('media_player.kitchen', 'playing', { group_members: members })).leader).toBeUndefined();
		expect(toMusicPlayer(player('media_player.library', 'playing', { group_members: members })).leader).toBe(
			'media_player.kitchen',
		);
		// A group of one is no group
		expect(
			toMusicPlayer(player('media_player.kitchen', 'idle', { group_members: ['media_player.kitchen'] })).groupMembers,
		).toEqual([]);
	});

	it('advances the position while playing, capped at the duration', () => {
		const at = Date.parse('2026-10-18T20:00:00Z');
		const base = { media_position: 30, media_position_updated_at: '2026-10-18T20:00:00Z', media_duration: 40 };
		expect(currentPosition(toMusicPlayer(player('media_player.a', 'playing', base)), at + 5000)).toBe(35);
		expect(currentPosition(toMusicPlayer(player('media_player.a', 'paused', base)), at + 5000)).toBe(30);
		expect(currentPosition(toMusicPlayer(player('media_player.a', 'playing', base)), at + 60_000)).toBe(40);
	});

	it('picks the player to show first', () => {
		const players = [
			toMusicPlayer(player('media_player.basement', 'idle')),
			toMusicPlayer(
				player('media_player.kitchen', 'playing', {
					media_title: 'x',
					group_members: ['media_player.library', 'media_player.kitchen'],
				}),
			),
			toMusicPlayer(player('media_player.library', 'playing', { media_title: 'x' })),
		];
		expect(defaultPlayer(players, 'media_player.basement')).toBe('media_player.basement');
		// A playing follower shows its group's leader
		expect(defaultPlayer(players)).toBe('media_player.library');
		expect(defaultPlayer([players[0]])).toBe('media_player.basement');
		expect(defaultPlayer([])).toBeUndefined();
	});

	it('formats track times and cycles repeat', () => {
		expect(formatTrackTime(187)).toBe('3:07');
		expect(formatTrackTime(3723)).toBe('1:02:03');
		expect(formatTrackTime(undefined)).toBe('0:00');
		expect(nextRepeat('off')).toBe('all');
		expect(nextRepeat('all')).toBe('one');
		expect(nextRepeat('one')).toBe('off');
	});
});

describe('Music Assistant responses', () => {
	const track = {
		media_type: 'track',
		uri: 'library://track/220',
		name: 'Love Letter',
		image: 'https://img/1.jpg',
		artists: [{ name: 'Knox' }],
		album: { name: 'Love Letter', image: 'https://img/album.jpg' },
	};

	it('maps search results, dropping unknown types and items without a URI', () => {
		const results = toSearchResults({
			tracks: [track, { media_type: 'track', name: 'No uri' }],
			playlists: [{ media_type: 'playlist', uri: 'library://playlist/12', name: 'Road Trippin', image: null }],
			audiobooks: [{ media_type: 'audiobook', uri: 'x', name: 'Book' }],
		});
		expect(results.tracks).toEqual([
			{
				mediaType: 'track',
				uri: 'library://track/220',
				name: 'Love Letter',
				subtitle: 'Knox',
				artists: ['Knox'],
				image: 'https://img/1.jpg',
			},
		]);
		expect(results.playlists[0]).toMatchObject({ name: 'Road Trippin', image: undefined, subtitle: undefined });
		expect(results.artists).toEqual([]);
		expect(toMediaItems(undefined)).toEqual([]);
	});

	it('summarizes a queue (current and next only)', () => {
		const summary = toQueueSummary(
			{
				'media_player.library': {
					items: 64,
					current_item: { name: 'Knox - Love Letter', duration: 158, media_item: track },
					next_item: { name: 'The Summer Set - Teenagers', duration: 183, media_item: null },
				},
			},
			'media_player.library',
		);
		expect(summary).toEqual({
			count: 64,
			current: { name: 'Love Letter', artist: 'Knox', image: 'https://img/1.jpg', duration: 158 },
			next: { name: 'The Summer Set - Teenagers', artist: undefined, image: undefined, duration: 183 },
		});
		expect(toQueueSummary({}, 'media_player.library')).toBeUndefined();
	});

	it('tells a queue that has caught up with the playing track from one that has not', () => {
		const queue = (name: string) => ({ count: 2, current: { name } });
		expect(queueIsCurrent(queue('The Quiet'), 'The Quiet')).toBe(true);
		expect(queueIsCurrent(queue('We The Kings - The Quiet'), 'The Quiet')).toBe(true);
		expect(queueIsCurrent(queue('Check Yes Juliet'), 'The Quiet')).toBe(false);
		expect(queueIsCurrent(undefined, 'The Quiet')).toBe(true);
		// Current already moved on, next not yet: the same queue item twice
		const moria = { id: 'a', name: 'Moria' };
		expect(queueIsCurrent({ count: 9, current: moria, next: moria }, 'Moria')).toBe(false);
		expect(queueIsCurrent({ count: 9, current: moria, next: { id: 'b', name: 'This Quiet Violence' } }, 'Moria')).toBe(
			true,
		);
	});

	it("links the current item's artists and album (when Music Assistant gives their URIs)", () => {
		const summary = toQueueSummary(
			{
				'media_player.kitchen': {
					items: 1,
					current_item: {
						name: 'BØRNS - Dug My Heart',
						media_item: {
							...track,
							name: 'Dug My Heart',
							artists: [{ name: 'BØRNS', uri: 'spotify://artist/1', image: null }, { name: 'No uri' }],
							album: {
								name: 'Dopamine',
								uri: 'library://album/5',
								image: 'https://img/album.jpg',
								artists: [{ name: 'BØRNS', uri: 'library://artist/28' }],
							},
						},
					},
				},
			},
			'media_player.kitchen',
		);
		expect(summary?.current?.artistItems).toEqual([
			{ mediaType: 'artist', uri: 'spotify://artist/1', name: 'BØRNS', image: undefined },
		]);
		expect(summary?.current?.albumItem).toEqual({
			mediaType: 'album',
			uri: 'library://album/5',
			name: 'Dopamine',
			subtitle: 'BØRNS',
			artists: ['BØRNS'],
			image: 'https://img/album.jpg',
		});
	});
});

describe('groups and artists', () => {
	it('averages and shifts group volume, keeping the balance', () => {
		expect(groupVolume([40, 60])).toBe(50);
		expect(groupVolume([])).toBe(0);
		expect(applyGroupVolume([40, 60], 60)).toEqual([50, 70]);
		expect(applyGroupVolume([90, 60], 90)).toEqual([100, 75]);
		expect(applyGroupVolume([40, 60], 0)).toEqual([0, 0]);
	});

	it('lists every group follower (the speakers to unjoin to split all groups)', () => {
		const group = ['media_player.library', 'media_player.kitchen', 'media_player.ensuite'];
		const pair = ['media_player.basement', 'media_player.left'];
		const players = [...group, ...pair, 'media_player.right'].map((id) =>
			toMusicPlayer(
				player(id, 'playing', { group_members: group.includes(id) ? group : pair.includes(id) ? pair : [] }),
			),
		);
		expect(groupFollowers(players)).toEqual(['media_player.kitchen', 'media_player.ensuite', 'media_player.left']);
		expect(groupFollowers([])).toEqual([]);
	});

	it('joins every other available speaker that can group and is not in the group yet', () => {
		const grouping = { supported_features: MEDIA_FEATURE.GROUPING };
		const members = ['media_player.library', 'media_player.kitchen'];
		const library = toMusicPlayer(player('media_player.library', 'playing', { ...grouping, group_members: members }));
		const players = [
			library,
			toMusicPlayer(player('media_player.kitchen', 'playing', { ...grouping, group_members: members })),
			toMusicPlayer(player('media_player.basement', 'idle', grouping)),
			toMusicPlayer(
				player('media_player.ensuite', 'playing', {
					...grouping,
					group_members: ['media_player.ensuite', 'media_player.left'],
				}),
			),
			toMusicPlayer(
				player('media_player.left', 'playing', {
					...grouping,
					group_members: ['media_player.ensuite', 'media_player.left'],
				}),
			),
			toMusicPlayer(player('media_player.garage', 'unavailable', grouping)),
			toMusicPlayer(player('media_player.cast', 'idle')),
		];
		expect(joinableSpeakers(library, players)).toEqual([
			'media_player.basement',
			'media_player.ensuite',
			'media_player.left',
		]);
		expect(joinableSpeakers(toMusicPlayer(player('media_player.cast', 'idle')), players)).toEqual([]);
	});

	it('names the speakers a player is playing on', () => {
		const members = ['media_player.library', 'media_player.kitchen'];
		const players = [
			toMusicPlayer(player('media_player.library', 'playing', { friendly_name: 'Library', group_members: members })),
			toMusicPlayer(player('media_player.kitchen', 'playing', { friendly_name: 'Kitchen', group_members: members })),
			toMusicPlayer(player('media_player.basement', 'idle', { friendly_name: 'Basement' })),
		];
		expect(speakerNames(players[0], players)).toBe('Library + Kitchen');
		expect(speakerNames(players[2], players)).toBe('Basement');
	});

	it('keeps only results by exactly that artist', () => {
		const items = toMediaItems([
			{ media_type: 'album', uri: 'a', name: 'My Midwest Best', artists: [{ name: 'Knox' }] },
			{ media_type: 'album', uri: 'b', name: 'Beach Boy - EP', artists: [{ name: 'Knox Hamilton' }] },
			{ media_type: 'track', uri: 'c', name: 'HAPPY HOUR', artists: [{ name: 'HARDY' }, { name: 'knox' }] },
		]);
		expect(byArtist(items, 'Knox').map((i) => i.uri)).toEqual(['a', 'c']);
	});
});

describe('paused speakers', () => {
	const at = Date.parse('2026-10-19T08:00:00Z');
	const idleWithTrack = (minutesAgo: number) =>
		toMusicPlayer({
			...player('media_player.library', 'idle', { media_title: 'Love Letter' }),
			last_changed: new Date(at - minutesAgo * 60_000).toISOString(),
		});

	it('counts idle with a track as paused (how WiiM and Sonos report a pause)', () => {
		expect(hasMedia(idleWithTrack(5))).toBe(true);
		expect(isPaused(idleWithTrack(5))).toBe(true);
		expect(hasMedia(toMusicPlayer(player('media_player.library', 'idle')))).toBe(false);
		expect(hasMedia(toMusicPlayer(player('media_player.library', 'off', { media_title: 'x' })))).toBe(false);
		expect(isPaused(toMusicPlayer(player('media_player.library', 'playing', { media_title: 'x' })))).toBe(false);
	});

	it('counts a track played to its end as finished, not paused', () => {
		const at = (state: string, position: number) =>
			toMusicPlayer(
				player('media_player.ensuite', state, {
					media_title: 'Daily Brief',
					media_duration: 107,
					media_position: position,
				}),
			);
		expect(hasEnded(at('idle', 106))).toBe(true);
		expect(hasMedia(at('idle', 106))).toBe(false);
		expect(hasMedia(at('idle', 40))).toBe(true);
		expect(hasEnded(at('playing', 107))).toBe(false);
		// Nothing to tell from without a length or a position (a stream, a live input)
		expect(
			hasEnded(toMusicPlayer(player('media_player.ensuite', 'idle', { media_title: 'Radio', media_position: 900 }))),
		).toBe(false);
	});

	it('keeps a paused speaker on the dashboard for an hour', () => {
		expect(isNowPlaying(idleWithTrack(5), at)).toBe(true);
		expect(isNowPlaying(idleWithTrack(90), at)).toBe(false);
		expect(isNowPlaying(toMusicPlayer(player('media_player.library', 'playing', { media_title: 'x' })), at)).toBe(true);
	});
});

describe('moving a track to another speaker', () => {
	const at = Date.parse('2026-10-19T08:00:00Z');
	const point = { title: 'Love Letter', position: 60, at, duration: 158, playing: true };

	it('picks up where it was, plus the time the move took while playing', () => {
		expect(resumePosition(point, at + 2500)).toBe(63);
		expect(resumePosition({ ...point, playing: false }, at + 2500)).toBe(60);
	});

	it('skips live streams, the very start and the end of a track', () => {
		expect(resumePosition({ ...point, duration: undefined }, at)).toBeUndefined();
		expect(resumePosition({ ...point, position: 0.4, playing: false }, at)).toBeUndefined();
		expect(resumePosition({ ...point, position: 156 }, at)).toBeUndefined();
	});
});

describe('which players are speakers', () => {
	const registries = {
		entities: {
			'media_player.kitchen': { entity_id: 'media_player.kitchen', device_id: 'sonos' },
			'media_player.web_chrome_on_mac_2': { entity_id: 'media_player.web_chrome_on_mac_2', device_id: 'chrome' },
			'media_player.garage': { entity_id: 'media_player.garage', device_id: 'sonos2', hidden: true },
		},
		devices: {
			sonos: { id: 'sonos', manufacturer: 'SONOS', model: 'Era 100' },
			sonos2: { id: 'sonos2', manufacturer: 'SONOS', model: 'Era 100' },
			chrome: { id: 'chrome', manufacturer: 'Google Inc.', model: 'Web Player' },
		},
	};

	it("leaves out Music Assistant's browser players and hidden entities", () => {
		expect(isSpeaker('media_player.kitchen', registries)).toBe(true);
		expect(isSpeaker('media_player.web_chrome_on_mac_2', registries)).toBe(false);
		expect(isSpeaker('media_player.garage', registries)).toBe(false);
		// Without registries (or a registry entry) everything is listed
		expect(isSpeaker('media_player.kitchen', undefined)).toBe(true);
		expect(isSpeaker('media_player.unknown', registries)).toBe(true);
	});

	it('discovers only speakers', () => {
		const states = Object.fromEntries(
			['media_player.kitchen', 'media_player.web_chrome_on_mac_2', 'media_player.garage'].map((id) => [
				id,
				player(id, 'idle'),
			]),
		);
		expect(discoverMusicPlayers(states, registries).map((p) => p.entityId)).toEqual(['media_player.kitchen']);
	});
});

describe('live inputs', () => {
	useFixtureHouse();
	const turntable = liveInputs()[0];
	const all = Object.values(MEDIA_FEATURE).reduce((sum, bit) => sum | bit, 0);
	const live = (uri: string) =>
		toMusicPlayer(
			player('media_player.kitchen', 'playing', {
				media_content_id: uri,
				media_title: 'Sendspin Source (A1S Sendspin Source)',
				supported_features: all,
			}),
		);

	it('names a known input and drops what a line-in cannot do', () => {
		const p = live(turntable.uri);
		expect(p.liveInput).toEqual(turntable);
		expect(p.title).toBe('Turntable');
		for (const feature of [
			'SEEK',
			'NEXT_TRACK',
			'PREVIOUS_TRACK',
			'SHUFFLE_SET',
			'REPEAT_SET',
			'CLEAR_PLAYLIST',
		] as const)
			expect(supports(p, MEDIA_FEATURE[feature])).toBe(false);
		expect(supports(p, MEDIA_FEATURE.VOLUME_SET)).toBe(true);
		expect(hasMedia(p)).toBe(true);
	});

	it("keeps Music Assistant's name for an input it doesn't know", () => {
		const p = live('sendspin_source://audio_source/other');
		expect(p.liveInput?.name).toBe('Sendspin Source (A1S Sendspin Source)');
		expect(p.title).toBe('Sendspin Source (A1S Sendspin Source)');
	});

	it('leaves queue playback alone', () => {
		const p = live('spotify--x://track/1');
		expect(p.liveInput).toBeUndefined();
		expect(p.features).toBe(all);
	});
});

describe('TV audio', () => {
	const all = Object.values(MEDIA_FEATURE).reduce((sum, bit) => sum | bit, 0);
	// The Home Theater Sonos on its TV input, as Music Assistant reports it
	const tv = (attrs: Record<string, unknown> = {}) =>
		toMusicPlayer(
			player('media_player.home_theater', 'playing', {
				source: 'TV',
				app_id: 'tv',
				media_title: 'TV Audio',
				media_content_id: 'homeTheater-input',
				active_queue: null,
				supported_features: all,
				...attrs,
			}),
		);

	it('keeps only the volume, mute and joining a group', () => {
		const p = tv();
		expect(p.tvAudio).toBe(true);
		expect(p.title).toBe('TV audio');
		expect(p.features).toBe(MEDIA_FEATURE.VOLUME_SET | MEDIA_FEATURE.VOLUME_MUTE | MEDIA_FEATURE.GROUPING);
		expect(hasMedia(p)).toBe(true);
	});

	it('never counts as now playing or the player to show first', () => {
		const p = tv();
		expect(isNowPlaying(p)).toBe(false);
		const kitchen = toMusicPlayer(player('media_player.kitchen', 'idle', { media_title: 'Song' }));
		expect(defaultPlayer([p, kitchen])).toBe('media_player.kitchen');
		expect(defaultPlayer([p, kitchen], 'media_player.home_theater')).toBe('media_player.home_theater');
	});

	it('never joins a group in bulk, nor leads one', () => {
		const kitchen = toMusicPlayer(player('media_player.kitchen', 'playing', { supported_features: all }));
		expect(joinableSpeakers(kitchen, [kitchen, tv()])).toEqual([]);
		expect(joinableSpeakers(tv(), [kitchen, tv()])).toEqual([]);
	});

	it("isn't the speaker's own queue playing", () => {
		const p = tv({ source: 'Music Assistant Queue', app_id: 'music_assistant', active_queue: 'RINCON_1' });
		expect(p.tvAudio).toBe(false);
		expect(p.features).toBe(all);
	});
});

describe('media kinds and podcasts', () => {
	it('tells music, radio and podcasts apart by type or URI', () => {
		expect(mediaKindOf('radio')).toBe('radio');
		expect(mediaKindOf('library://radio/1')).toBe('radio');
		expect(mediaKindOf('podcast')).toBe('podcast');
		expect(mediaKindOf('spotify--x://podcast_episode/abc')).toBe('podcast');
		expect(mediaKindOf('library://podcast/42')).toBe('podcast');
		expect(mediaKindOf('spotify--x://track/1')).toBe('music');
		expect(mediaKindOf(undefined)).toBe('music');
		expect(
			mediaKindOf('builtin://track/https://ha.example.com/local/daily_brief/daily-brief-2026-10-20-a470b64daa6c.mp3'),
		).toBe('brief');
	});

	it('knows what a speaker plays, for its placeholder', () => {
		expect(toMusicPlayer(player('media_player.a', 'playing', { media_content_id: 'library://radio/1' })).kind).toBe(
			'radio',
		);
		expect(toMusicPlayer(player('media_player.a', 'idle')).kind).toBe('music');
	});

	it('keeps podcasts from the library and search', () => {
		const podcast = {
			media_type: 'podcast',
			uri: 'library://podcast/42',
			name: 'Darknet Diaries',
			image: 'https://i.scdn.co/x',
		};
		expect(toMediaItems([podcast])).toMatchObject([
			{ mediaType: 'podcast', uri: 'library://podcast/42', name: 'Darknet Diaries', image: 'https://i.scdn.co/x' },
		]);
		expect(toSearchResults({ podcasts: [podcast] }).podcasts.map((p) => p.name)).toEqual(['Darknet Diaries']);
	});
});

describe('toTracks', () => {
	const album = {
		title: 'A Bad Girl In Harlem',
		children: [
			{ title: "New Politics - Tonight You're Perfect", media_content_id: 'library://track/400', media_class: 'track' },
			{ title: 'New Politics - Harlem - Live', media_content_id: 'library://track/408', media_class: 'track' },
			{ title: 'Guest Star - Duet', media_content_id: 'library://track/409', media_class: 'track' },
			{ title: 'Booklet', media_content_id: 'library://x', media_class: 'directory' },
		],
	};

	it('lists the tracks in order, splitting off the artist', () => {
		expect(toTracks(album, 'New Politics')).toEqual([
			{
				mediaType: 'track',
				uri: 'library://track/400',
				name: "Tonight You're Perfect",
				subtitle: 'New Politics',
				artists: ['New Politics'],
				image: undefined,
			},
			{
				mediaType: 'track',
				uri: 'library://track/408',
				name: 'Harlem - Live',
				subtitle: 'New Politics',
				artists: ['New Politics'],
				image: undefined,
			},
			{
				mediaType: 'track',
				uri: 'library://track/409',
				name: 'Duet',
				subtitle: 'Guest Star',
				artists: ['Guest Star'],
				image: undefined,
			},
		]);
	});

	it("splits a playlist's artists at the first ' - ' and keeps each track's cover", () => {
		const playlist = {
			title: 'Class of 2011',
			children: [
				{
					title: 'My Chemical Romance - Blood - Hidden Track',
					media_content_id: 'spotify://track/1',
					media_class: 'track',
					thumbnail: 'https://i.scdn.co/a',
				},
			],
		};
		expect(toTracks(playlist)).toEqual([
			{
				mediaType: 'track',
				uri: 'spotify://track/1',
				name: 'Blood - Hidden Track',
				subtitle: 'My Chemical Romance',
				artists: ['My Chemical Romance'],
				image: 'https://i.scdn.co/a',
			},
		]);
	});

	it('copes with no artist and no children', () => {
		expect(toTracks({ children: [{ title: 'Intro', media_content_id: 'a://1', media_class: 'track' }] })).toEqual([
			{ mediaType: 'track', uri: 'a://1', name: 'Intro', subtitle: undefined, artists: undefined, image: undefined },
		]);
		expect(toTracks(undefined)).toEqual([]);
	});
});

describe('hasTrack', () => {
	const tracks = [
		{ mediaType: 'track' as const, uri: 'spotify://track/1', name: 'Monster Mash' },
		{ mediaType: 'track' as const, uri: 'spotify://track/2', name: 'Thriller' },
	];

	it('finds the playing track by URI, else by title', () => {
		expect(hasTrack(tracks, { contentId: 'spotify://track/2', title: 'Something else' })).toBe(true);
		expect(hasTrack(tracks, { contentId: 'library://track/9', title: 'Monster Mash' })).toBe(true);
		expect(hasTrack(tracks, { contentId: 'library://track/9', title: 'Dracula' })).toBe(false);
		expect(hasTrack(tracks, {})).toBe(false);
	});
});

describe('toQueuePage', () => {
	it('reads the page, the position and the playlist it came from', () => {
		const page = toQueuePage({
			status: 200,
			current_index: 6,
			total: 65,
			offset: 6,
			items: [
				{ id: 'a', index: 6, name: 'The Hymn', artist: 'FLOYA', duration: 188, image: 'https://i.scdn.co/x' },
				{ id: '', name: 'No id' },
				{ id: 'b', index: 7, name: 'Once In A Lifetime', artist: '', duration: 0, image: null },
			],
			source: { name: 'Road Trippin', uri: 'library://playlist/12', media_type: 'playlist', image: null },
		});
		expect(page).toMatchObject({ currentIndex: 6, total: 65, offset: 6 });
		expect(page?.entries.map((e) => [e.id, e.artist, e.duration, e.image])).toEqual([
			['a', 'FLOYA', 188, 'https://i.scdn.co/x'],
			['b', undefined, undefined, undefined],
		]);
		expect(page?.source).toEqual({
			mediaType: 'playlist',
			uri: 'library://playlist/12',
			name: 'Road Trippin',
			image: undefined,
		});
	});

	it('is nothing when Music Assistant refused', () => {
		expect(toQueuePage({ status: 401 })).toBeUndefined();
		expect(toQueuePage(undefined)).toBeUndefined();
	});
});

describe('applyQueueEdit', () => {
	const entries: QueueEntry[] = ['now', 'b', 'c', 'd'].map((id, i) => ({ id, index: 10 + i, name: id }));
	const ids = (list: QueueEntry[]) => list.map((e) => e.id);

	it('moves an entry up, down or to next up, renumbering', () => {
		expect(ids(applyQueueEdit(entries, 'c', { action: 'move', shift: -1 }, 10))).toEqual(['now', 'c', 'b', 'd']);
		expect(ids(applyQueueEdit(entries, 'b', { action: 'move', shift: 1 }, 10))).toEqual(['now', 'c', 'b', 'd']);
		expect(ids(applyQueueEdit(entries, 'd', { action: 'move', shift: 0 }, 10))).toEqual(['now', 'd', 'b', 'c']);
		expect(applyQueueEdit(entries, 'd', { action: 'move', shift: 0 }, 10).map((e) => e.index)).toEqual([
			10, 11, 12, 13,
		]);
	});

	it('never moves above the playing one, and removes', () => {
		expect(ids(applyQueueEdit(entries, 'b', { action: 'move', shift: -1 }, 10))).toEqual(['now', 'b', 'c', 'd']);
		expect(ids(applyQueueEdit(entries, 'c', { action: 'remove' }, 10))).toEqual(['now', 'b', 'd']);
	});
});

describe('fullSizeCover', () => {
	it("asks for Spotify's Liked Songs art at 640px, leaving other covers alone", () => {
		expect(fullSizeCover('https://misc.scdn.co/liked-songs/liked-songs-64.png')).toBe(
			'https://misc.scdn.co/liked-songs/liked-songs-640.png',
		);
		expect(fullSizeCover('https://i.scdn.co/image/ab67616d0000b273')).toBe('https://i.scdn.co/image/ab67616d0000b273');
		expect(fullSizeCover(undefined)).toBeUndefined();
	});
});

describe('podcast episodes', () => {
	it('reads a page of episodes', () => {
		const page = toEpisodePage({
			status: 200,
			total: 312,
			offset: 0,
			episodes: [
				{
					uri: 'spotify--x://podcast_episode/a',
					name: 'EP 160: Hackers',
					released: '2026-10-21T00:00:00+00:00',
					duration: 3720,
					resume: 600,
					played: false,
					description: 'A story.',
					image: null,
				},
				{ uri: '', name: 'No uri' },
				{ uri: 'spotify--x://podcast_episode/b', name: 'EP 159', duration: 0, resume: 0, played: true },
			],
		});
		expect(page).toMatchObject({ total: 312, offset: 0 });
		expect(page?.episodes.map((e) => [e.name, e.duration, e.resume, e.played, e.image])).toEqual([
			['EP 160: Hackers', 3720, 600, false, undefined],
			['EP 159', undefined, 0, true, undefined],
		]);
	});

	it('adds the next page without episodes already shown', () => {
		const episode = (uri: string) => ({ uri, name: uri, resume: 0, played: false });
		const shown = { total: 4, offset: 0, episodes: [episode('a'), episode('b')] };
		const next = { total: 5, offset: 2, episodes: [episode('b'), episode('c')] };
		expect(appendEpisodes(shown, next)).toEqual({
			total: 5,
			offset: 0,
			episodes: [episode('a'), episode('b'), episode('c')],
		});
	});

	it('is nothing when Music Assistant refused', () => {
		expect(toEpisodePage({ status: 400, episodes: [] })).toBeUndefined();
		expect(toEpisodePage(undefined)).toBeUndefined();
	});

	it("plays as an episode with the podcast's cover when it has none", () => {
		const podcast = { mediaType: 'podcast' as const, uri: 'library://podcast/42', name: 'Darknet Diaries', image: 'c' };
		const episode = { uri: 'e', name: 'EP 1', resume: 0, played: false };
		expect(episodeItem(episode, podcast)).toEqual({
			mediaType: 'podcast_episode',
			uri: 'e',
			name: 'EP 1',
			subtitle: 'Darknet Diaries',
			image: 'c',
		});
	});

	it('says how far along an episode is', () => {
		expect(episodeProgress({ duration: 3600, resume: 0, played: false })).toEqual({ label: '1 hr' });
		expect(episodeProgress({ duration: 3720, resume: 0, played: false }).label).toBe('1 hr 2 min');
		expect(episodeProgress({ duration: 2700, resume: 1980, played: false })).toEqual({
			label: '12 min left',
			progress: 1980 / 2700,
		});
		expect(episodeProgress({ duration: 2700, resume: 100, played: true })).toEqual({ label: 'Played' });
		expect(episodeProgress({ resume: 0, played: false })).toEqual({});
		expect(formatEpisodeLength(20)).toBe('1 min');
	});

	it('dates episodes, with the year only from another one', () => {
		const now = new Date(2026, 9, 27);
		expect(formatEpisodeDate('2026-10-24T12:00:00', now)).toBe('Oct 24');
		expect(formatEpisodeDate('2025-03-02T12:00:00', now)).toBe('Mar 2, 2025');
		expect(formatEpisodeDate('nope', now)).toBeUndefined();
		expect(formatEpisodeDate(undefined, now)).toBeUndefined();
	});
});

describe('findMusicConfigEntry through the integration', () => {
	it('asks the integration first (any user), else the admin-only registry lookup', async () => {
		const asked: string[] = [];
		const hass = {
			config: { components: ['raineworks_dashboards'] },
			callWS: async <T>(msg: Record<string, unknown>) => {
				asked.push(String(msg.type));
				return { config_entry_id: 'ma-entry' } as T;
			},
		};
		expect(await findMusicConfigEntry(hass, 'media_player.kitchen')).toBe('ma-entry');
		expect(asked).toEqual(['raineworks_dashboards/config_entry']);
		asked.length = 0;
		expect(await findMusicConfigEntry({ ...hass, config: {} }, 'media_player.kitchen')).toBe('ma-entry');
		expect(asked).toEqual(['config/entity_registry/get']);
	});
});
