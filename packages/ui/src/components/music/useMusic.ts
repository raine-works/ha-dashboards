/**
 * Music Assistant hooks: the speakers, the shown playback state, the remembered speaker, the config
 * entry, the controls (play, group, volume, queue) and the recent library.
 *
 * @module
 */

import { useEffect, useMemo, useRef, useState } from 'preact/compat';
import { CONFIRM_TIMEOUT_MS, useHassApi, useHassReady, useHassSelector } from '../../context/HassContext';
import { useBusy } from '../../hooks/useBusy';
import {
	applyGroupVolume,
	currentPosition,
	editQueue,
	findMusicConfigEntry,
	getLibrary,
	isMusicPlayer,
	isNowPlaying,
	type LiveInput,
	MEDIA_FEATURE,
	type MediaItem,
	type MediaType,
	type MusicPlayer,
	nextRepeat,
	type PlaybackState,
	type ResumePoint,
	resumePosition,
	supports,
	toMusicPlayer,
} from '../../lib/music';
import { readStored, writeStored } from '../../lib/storage';
import { toast } from '../ui';
import { movePlayed, rememberPlayed } from './playlistMemory';
import { confirmTvTakeover } from './TvAudioConfirm';

// Give up waiting for Home Assistant to confirm a pause after this long, or a play: Music Assistant
// can take 15s to report a speaker playing (Sonos starting a new item), though it plays sooner
const PAUSE_PENDING_MS = 8000;
const PLAY_PENDING_MS = 20_000;
// Stopping a live input (the turntable) takes Music Assistant several seconds to report
const LIVE_STOP_PENDING_MS = 20_000;
// Give up resuming a moved track if the new speaker hasn't started it by then
const TRANSFER_RESUME_TIMEOUT_MS = 20_000;
// Before a move, wait this long at most for the source speaker to report it stopped, then this
// much longer for Music Assistant to release its Spotify stream (one per account)
const SOURCE_STOP_TIMEOUT_MS = 6000;
const STREAM_RELEASE_MS = 1000;
// Show a moved queue as "Starting…" this long at most (Music Assistant waits up to 30s for a
// track's audio before skipping it)
const STARTING_TIMEOUT_MS = 45_000;
const PLAYER_KEY = 'music:player';

/**
 * Play/pause just asked for, by player, shared by every control on the page (the music dialog, the
 * header button, the mini player and the cards), so they agree until Home Assistant reports it.
 */
const pendingStates = new Map<string, { state: PlaybackState; timer: ReturnType<typeof setTimeout> }>();
// A new map on every change (memoized components compare by identity)
let pendingSnapshot: ReadonlyMap<string, PlaybackState> = new Map();
const pendingListeners = new Set<() => void>();
const notifyPending = () => {
	pendingSnapshot = new Map([...pendingStates].map(([id, entry]) => [id, entry.state]));
	for (const listener of pendingListeners) listener();
};

function clearPendingState(id: string) {
	const entry = pendingStates.get(id);
	if (!entry) return;
	clearTimeout(entry.timer);
	pendingStates.delete(id);
	notifyPending();
}

/** Show `state` for a player at once, until Home Assistant reports it (or `ms` passes). */
function setPendingState(id: string, state: PlaybackState, ms: number) {
	clearTimeout(pendingStates.get(id)?.timer);
	pendingStates.set(id, { state, timer: setTimeout(() => clearPendingState(id), ms) });
	notifyPending();
}

/** Whether a reported state is what was asked for (these speakers report a pause as idle). */
const reached = (reported: PlaybackState, target: PlaybackState) =>
	reported === target || (target === 'paused' && (reported === 'idle' || reported === 'off'));

/** The pending play/pause states (target by player), re-rendering when they change. */
function usePendingStates(): ReadonlyMap<string, PlaybackState> {
	const [snapshot, setSnapshot] = useState(pendingSnapshot);
	useEffect(() => {
		const listener = () => setSnapshot(pendingSnapshot);
		pendingListeners.add(listener);
		listener(); // a change between render and subscribing
		return () => {
			pendingListeners.delete(listener);
		};
	}, []);
	return snapshot;
}

