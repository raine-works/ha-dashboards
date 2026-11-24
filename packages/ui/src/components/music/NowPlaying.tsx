/**
 * The music player's Now Playing tab: the cover, transport, volume, up next and moving the music.
 *
 * @module
 */

import {
	Album,
	ChevronRight,
	Disc3,
	ListMusic,
	ListX,
	Loader2,
	Music,
	Pause,
	Play,
	Repeat,
	Repeat1,
	RotateCcw,
	RotateCw,
	Search,
	Shuffle,
	SkipBack,
	SkipForward,
	Speaker,
	Square,
	Tv as TvIcon,
	User,
	Volume2,
	VolumeX,
} from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useEntity, useHassApi, useHassReady } from '../../context/HassContext';
import { useHouseConfig } from '../../context/HouseConfig';
import { useWallPanel } from '../../context/WallPanel';
import { type Hold, useHold, useSettledHold } from '../../hooks/useHeldValue';
import { useNow } from '../../hooks/useNow';
import {
	currentPosition,
	formatTrackTime,
	getQueue,
	groupVolume,
	hasMedia,
	type LiveInput,
	MEDIA_FEATURE,
	type MediaItem,
	type MusicPlayer as Player,
	type QueueSummary,
	queueIsCurrent,
	speakerNames,
	supports,
} from '../../lib/music';
import { SCRIPTURE_AUDIO_FILE } from '../../lib/scripture';
import type { Tv } from '../../lib/tv';
import { cn } from '../../lib/utils';
import { HolidayPeek } from '../holiday/HolidayEgg';
import { TvDialog, useSpeakerTv } from '../tv/TvDialog';
import { Button, Card, ChipRow, ConfirmButton, Slider } from '../ui';
import { ArtBackdrop, Artwork, PlayingBars, playerArtIcon } from './Artwork';
import { PickBusyContext, TileGrid } from './Browse';
import { PartyButton } from './PartyButton';
import { usePlayingPlaylist } from './playlistMemory';
import { VolumeSlider } from './Speakers';
import { type MusicControls, useRecentLibrary } from './useMusic';
import { useQueuePage, useQueueSource } from './useQueue';

/** Switch a speaker (or its group) to a live input; disabled while the input's device is offline. */
const LiveInputButton: React.FC<{
	input: LiveInput;
	player: Player;
	controls: MusicControls;
	size?: 'sm' | 'lg';
	className?: string;
}> = ({ input, player, controls, size = 'sm', className }) => {
	const signal = useEntity(input.signal ?? '');
	const offline = !!input.signal && (!signal || signal.state === 'unavailable');
	return (
		<Button
			variant="outline"
			size={size}
			onClick={() => controls.playLiveInput(player, input)}
			loading={controls.isBusy(player, `input:${input.uri}`)}
			disabled={offline}
			title={
				offline
					? `The ${input.name.toLowerCase()} input is offline`
					: `Play the ${input.name.toLowerCase()} on ${player.name}`
			}
			className={className}
		>
			<Disc3 />
			{input.name}
		</Button>
	);
};

/** Whether audio reaches a live input right now ("Record playing" / "No signal"), when it reports it. */
const LiveSignal: React.FC<{ input: LiveInput }> = ({ input }) => {
	const signal = useEntity(input.signal ?? '');
	if (!input.signal || !signal || signal.state === 'unavailable') return <p className="text-lg">Live input</p>;
	return signal.state === 'on' ? (
		<p className="text-lg">Record playing</p>
	) : (
		<p className="text-lg text-muted-foreground">No signal yet: drop the needle</p>
	);
};

/**
 * The TV's sound's cover: what's on (its poster or cover, as the TV reports it), else the open
 * app's icon, else a TV, on a tile tinted with the accent.
 */
const TvCover: React.FC<{ tv?: Tv; className?: string }> = ({ tv, className }) => {
	const artwork = tv?.nowPlaying?.artwork;
	if (artwork) return <Artwork src={artwork} fallback={TvIcon} className={className} />;
	const icon = tv?.app?.icon;
	return (
		<div
			className={cn(
				'flex shrink-0 items-center justify-center bg-linear-to-br from-primary/25 via-muted to-muted text-primary',
				className,
			)}
		>
			{icon ? (
				<img src={icon} alt="" draggable={false} className="size-1/3 rounded-[22%] shadow-lg" />
			) : (
				<TvIcon className="size-2/5" />
			)}
		</div>
	);
};

