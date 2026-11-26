/**
 * The music dialog, the header's music button and the mini player, and the music exports the
 * dashboards use.
 *
 * @module
 */

import { Music, PartyPopper, Pause, Play, SkipForward, Square } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useWallPanel } from '../../context/WallPanel';
import { useNow } from '../../hooks/useNow';
import {
	activePlayers,
	currentPosition,
	MEDIA_FEATURE,
	type MusicPlayer as Player,
	speakerNames,
	supports,
} from '../../lib/music';
import { hapticTap } from '../../lib/tones';
import { cn } from '../../lib/utils';
import {
	Button,
	type ButtonProps,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	NumberFlow,
	Progress,
} from '../ui';
import { ArtBackdrop, Artwork, PlayingBars, playerArtIcon } from './Artwork';
import { MusicPlayer, type MusicTab } from './MusicPlayer';
import { showPartyMode } from './PartyModeHost';
import { useMusicActive, useMusicControls, useMusicPlayers, useShownState, useStoredPlayer } from './useMusic';

export { Artwork, PlayingBars } from './Artwork';
export { MusicPlayer } from './MusicPlayer';
export { PartyModeHost, showPartyMode } from './PartyModeHost';
export { rememberMusicPlayer } from './useMusic';

/** The music dialog's props: whether it's open, what closes it, and where the player starts. */
export interface MusicDialogProps {
	isOpen: boolean;
	onClose: () => void;
	/** The speaker to show first (an entity id); the playing one, else the last picked, without it. */
	initialPlayer?: string;
	/** The player's tab to open on. */
	initialTab?: MusicTab;
}

/**
 * The music dialog: the Music Assistant player for every speaker, with a Party mode button on the
 * wall panels. The player remounts each time it opens, so it starts on the playing speaker.
 */
export const MusicDialog: React.FC<MusicDialogProps> = ({ isOpen, onClose, initialPlayer, initialTab }) => {
	const wallPanel = useWallPanel();
	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			{/* A fixed height, so the player scrolls its parts (speakers, tabs, Browse results) inside it */}
			<DialogContent size="workspace" className="overflow-hidden">
				{/* Clear of the close button and, on the wall panels, the Party mode button beside it */}
				<DialogHeader className={cn(wallPanel && 'sm:pr-52')}>
					<DialogTitle>Music</DialogTitle>
					<DialogDescription className="max-sm:hidden">Music Assistant on every speaker in the house</DialogDescription>
				</DialogHeader>
				{/* The wall panels' full-screen view for a party (cover, queue, Browse, the guests' QR code), in
				    line with the close button (48px on the panels): the same height, its top, 8px to its left */}
				{wallPanel && (
					<Button
						variant="outline"
						size="lg"
						onClick={() => {
							onClose();
							showPartyMode();
						}}
						className="absolute top-3 right-17"
					>
						<PartyPopper />
						Party mode
					</Button>
				)}
				{/* Remounted per open so it starts on the playing speaker */}
				{isOpen && <MusicPlayer initialPlayer={initialPlayer} initialTab={initialTab} contained />}
			</DialogContent>
		</Dialog>
	);
};

export { useMusicActive };

/** "Knox · Library + Kitchen" */
const byline = (player: Player, players: Player[]) =>
	[player.artist, speakerNames(player, players)].filter(Boolean).join(' · ');

/** The cover with bouncing bars over it while playing. */
const CoverWithBars: React.FC<{ player: Player; playing: boolean; className?: string }> = ({
	player,
	playing,
	className,
}) => (
	<span className={cn('relative block shrink-0', className)}>
		<Artwork
			src={player.artwork}
			fallback={playerArtIcon(player)}
			spin={!!player.liveInput && playing}
			className="size-full"
		/>
		{playing && (
			<span className="absolute inset-0 flex items-end justify-end rounded-md bg-linear-to-tl from-black/60 via-transparent to-transparent p-1 text-white">
				<PlayingBars className="h-3" />
			</span>
		)}
	</span>
);

/**
 * Header now-playing button. Idle: a music icon. Playing or paused: the cover (with bars while
 * playing), and from xl up the track and where it plays. Below xl the cover fills an icon-sized
 * button. Opens the music dialog, or calls `onOpen` instead (a dashboard with a Music view).
 */