/**
 * A speaker's state as every control shows it: a play or pause just asked for (`requestPlayPause`,
 * the music player's controls) until the speaker reports it, else what it reports.
 */
export function useShownState(entityId: string | undefined, reported: PlaybackState): PlaybackState {
	const pending = usePendingStates();
	const target = entityId ? pending.get(entityId) : undefined;
	const done = !!target && reached(reported, target);
	// Reported: the request is over, wherever it's shown (the music player's controls, which also
	// reconcile, aren't mounted while its dialog is closed), so a later change elsewhere shows
	useEffect(() => {
		if (entityId && done) clearPendingState(entityId);
	}, [entityId, done]);
	return target && !done ? target : reported;
}

/**
 * Ask a speaker to play or pause, shown that way at once by every control on the page until it
 * reports it. Explicit play / pause, not a toggle: `media_play_pause` decides from Home
 * Assistant's state, which lags a tap, so a quick second tap sent the same toggle again.
 */
export function requestPlayPause(
	callService: (domain: string, service: string, data: Record<string, unknown>) => Promise<unknown>,
	entityId: string,
	play: boolean,
) {
	setPendingState(entityId, play ? 'playing' : 'paused', play ? PLAY_PENDING_MS : PAUSE_PENDING_MS);
	return callService('media_player', play ? 'media_play' : 'media_pause', { entity_id: entityId });
}

/** Music Assistant speakers (browser players and hidden entities left out), kept live. */
export function useMusicPlayers(): MusicPlayer[] {
	// The same array (and no re-render) until a player changes
	const entities = useHassSelector(
		(hass) => (hass ? Object.values(hass.states).filter((s) => isMusicPlayer(s, hass)) : []),
		// Home Assistant replaces an entity's state object when it changes, so the same objects mean
		// nothing changed (cheaper than comparing every attribute several times a second)
		{ watch: ['media_player'], isEqual: sameItems },
	);
	return useMemo(() => entities.map(toMusicPlayer).sort((a, b) => a.name.localeCompare(b.name)), [entities]);
}

/**
 * Whether anything is playing, or paused within the hour (what the now-playing controls show): a
 * boolean, so its users re-render when it flips, not with every speaker update.
 */
export const useMusicActive = (): boolean =>
	useHassSelector(
		(hass) => !!hass && Object.values(hass.states).some((s) => isMusicPlayer(s, hass) && isActive(toMusicPlayer(s))),
		{ watch: ['media_player'] },
	);

const isActive = (player: MusicPlayer) => !player.leader && isNowPlaying(player);

const sameItems = <T>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((item, i) => item === b[i]);

/** Make `id` the speaker the player opens on next (e.g. a dashboard card handing off to a Music view). */
export const rememberMusicPlayer = (id: string) => writeStored(PLAYER_KEY, id);

const readStoredPlayer = () => readStored(PLAYER_KEY) ?? undefined;

/** The last speaker picked on this device (falls back when storage is unavailable). */
export function useStoredPlayer(): [string | undefined, (id: string) => void] {
	const [id, setId] = useState<string | undefined>(readStoredPlayer);
	const update = (next: string) => {
		setId(next);
		writeStored(PLAYER_KEY, next);
	};
	return [id, update];
}

// One lookup per page: every player dialog shares Music Assistant's config entry
let configEntryPromise: Promise<string | undefined> | null = null;

/** Music Assistant's config entry id (needed for search and the library). */
export function useMusicConfigEntry(playerEntityId?: string): string | undefined {
	const { getHass } = useHassApi();
	const [entryId, setEntryId] = useState<string | undefined>();
	const ready = useHassReady() && !!playerEntityId;
	useEffect(() => {
		const hass = getHass();
		if (!ready || !hass) return;
		if (!configEntryPromise) {
			configEntryPromise = findMusicConfigEntry(hass, playerEntityId).then((id) => {
				if (!id) configEntryPromise = null; // retry next time
				return id;
			});
		}
		let active = true;
		configEntryPromise.then((id) => active && setEntryId(id));
		return () => {
			active = false;
		};
	}, [ready]);
	return entryId;
}

/**
 * Transport, volume, grouping and playback for Music Assistant players. Play/pause shows at once
 * and reconciles when Home Assistant reports it. Commands for a group follower go to its leader.
 */