/** Nothing on this speaker: one tap on a recent playlist starts it, or browse for more. */
const StartPlaying: React.FC<{ player: Player; controls: MusicControls; onBrowse: () => void }> = ({
	player,
	controls,
	onBrowse,
}) => {
	const recent = useRecentLibrary('playlist', player.entityId, 6);
	const { liveInputs } = useHouseConfig();
	return (
		<div className="flex flex-col gap-5">
			<Card className="items-center gap-3 py-8 text-center">
				<div className="relative">
					<Artwork fallback={Speaker} round className="size-16" />
					{/* A holiday's character keeping the idle speaker company */}
					<HolidayPeek className="absolute -right-4 -bottom-1 size-8" />
				</div>
				<div>
					<p className="font-semibold text-lg">Nothing playing on {player.name}</p>
					<p className="text-muted-foreground text-sm">Pick something below, or search for anything</p>
				</div>
				<div className="flex flex-wrap justify-center gap-2">
					<Button size="lg" onClick={onBrowse}>
						<Search />
						Browse music
					</Button>
					{liveInputs.map((input) => (
						<LiveInputButton key={input.uri} input={input} player={player} controls={controls} size="lg" />
					))}
					<PartyButton size="lg" />
				</div>
			</Card>
			{recent && recent.length > 0 && (
				<section className="flex flex-col gap-2">
					<h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Jump back in</h4>
					<PickBusyContext.Provider value={(item, enqueue) => controls.isBusy(player, `${enqueue}:${item.uri}`)}>
						<TileGrid items={recent} onPick={(item) => controls.playItem(player, item)} />
					</PickBusyContext.Provider>
				</section>
			)}
		</div>
	);
};

// Re-reads of the queue while Music Assistant catches up with a new track (its current, then its next; 1s apart, up to 10s)
const QUEUE_CATCH_UP_MS = 1000;
const QUEUE_CATCH_UP_TRIES = 10;

/**
 * While a live input (the turntable) plays: Music Assistant keeps the queue parked where it was, so
 * one tap goes back to it (`backToQueue`: resumed from where it stopped), or Clear stops the input
 * and empties the queue, leaving the speaker idle.
 */
const LiveInputQueue: React.FC<{ source: Player; controls: MusicControls }> = ({ source, controls }) => {
	const { page } = useQueuePage(source, true, 1, false);
	const parked = page?.entries[0];
	return (
		<Card className="flex-row flex-wrap items-center gap-3 px-4 py-3">
			<div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
				<Artwork src={parked?.image} fallback={ListMusic} className="size-11" />
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="text-muted-foreground text-xs">
						{parked ? 'Your queue is waiting' : 'Nothing in the queue'}
					</span>
					<span className="truncate font-medium text-sm">
						{parked ? [parked.name, parked.artist].filter(Boolean).join(' · ') : 'Clear to stop the turntable'}
					</span>
				</div>
			</div>
			<div className="ml-auto flex gap-2">
				{parked && (
					<Button
						variant="outline"
						size="lg"
						onClick={() => controls.backToQueue(source)}
						loading={controls.isBusy(source, 'resume')}
					>
						<ListMusic />
						Back to queue
					</Button>
				)}
				<ClearQueueButton
					label="Clear"
					loading={controls.isBusy(source, 'clear')}
					onClear={() => controls.clearPlayback(source)}
				/>
			</div>
		</Card>
	);
};

/** Clearing can't be undone: the first tap arms it (red, "Tap to clear"), a second within 4s clears. */
const ClearQueueButton: React.FC<{ onClear: () => void; loading: boolean; label?: string }> = ({
	onClear,
	loading,
	label = 'Clear queue',
}) => (
	<ConfirmButton
		size="lg"
		icon={<ListX />}
		label={label}
		confirmLabel="Tap to clear"
		onConfirm={onClear}
		loading={loading}
		className="shrink-0"
		labelClassName="max-[380px]:sr-only"
	/>
);

// The slots either side of the seek and volume sliders (times; mute and the percentage), so both
// sliders line up; wide enough for "1:02:03"
const SIDE_SLOT = 'w-14 shrink-0';

/**
 * The track's position (a slider, the time played and left), ticking every second while it plays:
 * the one part of Now Playing that does. `seek` holds a sent position until the speaker reports
 * it; a drag shows here alone.
 */