export const MusicButton: React.FC<{ size?: ButtonProps['size']; onOpen?: () => void; className?: string }> = ({
	size = 'xl',
	onOpen,
	className,
}) => {
	const [open, setOpen] = useState(false);
	const players = useMusicPlayers();
	const actives = activePlayers(players);
	const active = actives[0];
	// As the player shows it (a pause just tapped shows at once)
	const playing = useShownState(active?.entityId, active?.state ?? 'idle') === 'playing';
	const xl = size === 'xl';
	const tile = size === 'tile';
	const show = () => (onOpen ? onOpen() : setOpen(true));

	return (
		<>
			{active && tile ? (
				// A tile: the cover over "Music" below xl; from xl the cover beside the title and artist
				<Button
					variant="secondary"
					size="tile"
					onClick={show}
					aria-label={`Music: ${active.title} on ${active.name}${actives.length > 1 ? `, ${actives.length} playing` : ''}`}
					title={`${active.title}${active.artist ? ` · ${active.artist}` : ''} on ${speakerNames(active, players)}`}
					className={cn('min-w-0 xl:flex-row xl:gap-3 xl:pr-4 xl:pl-2', className)}
				>
					<span className="relative size-6 shrink-0 xl:size-10">
						<CoverWithBars player={active} playing={playing} className="size-full" />
						{actives.length > 1 && (
							<span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground tabular-nums ring-2 ring-background">
								<NumberFlow value={actives.length} />
							</span>
						)}
					</span>
					<span className="xl:hidden">Music</span>
					{/* A fixed width, so a new track never resizes the header */}
					<span className="flex w-36 min-w-0 shrink flex-col gap-0.5 text-left max-xl:hidden">
						<span className="truncate font-semibold text-sm leading-tight">{active.title}</span>
						<span className="truncate font-normal text-muted-foreground text-xs leading-tight">
							{byline(active, players)}
						</span>
					</span>
				</Button>
			) : active ? (
				<Button
					variant="secondary"
					size={size}
					onClick={show}
					aria-label={`Music: ${active.title} on ${active.name}${actives.length > 1 ? `, ${actives.length} playing` : ''}`}
					title={`${active.title}${active.artist ? ` · ${active.artist}` : ''} on ${speakerNames(active, players)}`}
					className={cn(
						'min-w-0 gap-3',
						xl ? 'pr-4 pl-1.5 max-xl:size-12' : 'pr-3 pl-1 max-xl:size-10',
						// Below xl the cover alone fills the button
						'max-xl:overflow-hidden max-xl:p-0',
						className,
					)}
				>
					<span className={cn('relative shrink-0', xl ? 'size-9' : 'size-8', 'max-xl:size-full')}>
						<CoverWithBars player={active} playing={playing} className="size-full max-xl:*:rounded-none" />
						{/* More than one thing playing: how many, on the cover's corner (inside the button, which
						    clips) so the button never grows */}
						{actives.length > 1 && (
							<span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-semibold text-[10px] text-primary-foreground tabular-nums ring-2 ring-background">
								<NumberFlow value={actives.length} />
							</span>
						)}
					</span>
					{/* A fixed width, so a new track never resizes the header (less when the header is full) */}
					<span className="flex w-36 min-w-0 shrink flex-col text-left leading-tight max-xl:hidden">
						<span className="truncate font-semibold text-sm">{active.title}</span>
						<span className="truncate font-normal text-muted-foreground text-xs">{byline(active, players)}</span>
					</span>
				</Button>
			) : (
				<Button
					variant="secondary"
					size={tile ? 'tile' : xl ? 'icon-xl' : 'icon-lg'}
					onClick={show}
					aria-label="Music"
					title="Music"
					className={className}
				>
					<Music />
					{tile && <span>Music</span>}
				</Button>
			)}
			{!onOpen && <MusicDialog isOpen={open} onClose={() => setOpen(false)} initialPlayer={active?.entityId} />}
		</>
	);
};

/** Thin progress line for a player's track (updates every second while playing). */
const TrackProgress: React.FC<{ player: Player; className?: string }> = ({ player, className }) => {
	const now = useNow(player.state === 'playing');
	const duration = player.duration ?? 0;
	const percent = duration ? (currentPosition(player, now) / duration) * 100 : 0;
	return <Progress value={percent} className={cn('h-1', className)} aria-label="Track progress" />;
};

/** Play/pause icon; a playing live input stops instead (it can't pause). */
const PlayPauseIcon: React.FC<{ player: Player; playing: boolean; className?: string }> = ({
	player,
	playing,
	className,
}) =>
	!playing ? (
		<Play className={cn(className, 'translate-x-px')} />
	) : player.liveInput ? (
		<Square className={cn(className, 'scale-90 fill-current')} />
	) : (
		<Pause className={className} />
	);