export function useMusicControls(players: MusicPlayer[]) {
	const { getHass, callService, waitFor } = useHassApi();
	// Actions still on their way (keyed by player and action; see `busyKey`), shown as spinners
	const busy = useBusy();
	const pending = usePendingStates();

	// Reconcile once Home Assistant reports the requested state
	const stateKey = players.map((p) => `${p.entityId}:${p.state}`).join('|');
	useEffect(() => {
		for (const [id, target] of pending) {
			const state = players.find((p) => p.entityId === id)?.state;
			if (state && reached(state, target)) clearPendingState(id);
		}
	}, [stateKey]);

	const byId = (id: string) => players.find((p) => p.entityId === id);
	/**
	 * Resolves once `test` holds for the player (checked against Home Assistant's state as it
	 * arrives, whether or not this component is still mounted), or after `timeoutMs`.
	 */
	const waitForPlayer = (id: string, test: (p: MusicPlayer | undefined) => boolean, timeoutMs: number) =>
		waitFor((hass) => {
			const entity = hass.states[id];
			return test(entity ? toMusicPlayer(entity) : undefined);
		}, timeoutMs);

	// Moved tracks: Music Assistant's queue transfer restarts the track, so once the new speaker
	// plays it, seek back to where it was (plus the time the move took)
	const resumes = useRef(new Map<string, ResumePoint>());
	// Speakers a queue was just moved to, until they play (when the move started, epoch ms)
	const [starting, setStarting] = useState<Record<string, number>>({});
	const stopStarting = (id: string) =>
		setStarting((prev) => {
			if (!(id in prev)) return prev;
			const rest = { ...prev };
			delete rest[id];
			return rest;
		});
	const resumeKey = players.map((p) => `${p.entityId}:${p.state}:${p.title ?? ''}`).join('|');
	useEffect(() => {
		for (const id of Object.keys(starting)) if (byId(id)?.state === 'playing') stopStarting(id);
		for (const [id, point] of resumes.current) {
			const player = byId(id);
			if (Date.now() - point.at > TRANSFER_RESUME_TIMEOUT_MS) resumes.current.delete(id);
			else if (player?.state === 'playing' && player.title === point.title) {
				resumes.current.delete(id);
				const seconds = resumePosition(point);
				if (seconds !== undefined && supports(player, MEDIA_FEATURE.SEEK))
					callService('media_player', 'media_seek', { entity_id: id, seek_position: seconds });
			}
		}
	}, [resumeKey]);

	/** Where transport and queue commands go: the group leader for a follower. */
	const target = (player: MusicPlayer) => player.leader ?? player.entityId;
	/** Once a call that started something new on the queue succeeds, remember it (a playlist) or forget the last. */
	const played = (player: MusicPlayer, item: MediaItem | undefined, call: Promise<boolean>) =>
		call.then((ok) => {
			if (ok) rememberPlayed(target(player), item);
			return ok;
		});
	/** What the player shows: a play/pause just asked for until the speaker reports it, else its state. */
	const stateOf = (player: MusicPlayer): PlaybackState => {
		const target = pending.get(player.entityId);
		return target && !reached(player.state, target) ? target : player.state;
	};

	const media = (player: MusicPlayer, service: string, data: Record<string, unknown> = {}) =>
		callService('media_player', service, { entity_id: target(player), ...data });

	/**
	 * Send a command to the player (its leader) and stay busy until it reports `done` (Music
	 * Assistant answers a call well before the speaker changes), or the confirm timeout.
	 */
	const command = (
		player: MusicPlayer,
		action: string,
		service: string,
		data: Record<string, unknown>,
		done: (p: MusicPlayer) => boolean,
	) => {
		const id = target(player);
		return busy.run(busyKey(player, action), async () => {
			await media(player, service, data);
			await waitForPlayer(id, (p) => !p || done(p), CONFIRM_TIMEOUT_MS);
		});
	};

	/** A new track (or the same one restarted), after a skip. */
	const skipped = (before: MusicPlayer) => (p: MusicPlayer) =>
		p.title !== before.title || (p.positionUpdatedAt !== before.positionUpdatedAt && (p.position ?? 0) < 5);

	/**
	 * Play a live input (the turntable) on a speaker or its group, replacing what plays there. Shows
	 * "Starting…" until it plays: Music Assistant takes a few seconds to bring the input up.
	 */
	// Music taking over a speaker that's playing its TV's sound asks first: false when the answer is no
	const tvAllows = async (player: MusicPlayer) => {
		const speaker = byId(target(player)) ?? player;
		return !speaker.tvAudio || confirmTvTakeover(speaker.name);
	};

	const playLiveInput = async (player: MusicPlayer, input: LiveInput) => {
		if (!(await tvAllows(player))) return false;
		const id = target(player);
		setStarting((prev) => ({ ...prev, [id]: Date.now() }));
		setTimeout(() => stopStarting(id), STARTING_TIMEOUT_MS);
		return withBusy(busyKey(player, `input:${input.uri}`), () =>
			withToast(
				() =>
					getHass()?.callService('music_assistant', 'play_media', {
						entity_id: target(player),
						media_id: input.uri,
						enqueue: 'play',
					}),
				[`Playing the ${input.name.toLowerCase()}`, player.name],
				`Couldn't play the ${input.name.toLowerCase()}`,
			),
		).then((ok) => {
			if (ok) rememberPlayed(id, undefined);
			else stopStarting(id);
			return ok;
		});
	};

	const playPause = (player: MusicPlayer) => {
		const id = target(player);
		const leader = byId(id) ?? player;
		// The TV's sound is the TV's to pause (the speaker ignores it)
		if (leader.tvAudio) return;
		// A live input can't pause: stop it (shown stopped at once, since Music Assistant is slow to
		// report it), and start it again from its URI
		if (leader.liveInput) {
			if (stateOf(leader) === 'playing') {
				setPendingState(id, 'paused', LIVE_STOP_PENDING_MS);
				media(leader, 'media_stop');
			} else playLiveInput(leader, leader.liveInput);
			return;
		}
		requestPlayPause(callService, id, stateOf(leader) !== 'playing');
	};

	/** busy.run for actions that report success (withToast): false when it timed out. */
	const withBusy = async (key: string, action: () => Promise<boolean>) => (await busy.run(key, action)) ?? false;

	return {
		stateOf,
		/** An action (`next`, `shuffle`, `play:<uri>`…) sent to this player is still on its way. */
		isBusy: (player: MusicPlayer, action: string) => busy.isBusy(busyKey(player, action)),
		/** The queue was just moved here and Music Assistant is still bringing it up. */
		isStarting: (player: MusicPlayer) => player.entityId in starting && player.state !== 'playing',
		target,
		playPause,
		playLiveInput,
		next: (player: MusicPlayer) => command(player, 'next', 'media_next_track', {}, skipped(player)),
		previous: (player: MusicPlayer) => command(player, 'previous', 'media_previous_track', {}, skipped(player)),
		seek: (player: MusicPlayer, seconds: number) => media(player, 'media_seek', { seek_position: seconds }),
		shuffle: (player: MusicPlayer) => {
			const shuffle = !player.shuffle;
			return command(player, 'shuffle', 'shuffle_set', { shuffle }, (p) => p.shuffle === shuffle);
		},
		repeat: (player: MusicPlayer) => {
			const repeat = nextRepeat(player.repeat);
			return command(player, 'repeat', 'repeat_set', { repeat }, (p) => p.repeat === repeat);
		},
		// Volume is per speaker, even in a group
		setVolume: (player: MusicPlayer, percent: number) =>
			callService('media_player', 'volume_set', { entity_id: player.entityId, volume_level: percent / 100 }),
		/** Mute or unmute every speaker given (a whole group at once); busy on the first (the shown one). */
		setMuted: (members: MusicPlayer[], muted: boolean) =>
			members[0] &&
			busy.run(busyKey(members[0], 'mute'), async () => {
				await Promise.all(
					members.map((member) =>
						callService('media_player', 'volume_mute', { entity_id: member.entityId, is_volume_muted: muted }),
					),
				);
				await Promise.all(
					members.map((m) => waitForPlayer(m.entityId, (p) => !p || p.muted === muted, CONFIRM_TIMEOUT_MS)),
				);
			}),
		toggleMute: (player: MusicPlayer) => {
			const muted = !player.muted;
			return busy.run(busyKey(player, 'mute'), async () => {
				await callService('media_player', 'volume_mute', { entity_id: player.entityId, is_volume_muted: muted });
				await waitForPlayer(player.entityId, (p) => !p || p.muted === muted, CONFIRM_TIMEOUT_MS);
			});
		},
		/**
		 * Add a speaker to `leader`'s group (busy on the speaker until it reports the group). One playing
		 * its TV's sound asks first.
		 */
		join: async (leader: MusicPlayer, memberId: string) => {
			const member = byId(memberId);
			if (member?.tvAudio && !(await confirmTvTakeover(member.name, { join: true }))) return;
			await busy.run(`${memberId}:group`, async () => {
				await callService('media_player', 'join', { entity_id: leader.entityId, group_members: [memberId] });
				await waitForPlayer(memberId, (p) => !p || p.leader === leader.entityId, CONFIRM_TIMEOUT_MS);
			});
		},
		unjoin: (memberId: string) =>
			busy.run(`${memberId}:group`, async () => {
				await callService('media_player', 'unjoin', { entity_id: memberId });
				await waitForPlayer(memberId, (p) => !p || p.groupMembers.length === 0, CONFIRM_TIMEOUT_MS);
			}),
		/** A speaker is joining or leaving a group. */
		isGrouping: (memberId: string) => busy.isBusy(`${memberId}:group`),
		/** Add every speaker given to `leader`'s group in one call (busy until they all report it). */
		joinAll: (leader: MusicPlayer, memberIds: string[]) =>
			withBusy('join-all', async () => {
				const joined = await withToast(
					() =>
						getHass()?.callService('media_player', 'join', { entity_id: leader.entityId, group_members: memberIds }),
					[`Playing on ${memberIds.length + 1} speakers`, undefined],
					"Couldn't join the speakers",
				);
				if (joined)
					await Promise.all(
						memberIds.map((id) => waitForPlayer(id, (p) => !p || p.leader === leader.entityId, CONFIRM_TIMEOUT_MS)),
					);
				return joined;
			}),
		isJoiningAll: () => busy.isBusy('join-all'),
		/**
		 * Split every group (one call for all followers; busy until they all report it); each group's
		 * leader keeps playing.
		 */
		ungroupAll: (followers: string[]) =>
			withBusy('ungroup-all', async () => {
				const ungrouped = await withToast(
					() => getHass()?.callService('media_player', 'unjoin', { entity_id: followers }),
					[`Ungrouped ${followers.length} ${followers.length === 1 ? 'speaker' : 'speakers'}`, undefined],
					"Couldn't ungroup the speakers",
				);
				if (ungrouped)
					await Promise.all(
						followers.map((id) => waitForPlayer(id, (p) => !p || p.groupMembers.length === 0, CONFIRM_TIMEOUT_MS)),
					);
				return ungrouped;
			}),
		isUngroupingAll: () => busy.isBusy('ungroup-all'),
		/**
		 * Move what `from` is playing to `to` (Music Assistant's queue transfer). A speaker playing its
		 * TV's sound asks first; `onConfirmed` runs once the move is going ahead.
		 */
		transfer: async (from: MusicPlayer, to: MusicPlayer, onConfirmed?: () => void) => {
			if (!(await tvAllows(to))) return false;
			onConfirmed?.();
			const source = byId(target(from)) ?? from;
			// A live input has no queue to move: start it on the new speaker, then stop the old one
			if (source.liveInput) {
				const ok = await playLiveInput(to, source.liveInput);
				if (ok) await callService('media_player', 'media_stop', { entity_id: source.entityId });
				return ok;
			}
			const position = currentPosition(source);
			setStarting((prev) => ({ ...prev, [to.entityId]: Date.now() }));
			setTimeout(() => stopStarting(to.entityId), STARTING_TIMEOUT_MS);

			// Spotify allows one stream per account: stop the source first and give Music Assistant a
			// moment to release its stream, or the new speaker times out waiting for audio and skips
			// the track (seen on Sonos with MA 2.10.7)
			if (stateOf(source) === 'playing') {
				await callService('media_player', 'media_stop', { entity_id: source.entityId });
				await waitForPlayer(source.entityId, (p) => p?.state !== 'playing', SOURCE_STOP_TIMEOUT_MS);
				await new Promise((resolve) => setTimeout(resolve, STREAM_RELEASE_MS));
			}

			// The track stood still while stopped: resume exactly where it was
			resumes.current.set(to.entityId, {
				title: source.title,
				position,
				at: Date.now(),
				duration: source.duration,
				playing: false,
			});
			const ok = await withToast(
				() =>
					getHass()?.callService('music_assistant', 'transfer_queue', {
						entity_id: to.entityId,
						source_player: source.entityId,
						auto_play: true,
					}),
				[`Moved to ${to.name}`, source.title],
				`Couldn't move the music to ${to.name}`,
			);
			if (ok) movePlayed(source.entityId, to.entityId);
			else {
				resumes.current.delete(to.entityId);
				stopStarting(to.entityId);
			}
			return ok;
		},
		/**
		 * Back to the queue after a live input (the turntable): Music Assistant plays the input as the
		 * speaker's source and leaves the queue parked, so it resumes where it was. Busy until the
		 * speaker leaves the input.
		 */
		backToQueue: (player: MusicPlayer) =>
			withBusy(busyKey(player, 'resume'), () => {
				const hass = getHass();
				const id = target(player);
				if (!hass) return Promise.resolve(false);
				return editQueue(hass, byId(id) ?? player, '', { action: 'resume' })
					.then(() => waitForPlayer(id, (p) => !p?.liveInput, STARTING_TIMEOUT_MS).then(() => true))
					.catch((err) => {
						toast.error("Couldn't go back to the queue", { description: (err as Error).message });
						return false;
					});
			}),
		/** Stop what plays (a live input too) and empty the queue: the speaker goes idle. Goes to the group leader. */
		clearPlayback: (player: MusicPlayer) =>
			withBusy(busyKey(player, 'clear'), () =>
				withToast(
					async () => {
						await getHass()?.callService('media_player', 'media_stop', { entity_id: target(player) });
						await getHass()?.callService('media_player', 'clear_playlist', { entity_id: target(player) });
					},
					[`Cleared ${(byId(target(player)) ?? player).name}`, undefined],
					`Couldn't clear ${(byId(target(player)) ?? player).name}`,
				),
			),
		/** Empty the queue (Music Assistant also stops playback). Goes to the group leader. */
		clearQueue: (player: MusicPlayer) =>
			withBusy(busyKey(player, 'clear'), () =>
				withToast(
					() => getHass()?.callService('media_player', 'clear_playlist', { entity_id: target(player) }),
					[`Cleared the ${(byId(target(player)) ?? player).name} queue`, undefined],
					"Couldn't clear the queue",
				),
			),
		/** Group volume: every speaker in the group moves by the same amount, keeping their balance. */
		setGroupVolume: (members: MusicPlayer[], percent: number) => {
			const next = applyGroupVolume(
				members.map((m) => m.volume),
				percent,
			);
			members.forEach((member, i) => {
				if (next[i] !== member.volume)
					callService('media_player', 'volume_set', { entity_id: member.entityId, volume_level: next[i] / 100 });
			});
		},
		/**
		 * Play an album's or playlist's tracks from `from` on (replacing the queue), so the rest of it
		 * follows: the tapped song always first, the rest shuffled when the speaker's shuffle is on.
		 * `list` is the album or playlist they're from.
		 */
		playTracks: async (player: MusicPlayer, tracks: MediaItem[], from: number, list?: MediaItem) =>
			(await tvAllows(player)) &&
			withBusy(busyKey(player, `play:${tracks[from]?.uri}`), () =>
				played(
					player,
					list,
					withToast(
						async () => {
							const hass = getHass();
							const id = target(player);
							// With shuffle on, Music Assistant shuffled the new queue too, so a random song played
							// first: load it in order (the tapped song first), then shuffle what follows it again
							const shuffled = (byId(id) ?? player).shuffle;
							if (shuffled) await hass?.callService('media_player', 'shuffle_set', { entity_id: id, shuffle: false });
							await hass?.callService('music_assistant', 'play_media', {
								entity_id: id,
								media_id: tracks.slice(from).map((t) => t.uri),
								media_type: 'track',
								enqueue: 'replace',
							});
							if (shuffled) await hass?.callService('media_player', 'shuffle_set', { entity_id: id, shuffle: true });
						},
						[`Playing ${tracks[from]?.name}`, player.name],
						`Couldn't play ${tracks[from]?.name}`,
					),
				),
			),
		/** Shuffle play an album (or playlist): shuffle on first, so the new queue comes in shuffled. */
		shuffleItem: async (player: MusicPlayer, item: MediaItem) =>
			(await tvAllows(player)) &&
			withBusy(busyKey(player, `shuffle:${item.uri}`), () =>
				played(
					player,
					item,
					withToast(
						async () => {
							await getHass()?.callService('media_player', 'shuffle_set', { entity_id: target(player), shuffle: true });
							await getHass()?.callService('music_assistant', 'play_media', {
								entity_id: target(player),
								media_id: item.uri,
								media_type: item.mediaType,
								enqueue: 'replace',
							});
						},
						[`Shuffling ${item.name}`, player.name],
						`Couldn't shuffle ${item.name}`,
					),
				),
			),
		/**
		 * Play now (`play`), right after the current track (`next`) or at the end of the queue (`add`).
		 * Playing an album or playlist replaces the queue: Music Assistant's `play` slots it in ahead
		 * of what was queued, which then came back once it ended.
		 */
		playItem: async (player: MusicPlayer, item: MediaItem, enqueue: 'play' | 'next' | 'add' = 'play') =>
			(await tvAllows(player)) &&
			withBusy(busyKey(player, `${enqueue}:${item.uri}`), () => {
				const replaces = enqueue === 'play' && (item.mediaType === 'album' || item.mediaType === 'playlist');
				const call = withToast(
					() =>
						getHass()?.callService('music_assistant', 'play_media', {
							entity_id: target(player),
							media_id: item.uri,
							// Home Assistant's media types have no podcast episode; its URI says what it is
							...(item.mediaType === 'podcast_episode' ? {} : { media_type: item.mediaType }),
							enqueue: replaces ? 'replace' : enqueue,
						}),
					enqueue === 'play'
						? [`Playing ${item.name}`, player.name]
						: enqueue === 'next'
							? [`${item.name} plays next`, player.name]
							: [`Added ${item.name}`, `To the end of the ${player.name} queue`],
					`Couldn't play ${item.name}`,
				);
				// A song or station played now keeps the rest of the queue (and its playlist)
				return replaces ? played(player, item, call) : call;
			}),
	};
}