const SeekBar: React.FC<{
	source: Player;
	playing: boolean;
	seek: Hold;
	disabled: boolean;
	onSeek: (position: number) => void;
	className?: string;
}> = ({ source, playing, seek, disabled, onSeek, className }) => {
	const now = useNow(playing);
	// Seconds; the track keeps moving, so a seek within 3s of where it landed is there
	const reported = Math.round(currentPosition(source, now));
	useSettledHold(seek, reported, (held, at) => Math.abs(held - at) <= 3);
	const [dragging, setDragging] = useState<number | null>(null);
	const position = dragging ?? seek.held?.value ?? reported;
	const duration = source.duration ?? 0;
	return (
		<div className={cn('flex items-center gap-3', className)}>
			<span className={cn(SIDE_SLOT, 'text-right font-mono text-muted-foreground text-xs tabular-nums')}>
				{formatTrackTime(position)}
			</span>
			<Slider
				min={0}
				max={Math.max(duration, 1)}
				value={Math.round(position)}
				disabled={disabled}
				onValueChange={setDragging}
				onValueCommit={(value) => {
					setDragging(null);
					seek.commit(value);
					onSeek(value);
				}}
				aria-label="Track position"
				className="flex-1"
			/>
			<span className={cn(SIDE_SLOT, 'font-mono text-muted-foreground text-xs tabular-nums')}>
				{duration ? `-${formatTrackTime(Math.max(0, duration - position))}` : ''}
			</span>
		</div>
	);
};

/**
 * What's playing on the picked speaker (or its group): artwork, the speakers it plays on, seek,
 * transport, volume (the whole group's when grouped), up next and moving it to another speaker.
 */
