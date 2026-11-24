/**
 * Party mode: the wall panels' full-screen music view, loaded on demand.
 *
 * @module
 */

import { ListMusic, PartyPopper, Pause, Play, Search, SkipBack, SkipForward, Speaker, Volume2 } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useNow } from '../../hooks/useNow';
import {
	activePlayers,
	currentPosition,
	defaultPlayer,
	formatTrackTime,
	groupVolume,
	hasMedia,
	MEDIA_FEATURE,
	type MediaItem,
	type MusicPlayer as Player,
	speakerNames,
	supports,
} from '../../lib/music';
import { hapticTap } from '../../lib/tones';
import { cn } from '../../lib/utils';
import {
	Button,
	DEFAULT_DIALOG_IDLE_TIMEOUT_MS,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	EmptyState,
	Progress,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '../ui';
import { ArtBackdrop, Artwork, PlayingBars, playerArtIcon } from './Artwork';
import { type BrowsePage, BrowsePanel, SEARCH_PAGE } from './Browse';
import { QrCode, usePartyLink } from './PartyButton';
import { hidePartyMode } from './PartyModeHost';
import { QueuePanel } from './QueuePanel';
import { SpeakersPanel, VolumeSlider } from './Speakers';
import { useMusicControls, useMusicPlayers, useStoredPlayer } from './useMusic';

/**
 * Keep the screen on while `active` (the Screen Wake Lock API, where the panel's browser has it),
 * taken again when the page comes back into view (the browser drops it when hidden).
 */
function useWakeLock(active: boolean) {
	useEffect(() => {
		if (!active || !('wakeLock' in navigator)) return;
		let lock: WakeLockSentinel | null = null;
		let live = true;
		const request = () => {
			if (document.visibilityState !== 'visible') return;
			navigator.wakeLock
				.request('screen')
				.then((sentinel) => {
					if (live) lock = sentinel;
					else void sentinel.release();
				})
				.catch(() => {});
		};
		request();
		document.addEventListener('visibilitychange', request);
		return () => {
			live = false;
			document.removeEventListener('visibilitychange', request);
			void lock?.release().catch(() => {});
		};
	}, [active]);
}

/** The guests' QR code, big, with what it does; nothing while guest access is off or unreachable. */
const PartyQr: React.FC = () => {
	const { url } = usePartyLink(true);
	if (!url) return null;
	return (
		<div className="flex shrink-0 items-center gap-4 rounded-xl border bg-card/80 p-3">
			<QrCode text={url} className="short:size-24 size-32 max-w-none short:max-w-none shrink-0 rounded-lg" />
			<div className="flex min-w-0 flex-col gap-1">
				<span className="flex items-center gap-2 font-semibold text-lg">
					<PartyPopper className="size-5 text-primary" />
					Add your songs
				</span>
				<span className="text-muted-foreground text-sm">
					Scan with your phone's camera to search for songs and add them to the queue
				</span>
			</div>
		</div>
	);
};

type PartyTab = 'queue' | 'browse' | 'speakers';
type Controls = ReturnType<typeof useMusicControls>;

/** "1:23" / "-2:05": where the track is and what's left, under its progress line. */
const TrackTimes: React.FC<{ source: Player; playing: boolean }> = ({ source, playing }) => {
	const now = useNow(playing);
	const duration = source.duration ?? 0;
	if (duration <= 0) return null;
	const position = Math.min(currentPosition(source, now), duration);
	return (
		<div className="flex w-full flex-col gap-1.5">
			<Progress value={(position / duration) * 100} aria-label="Track progress" className="h-1.5" />
			<div className="flex justify-between font-mono text-muted-foreground text-xs tabular-nums">
				<span>{formatTrackTime(position)}</span>
				<span>-{formatTrackTime(duration - position)}</span>
			</div>
		</div>
	);
};

/**
 * One queue in the carousel: the cover, the track and where it plays, its progress, then the
 * transport and the volume (the group's when grouped), all centered in the column.
 */
const QueueSlide: React.FC<{ source: Player; players: Player[]; controls: Controls; onSpeakers: () => void }> = ({
	source,
	players,
	controls,
	onSpeakers,
}) => {
	const playing = controls.stateOf(source) === 'playing';
	const loaded = hasMedia(source);
	// The TV's sound: the TV pauses and skips it, so only the volume works here
	const controllable = loaded && !source.tvAudio;
	const members = (source.groupMembers.length > 0 ? source.groupMembers : [source.entityId])
		.map((id) => players.find((p) => p.entityId === id))
		.filter((p): p is Player => !!p);
	const grouped = members.length > 1;

	return (
		<div className="flex w-full shrink-0 snap-center snap-always flex-col items-center gap-4 overflow-y-auto px-2 py-1 max-lg:gap-3">
			{/* The cover takes the height the rest leaves, so the slide fills the column, up to 30rem
			    (22.5rem on the 10.5" panels) and never under 8rem */}
			<div className="flex min-h-32 w-full flex-1 items-center justify-center">
				<Artwork
					src={source.artwork}
					fallback={playerArtIcon(source)}
					spin={!!source.liveInput && playing}
					className="aspect-square h-full max-h-120 w-auto max-w-full rounded-3xl shadow-2xl max-lg:max-h-90"
				/>
			</div>
			<div className="flex w-full min-w-0 shrink-0 flex-col items-center gap-1 text-center">
				{/* Playing or paused, and where: a tap opens Speakers */}
				<button
					type="button"
					onClick={onSpeakers}
					className="flex max-w-full items-center gap-2 rounded-md px-2 py-0.5 font-medium text-muted-foreground text-xs uppercase tracking-widest transition-colors hover:text-foreground"
				>
					<PlayingBars paused={!playing} className="shrink-0 text-primary" />
					<span className="truncate">
						{source.tvAudio ? 'From the TV' : loaded ? (playing ? 'Now playing' : 'Paused') : 'Nothing playing'} ·{' '}
						{speakerNames(source, players)}
					</span>
				</button>
				<h2 className="line-clamp-2 font-semibold text-4xl tracking-tight max-lg:text-2xl">
					{loaded ? source.title : 'Pick something in Browse'}
				</h2>
				{loaded && source.artist && (
					<p className="w-full truncate text-muted-foreground text-xl max-lg:text-lg">{source.artist}</p>
				)}
			</div>
			{controllable && <TrackTimes source={source} playing={playing} />}
			{/* The transport, and the volume beside it (the group's when grouped) */}
			<div className="flex w-full shrink-0 items-center gap-2">
				<Button
					variant="ghost"
					size="icon-2xl"
					onClick={() => controls.previous(source)}
					loading={controls.isBusy(source, 'previous')}
					disabled={!controllable || !supports(source, MEDIA_FEATURE.PREVIOUS_TRACK)}
					aria-label="Previous track"
				>
					<SkipBack className="fill-current" />
				</Button>
				<Button
					size="icon-2xl"
					onClick={() => controls.playPause(source)}
					disabled={!controllable}
					aria-label={playing ? 'Pause' : 'Play'}
				>
					{playing ? <Pause className="fill-current" /> : <Play className="translate-x-px fill-current" />}
				</Button>
				<Button
					variant="ghost"
					size="icon-2xl"
					onClick={() => controls.next(source)}
					loading={controls.isBusy(source, 'next')}
					disabled={!controllable || !supports(source, MEDIA_FEATURE.NEXT_TRACK)}
					aria-label="Next track"
				>
					<SkipForward className="fill-current" />
				</Button>
				<div className="flex min-w-0 flex-1 items-center gap-3 pl-3 max-lg:pl-1">
					<Volume2 className="size-5 shrink-0 text-muted-foreground" />
					<VolumeSlider
						value={grouped ? groupVolume(members.map((m) => m.volume)) : source.volume}
						onCommit={(v) => (grouped ? controls.setGroupVolume(members, v) : controls.setVolume(source, v))}
						disabled={!supports(source, MEDIA_FEATURE.VOLUME_SET)}
						label={grouped ? 'Group volume' : `${source.name} volume`}
						className="flex-1"
					/>
				</div>
			</div>
		</div>
	);
};

/**
 * The queues playing, one slide each, swiped between like the phone's mini player (a native
 * scroll-snap scroller: the browser's own momentum and settle, a light tick as the next takes over),
 * in a steady order by name; the dots say which and jump to one. The shown queue is the one the
 * tabs beside it work on.
 */
const QueueCarousel: React.FC<{
	slides: Player[];
	shown: Player;
	onShow: (id: string) => void;
	players: Player[];
	controls: Controls;
	onSpeakers: () => void;
}> = ({ slides, shown, onShow, players, controls, onSpeakers }) => {
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	const index = Math.max(
		0,
		slides.findIndex((p) => p.entityId === shown.entityId),
	);
	// Show the current queue at once when the carousel appears or the queues change
	const order = slides.map((p) => p.entityId).join(',');
	useEffect(() => {
		if (scroller) scroller.scrollTo({ left: index * scroller.clientWidth, behavior: 'instant' });
	}, [scroller, order]);

	return (
		<div className="flex min-h-0 flex-col gap-3">
			<div
				ref={setScroller}
				onScroll={(e) => {
					const el = e.currentTarget;
					const id = slides[Math.round(el.scrollLeft / Math.max(1, el.clientWidth))]?.entityId;
					if (id && id !== shown.entityId) {
						onShow(id);
						hapticTap(6);
					}
				}}
				className="scrollbar-none flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
			>
				{slides.map((player) => (
					<QueueSlide
						key={player.entityId}
						source={player}
						players={players}
						controls={controls}
						onSpeakers={onSpeakers}
					/>
				))}
			</div>
			{/* Which queue this is, when there are several: tap a dot to go to it, or swipe */}
			{slides.length > 1 && (
				<div className="flex shrink-0 items-center justify-center gap-1">
					{slides.map((p, i) => (
						<button
							key={p.entityId}
							type="button"
							onClick={() => scroller?.scrollTo({ left: i * scroller.clientWidth, behavior: 'smooth' })}
							aria-label={`${p.name}${i === index ? ', shown' : ''}`}
							aria-current={i === index}
							className="flex h-6 items-center px-1"
						>
							<span
								className={cn(
									'h-2 rounded-full transition-all',
									i === index ? 'w-6 bg-foreground' : 'w-2 bg-foreground/30',
								)}
							/>
						</button>
					))}
				</div>
			)}
		</div>
	);
};

/**
 * Party mode (wall panels; mounted by `PartyModeHost` while open, loaded with `import()`): the music
 * player full screen for a party. On the left every queue playing, swiped between (the cover, the
 * track, transport and volume); on the right the shown queue's Queue, Browse and Speakers with the
 * guests' QR code under them. While music plays it never idle-closes and keeps the screen on, and it
 * comes back after the panel reloads (a deploy, the nightly reload); once the music stops, the usual
 * 2-minute idle close applies again.
 */
export const PartyMode: React.FC = () => {
	const players = useMusicPlayers();
	const controls = useMusicControls(players);
	const actives = activePlayers(players);
	const [stored, setStored] = useStoredPlayer();
	const [shownId, setShownId] = useState<string | undefined>();
	const [tab, setTab] = useState<PartyTab>('queue');
	const [browsePage, setBrowsePage] = useState<BrowsePage>(SEARCH_PAGE);

	// Every queue playing (or paused within the hour), by name so a queue starting or pausing never
	// reorders the slides under the finger; nothing playing: the speaker the music player would pick
	const fallback = players.find((p) => p.entityId === defaultPlayer(players, stored));
	const fallbackSource = fallback && (players.find((p) => p.entityId === fallback.leader) ?? fallback);
	const slides =
		actives.length > 0
			? [...actives].sort((a, b) => a.name.localeCompare(b.name))
			: fallbackSource
				? [fallbackSource]
				: [];
	const source = slides.find((p) => p.entityId === shownId) ?? slides.find((p) => p.entityId === stored) ?? slides[0];
	const playing = slides.some((p) => controls.stateOf(p) === 'playing');

	useWakeLock(playing);

	const show = (id: string) => {
		setShownId(id);
		// The music player opens on the queue shown here too
		setStored(id);
	};
	const openItem = (item: MediaItem) => {
		setBrowsePage(item.mediaType === 'artist' ? { artist: item, album: null } : { artist: null, album: item });
		setTab('browse');
	};

	return (
		<Dialog
			open
			onOpenChange={(next) => !next && hidePartyMode()}
			// Music playing: it stays up (a party); stopped: the usual idle close
			idleTimeoutMs={playing ? 0 : DEFAULT_DIALOG_IDLE_TIMEOUT_MS}
		>
			<DialogContent
				// The whole screen under Home Assistant's toolbar
				size="fullscreen"
				className="isolate gap-4 overflow-hidden p-6 max-lg:gap-3 max-lg:p-4"
			>
				{source && <ArtBackdrop src={source.artwork} />}
				<div className="flex shrink-0 items-center gap-3 pr-12">
					<PartyPopper className="size-6 text-primary" />
					<DialogTitle className="text-2xl">Party Mode</DialogTitle>
					{slides.length > 1 && (
						<span className="text-muted-foreground text-sm">{slides.length} queues playing · swipe to switch</span>
					)}
					<DialogDescription className="sr-only">
						What's playing, the queue and the guests' QR code, full screen
					</DialogDescription>
				</div>

				{!source ? (
					<EmptyState icon={<Speaker className="size-10" />}>No Music Assistant speakers found.</EmptyState>
				) : (
					<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-8 max-lg:gap-5">
						<QueueCarousel
							slides={slides}
							shown={source}
							onShow={show}
							players={players}
							controls={controls}
							onSpeakers={() => setTab('speakers')}
						/>
						<div className="flex min-h-0 flex-col gap-4 max-lg:gap-3">
							<Tabs value={tab} onValueChange={(value) => setTab(value as PartyTab)} className="min-h-0 flex-1 gap-3">
								<TabsList className="h-11 w-full shrink-0">
									<TabsTrigger value="queue" className="px-4">
										<ListMusic />
										Queue
									</TabsTrigger>
									<TabsTrigger value="browse" className="px-4">
										<Search />
										Browse
									</TabsTrigger>
									<TabsTrigger value="speakers" className="px-4">
										<Speaker />
										Speakers
									</TabsTrigger>
								</TabsList>
								{/* Keyed by the shown queue, so switching queues starts its lists clean */}
								<TabsContent value="queue" className="-m-1 min-h-0 overflow-y-auto p-1">
									<QueuePanel key={source.entityId} player={source} active={tab === 'queue'} onOpen={openItem} />
								</TabsContent>
								<TabsContent value="browse" className="flex min-h-0 flex-col">
									<BrowsePanel
										contained
										player={source}
										source={source}
										players={players}
										controls={controls}
										onPlayed={() => setTab('queue')}
										onSpeakers={() => setTab('speakers')}
										page={browsePage}
										onPage={setBrowsePage}
									/>
								</TabsContent>
								<TabsContent value="speakers" className="-m-1 min-h-0 overflow-y-auto p-1">
									<SpeakersPanel leader={source} players={players} controls={controls} />
								</TabsContent>
							</Tabs>
							<PartyQr />
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};

export default PartyMode;