/** What `useMusicControls` returns: every command the player's controls send, with their busy state. */
export type MusicControls = ReturnType<typeof useMusicControls>;

/** Busy keys are per target (a follower's commands go to its leader, so both show it). */
function busyKey(player: MusicPlayer, action: string) {
	return `${player.leader ?? player.entityId}:${action}`;
}

/** Run a service call (straight on hass, so it rejects) and toast the outcome, success or failure. */
async function withToast(
	call: () => Promise<unknown> | undefined,
	[title, description]: [string, string | undefined],
	failure: string,
): Promise<boolean> {
	try {
		await call();
		toast.success(title, { description });
		return true;
	} catch (err) {
		console.error(failure, err);
		toast.error(failure);
		return false;
	}
}

/** Library items of a type, most recently played first (loaded once per mount). */
export function useRecentLibrary(mediaType: MediaType, playerEntityId?: string, limit?: number) {
	const { getHass } = useHassApi();
	const configEntry = useMusicConfigEntry(playerEntityId);
	const [items, setItems] = useState<MediaItem[] | null>(null);
	useEffect(() => {
		const hass = getHass();
		if (!hass || !configEntry) return;
		let active = true;
		getLibrary(hass, configEntry, mediaType, { orderBy: 'last_played_desc' })
			.then((list) => active && setItems(limit ? list.slice(0, limit) : list))
			.catch(() => active && setItems([]));
		return () => {
			active = false;
		};
	}, [configEntry, mediaType]);
	return items;
}