export const NowPlaying: React.FC<{
	player: Player;
	source: Player;
	players: Player[];
	controls: MusicControls;
	onBrowse: () => void;
	onSpeakers: () => void;
	/** Show the whole queue (the Queue tab). */
	onQueue: () => void;
	/** Open the playing track's artist, album or playlist page in Browse. */
	onOpen: (item: MediaItem) => void;
	/** The music moved to this speaker: show it. */
	onMoved: (entityId: string) => void;
}> = ({ player, source, players, controls, onBrowse, onSpeakers, onQueue, onOpen, onMoved }) => {
	const { getHass } = useHassApi();
	const { liveInputs } = useHouseConfig();
	const ready = useHassReady();
	const state = controls.stateOf(source);
	const isPlaying = state === 'playing';
	// A seek sent shows until the speaker reports it; the bar (`SeekBar`) ticks the position itself,
	// so the rest of Now Playing doesn't re-render every second
	const seek = useHold();
	const [queue, setQueue] = useState<QueueSummary>();
	// The track the queue was read for (its artist and album links wait for the new one)
	const [queueTitle, setQueueTitle] = useState<string>();
	// The playlist the queue came from: Music Assistant's record of it, else (songs queued one by one
	// from a playlist page) the one this device started here, while the track is one of its songs
	const queueSource = useQueueSource(source, hasMedia(source) && !source.liveInput && !source.tvAudio);
	const remembered = usePlayingPlaylist(source);
	// The TV a soundbar plays the sound of (the one in its room): what's on, and its controls
	const speakerTv = useSpeakerTv(source.tvAudio ? source.entityId : undefined);
	const [tvOpen, setTvOpen] = useState(false);
	const wallPanel = useWallPanel();
	const playlistItem = queueSource?.mediaType === 'playlist' ? queueSource : remembered;

	// What's next (Music Assistant exposes the current and next item only)
	useEffect(() => {
		const hass = getHass();
		// No queue to read without one in Music Assistant (a live input, or another app's source playing
		// on the speaker): Home Assistant fails the call and logs "No active queue found"
		if (!ready || !hass || !hasMedia(source) || !source.queueId || source.liveInput) {
			setQueue(undefined);
			return;
		}
		let active = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const title = source.title;
		// Music Assistant's queue moves on after Home Assistant reports the new track: read again
		// until it has (else the old track's next, i.e. this one, shows as up next)
		const read = (attempt: number) => {
			getQueue(hass, source.entityId)
				.then((q) => {
					if (!active) return;
					setQueue(q);
					if (queueIsCurrent(q, title)) {
						setQueueTitle(title);
					} else if (attempt < QUEUE_CATCH_UP_TRIES) {
						timer = setTimeout(() => read(attempt + 1), QUEUE_CATCH_UP_MS);
					}
				})
				.catch(() => active && setQueue(undefined));
		};
		read(1);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [source.entityId, source.title, source.queueId, ready]);

	if (!hasMedia(source)) return <StartPlaying player={player} controls={controls} onBrowse={onBrowse} />;

	const duration = source.duration ?? 0;
	// The spoken daily brief: no artist or album, nothing to shuffle or repeat; skip by 15 seconds
	const brief = source.kind === 'brief';
	// The same, for the Study tab's scripture (its recording sits beside the brief's)
	const spoken = source.contentId?.includes(SCRIPTURE_AUDIO_FILE) ? 'scripture' : 'brief';
	// Neither a live input nor the brief has a queue of tracks to step through here
	const trackControls = !source.liveInput && !brief && !source.tvAudio;
	// The TV's sound: the TV pauses and skips it, so only the volume is here
	const tv = source.tvAudio;
	const onTv = speakerTv?.state === 'on' ? speakerTv : undefined;
	// What's on it: the TV's title, else the app ("Tubi"), else just the TV's sound
	const tvTitle = onTv?.nowPlaying?.title ?? onTv?.appName ?? source.title;
	const tvLine = [onTv?.nowPlaying ? onTv.appName : undefined, speakerTv?.name].filter(Boolean).join(' · ');
	const canSeek = supports(source, MEDIA_FEATURE.SEEK) && duration > 0;
	const skipBy = (seconds: number) => {
		// From a seek still on its way, else from where the track is now
		const from = seek.held?.value ?? Math.round(currentPosition(source));
		const to = Math.min(Math.max(0, from + seconds), Math.max(0, duration - 1));
		seek.commit(to);
		controls.seek(source, to);
	};
	const members = (source.groupMembers.length > 0 ? source.groupMembers : [source.entityId])
		.map((id) => players.find((p) => p.entityId === id))
		.filter((p): p is Player => !!p);
	const grouped = members.length > 1;
	const allMuted = members.every((m) => m.muted);
	const others = players.filter((p) => !members.some((m) => m.entityId === p.entityId));
	// The track's artist and album pages, once the queue has caught up with the track
	const current = queueTitle === source.title ? queue?.current : undefined;
	const artistItem = current?.artistItems?.[0];
	const albumItem = current?.albumItem;

	return (
		// Fills the tab (the music dialog), so the transport and volume sit at its bottom edge
		<div className="flex min-h-full flex-col gap-5">
			{/* Hero: the cover over a blur of itself, taking the height the rest leaves (flex-1). From sm the
			    cover's slot is a size container stretched to the card's height, up to 40% of its width
			    (22rem at most), so the cover grows into the room without making the card taller than its
			    text (on the short wall panels it stays the text's height, never under 10rem) */}
			<Card className="relative isolate flex-1 items-center gap-6 overflow-hidden p-6 sm:flex-row">
				<ArtBackdrop src={tv ? onTv?.nowPlaying?.artwork : source.artwork} />
				<div className="sm:@container-size flex w-full max-w-64 shrink-0 items-center sm:min-h-40 sm:w-[min(40%,22rem)] sm:max-w-none sm:self-stretch">
					{tv ? (
						<TvCover tv={onTv} className="aspect-square w-full rounded-xl shadow-xl sm:size-[min(100cqw,100cqh)]" />
					) : (
						<Artwork
							src={source.artwork}
							fallback={playerArtIcon(source)}
							spin={!!source.liveInput && isPlaying}
							className="aspect-square w-full rounded-xl shadow-xl sm:size-[min(100cqw,100cqh)]"
						/>
					)}
				</div>
				<div className="flex w-full min-w-0 flex-col gap-1 max-sm:items-center max-sm:text-center">
					{/* The status over the title, like Party mode's */}
					<div className="flex w-full flex-col gap-2 max-sm:items-center">
						<span className="flex items-center gap-2 whitespace-nowrap font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							{controls.isStarting(source) ? (
								<>
									<Loader2 className="size-3.5 animate-spin" />
									Starting on {source.name}…
								</>
							) : (
								<>
									<PlayingBars paused={!isPlaying} className="text-primary" />
									{tv
										? 'From the TV'
										: source.liveInput
											? isPlaying
												? 'Live'
												: 'Stopped'
											: brief
												? isPlaying
													? `Playing the ${spoken}`
													: spoken === 'scripture'
														? 'Scripture paused'
														: 'Brief paused'
												: isPlaying
													? 'Now playing'
													: 'Paused'}
								</>
							)}
						</span>
						<h3 className="line-clamp-2 min-w-0 font-semibold text-2xl leading-tight lg:text-3xl">
							{tv ? tvTitle : source.title}
						</h3>
					</div>
					{tv ? (
						<>
							{onTv?.nowPlaying?.subtitle && <p className="truncate text-lg">{onTv.nowPlaying.subtitle}</p>}
							<p className="truncate text-muted-foreground text-sm">
								{tvLine ? `${tvLine} · pause it from the TV` : 'Pause or change it on the TV'}
							</p>
						</>
					) : source.liveInput ? (
						<LiveSignal input={source.liveInput} />
					) : (
						<>
							{source.artist && <p className="truncate text-lg">{source.artist}</p>}
							{source.album && <p className="truncate text-muted-foreground text-sm">{source.album}</p>}
						</>
					)}
					<div className="mt-3 flex w-full flex-wrap gap-2 max-sm:justify-center">
						<Button variant="outline" size="sm" onClick={onSpeakers} className="max-w-full">
							<Speaker />
							<span className="truncate">{speakerNames(source, players)}</span>
							<ChevronRight />
						</Button>
						{trackControls &&
							liveInputs.map((input) => (
								<LiveInputButton key={input.uri} input={input} player={source} controls={controls} />
							))}
						{trackControls && <PartyButton />}
						{tv && speakerTv && (
							<Button variant="outline" size="sm" onClick={() => setTvOpen(true)}>
								<TvIcon />
								TV controls
							</Button>
						)}
						{tv && (
							<Button variant="outline" size="sm" onClick={onBrowse}>
								<Music />
								Play music instead
							</Button>
						)}
						{trackControls && artistItem && (
							<Button variant="outline" size="sm" onClick={() => onOpen(artistItem)} title={`Go to ${artistItem.name}`}>
								<User />
								Artist
							</Button>
						)}
						{trackControls && playlistItem && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => onOpen(playlistItem)}
								title={`Go to ${playlistItem.name}`}
							>
								<ListMusic />
								Playlist
							</Button>
						)}
						{trackControls && albumItem && (
							<Button variant="outline" size="sm" onClick={() => onOpen(albumItem)} title={`Go to ${albumItem.name}`}>
								<Album />
								Album
							</Button>
						)}
					</div>
				</div>
			</Card>

			<SeekBar
				source={source}
				playing={isPlaying}
				seek={seek}
				disabled={!canSeek}
				onSeek={(value) => controls.seek(source, value)}
				className={cn((source.liveInput || tv) && 'hidden')}
			/>

			{/* Transport (a live input only stops; the TV's sound has none) */}
			<div className={cn('flex items-center justify-center gap-3 max-[380px]:gap-2', tv && 'hidden')}>
				<Button
					variant={source.shuffle ? 'secondary' : 'ghost'}
					size="icon-xl"
					onClick={() => controls.shuffle(source)}
					loading={controls.isBusy(source, 'shuffle')}
					disabled={!supports(source, MEDIA_FEATURE.SHUFFLE_SET)}
					aria-pressed={source.shuffle}
					aria-label={source.shuffle ? 'Shuffle on' : 'Shuffle off'}
					title="Shuffle"
					className={cn(!trackControls && 'hidden')}
				>
					<Shuffle className={cn('size-5', !source.shuffle && 'text-muted-foreground')} />
				</Button>
				<Button
					variant="outline"
					size="icon-xl"
					onClick={() => controls.previous(source)}
					loading={controls.isBusy(source, 'previous')}
					disabled={!supports(source, MEDIA_FEATURE.PREVIOUS_TRACK)}
					aria-label="Previous track"
					className={cn(!trackControls && 'hidden')}
				>
					<SkipBack className="size-5" />
				</Button>
				{brief && (
					<Button
						variant="outline"
						size="icon-xl"
						onClick={() => skipBy(-15)}
						disabled={!canSeek}
						aria-label="Back 15 seconds"
						title="Back 15 seconds"
					>
						<RotateCcw className="size-5" />
					</Button>
				)}
				<Button
					size="icon-xl"
					onClick={() => controls.playPause(source)}
					aria-label={isPlaying ? (source.liveInput ? 'Stop' : 'Pause') : 'Play'}
					className="size-16"
				>
					{isPlaying ? (
						source.liveInput ? (
							<Square className="size-6 fill-current" />
						) : (
							<Pause className="size-7" />
						)
					) : (
						<Play className="size-7 translate-x-px" />
					)}
				</Button>
				<Button
					variant="outline"
					size="icon-xl"
					onClick={() => controls.next(source)}
					loading={controls.isBusy(source, 'next')}
					disabled={!supports(source, MEDIA_FEATURE.NEXT_TRACK)}
					aria-label="Next track"
					className={cn(!trackControls && 'hidden')}
				>
					<SkipForward className="size-5" />
				</Button>
				{brief && (
					<Button
						variant="outline"
						size="icon-xl"
						onClick={() => skipBy(15)}
						disabled={!canSeek}
						aria-label="Forward 15 seconds"
						title="Forward 15 seconds"
					>
						<RotateCw className="size-5" />
					</Button>
				)}
				<Button
					variant={source.repeat !== 'off' ? 'secondary' : 'ghost'}
					size="icon-xl"
					onClick={() => controls.repeat(source)}
					loading={controls.isBusy(source, 'repeat')}
					disabled={!supports(source, MEDIA_FEATURE.REPEAT_SET)}
					aria-label={`Repeat ${source.repeat === 'one' ? 'this song' : source.repeat}`}
					title="Repeat"
					className={cn(!trackControls && 'hidden')}
				>
					{source.repeat === 'one' ? (
						<Repeat1 className="size-5" />
					) : (
						<Repeat className={cn('size-5', source.repeat === 'off' && 'text-muted-foreground')} />
					)}
				</Button>
			</div>

			{/* Volume: the whole group's when grouped (each speaker shifts by the same amount) */}
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon-lg"
						onClick={() => controls.setMuted(members, !allMuted)}
						loading={controls.isBusy(source, 'mute')}
						disabled={!supports(source, MEDIA_FEATURE.VOLUME_MUTE)}
						aria-label={allMuted ? 'Unmute' : 'Mute'}
						className="mx-2"
					>
						{allMuted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
					</Button>
					<VolumeSlider
						value={grouped ? groupVolume(members.map((m) => m.volume)) : source.volume}
						onCommit={(v) => (grouped ? controls.setGroupVolume(members, v) : controls.setVolume(source, v))}
						disabled={!supports(source, MEDIA_FEATURE.VOLUME_SET)}
						label={grouped ? 'Group volume' : `${source.name} volume`}
						valueClassName={cn(SIDE_SLOT, 'text-left')}
						className="flex-1"
					/>
				</div>
				{grouped && (
					<button
						type="button"
						onClick={onSpeakers}
						className="self-start pl-17 text-muted-foreground text-xs hover:text-foreground"
					>
						Group volume · adjust each speaker
					</button>
				)}
			</div>

			{/* The queue: what's next, how much is left, and clearing it (a live input has none) */}
			<Card className={cn('flex-row items-center gap-3 px-4 py-3', !trackControls && 'hidden')}>
				{/* Tap for the whole queue */}
				<button
					type="button"
					onClick={onQueue}
					aria-label="Show the whole queue"
					className="flex min-w-0 flex-1 items-center gap-3 text-left"
				>
					<Artwork src={queue?.next?.image} fallback={ListMusic} className="size-11" />
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="text-muted-foreground text-xs">
							{queue && queue.count > 1 ? `Up next · ${queue.count} in queue` : 'Up next'}
						</span>
						<span className="truncate font-medium text-sm">
							{queue?.next ? [queue.next.name, queue.next.artist].filter(Boolean).join(' · ') : 'Nothing after this'}
						</span>
					</div>
					<ChevronRight className="size-5 shrink-0 text-muted-foreground" />
				</button>
				{supports(source, MEDIA_FEATURE.CLEAR_PLAYLIST) && (
					<ClearQueueButton
						loading={controls.isBusy(source, 'clear')}
						onClear={async () => {
							if (await controls.clearQueue(source)) setQueue(undefined);
						}}
					/>
				)}
			</Card>

			{source.liveInput && <LiveInputQueue source={source} controls={controls} />}

			{/* The TV's sound stays with the TV */}
			{others.length > 0 && !tv && (
				<div className="flex flex-col gap-2">
					<h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Move the music to</h4>
					<ChipRow>
						{others.map((other) => (
							<Button
								key={other.entityId}
								variant="outline"
								// Follow the music at once (Music Assistant holds the call open until it starts), once
								// a speaker playing its TV's sound has said yes
								onClick={() => controls.transfer(source, other, () => onMoved(other.entityId))}
							>
								<Speaker />
								{other.name}
							</Button>
						))}
					</ChipRow>
				</div>
			)}

			{/* The soundbar's TV, opened on it (mounted while open, so it starts there) */}
			{tvOpen && (
				<TvDialog isOpen onClose={() => setTvOpen(false)} remote={!wallPanel} initialTv={speakerTv?.entityId} />
			)}
		</div>
	);
};