const playPauseLabel = (player: Player, playing: boolean) => (playing ? (player.liveInput ? 'Stop' : 'Pause') : 'Play');

/** Phone now-playing bar (cover, track, play/pause, next) while something is loaded; tap to open the player. */
/** One queue in the mini player: cover, title and byline (tap to open), play/pause, next. */
const MiniPlayerSlide: React.FC<{
	player: Player;
	players: Player[];
	controls: ReturnType<typeof useMusicControls>;
	onOpen: () => void;
}> = ({ player, players, controls, onOpen }) => {
	const playing = controls.stateOf(player) === 'playing';
	return (
		<div className="relative isolate w-full shrink-0 snap-center snap-always overflow-hidden">
			<ArtBackdrop src={player.artwork} />
			<TrackProgress player={player} className="absolute inset-x-0 top-0 h-0.5 rounded-none" />
			<div className="flex items-center gap-3 px-4 py-2">
				<button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
					<CoverWithBars player={player} playing={playing} className="size-11" />
					<div className="flex min-w-0 flex-col">
						<span className="truncate font-semibold text-sm">{player.title}</span>
						<span className="truncate text-muted-foreground text-xs">{byline(player, players)}</span>
					</div>
				</button>
				<Button
					variant="ghost"
					size="icon-lg"
					onClick={() => controls.playPause(player)}
					aria-label={playPauseLabel(player, playing)}
				>
					<PlayPauseIcon player={player} playing={playing} className="size-5" />
				</Button>
				<Button
					variant="ghost"
					size="icon-lg"
					onClick={() => controls.next(player)}
					loading={controls.isBusy(player, 'next')}
					disabled={!supports(player, MEDIA_FEATURE.NEXT_TRACK)}
					aria-label="Next track"
					// A live input and the spoken brief have no next track
					className={cn((player.liveInput || player.kind === 'brief') && 'hidden')}
				>
					<SkipForward className="size-5" />
				</Button>
			</div>
		</div>
	);
};

/**
 * The phone's now-playing bar. With more than one queue playing (speakers or groups) it's a
 * carousel: a native scroll-snap scroller of one slide per queue (the browser's own momentum and
 * settle), in a steady order by name, with dots saying which; opening it opens the music player on
 * the queue shown (the stored pick), and it starts on that pick.
 */
export const MiniPlayer: React.FC<{ onOpen: () => void; className?: string }> = ({ onOpen, className }) => {
	const players = useMusicPlayers();
	const actives = activePlayers(players);
	const controls = useMusicControls(players);
	const [stored, setStored] = useStoredPlayer();
	// By name, so a queue starting or pausing never reorders the slides under the finger
	const slides = [...actives].sort((a, b) => a.name.localeCompare(b.name));
	const [currentId, setCurrentId] = useState<string | undefined>();
	const shownId = slides.some((p) => p.entityId === currentId)
		? currentId
		: (slides.find((p) => p.entityId === stored) ?? actives[0])?.entityId;
	const index = Math.max(
		0,
		slides.findIndex((p) => p.entityId === shownId),
	);
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	// Show the current queue at once when the bar appears or the queues change
	const order = slides.map((p) => p.entityId).join(',');
	useEffect(() => {
		if (scroller) scroller.scrollTo({ left: index * scroller.clientWidth, behavior: 'instant' });
	}, [scroller, order]);

	if (slides.length === 0) return null;

	return (
		<div className={cn('relative border-t bg-background', className)}>
			<div
				ref={setScroller}
				onScroll={(e) => {
					const el = e.currentTarget;
					const id = slides[Math.round(el.scrollLeft / Math.max(1, el.clientWidth))]?.entityId;
					if (id && id !== shownId) {
						setCurrentId(id);
						// A light tick as the next queue takes over, like a native picker
						hapticTap(6);
					}
				}}
				className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
			>
				{slides.map((player) => (
					<MiniPlayerSlide
						key={player.entityId}
						player={player}
						players={players}
						controls={controls}
						onOpen={() => {
							// The music player opens on the queue shown here
							setStored(player.entityId);
							onOpen();
						}}
					/>
				))}
			</div>
			{/* Which queue this is, when there are several (swipe for the others) */}
			{slides.length > 1 && (
				<div
					className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-1"
					role="img"
					aria-label={`${index + 1} of ${slides.length} playing; swipe for the others`}
				>
					{slides.map((p, i) => (
						<span
							key={p.entityId}
							className={cn(
								'size-1.5 rounded-full transition-colors',
								i === index ? 'bg-foreground' : 'bg-foreground/30',
							)}
						/>
					))}
				</div>
			)}
		</div>
	);
};
