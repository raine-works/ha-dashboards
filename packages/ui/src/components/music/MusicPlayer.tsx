/**
 * The Music Assistant player: the speaker list and the picked speaker's tabs.
 *
 * @module
 */

import { Speaker } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { defaultPlayer, type MediaItem } from '../../lib/music';
import { cn } from '../../lib/utils';
import { EmptyState, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from '../ui';
import { type BrowsePage, BrowsePanel, SEARCH_PAGE } from './Browse';
import { NowPlaying } from './NowPlaying';
import { QueuePanel } from './QueuePanel';
import { SpeakerList, SpeakersPanel } from './Speakers';
import { useMusicControls, useMusicPlayers, useStoredPlayer } from './useMusic';

export { Artwork, PlayingBars } from './Artwork';

/** The player's tabs: Now Playing, Queue, Browse and Speakers. */
export type MusicTab = 'now' | 'queue' | 'browse' | 'speakers';

// A region that scrolls inside the contained player (-m-1 p-1 keeps borders and focus rings unclipped)
const scrolls = '-m-1 min-h-0 overflow-y-auto p-1';

/** The player's props: where it starts, and whether it scrolls inside a fixed-height container. */
export interface MusicPlayerProps {
	/** Speaker to show first (e.g. the one the now-playing button was showing). */
	initialPlayer?: string;
	/** Tab to open on (the Daily dialog's playback bar opens Speakers). */
	initialTab?: MusicTab;
	/**
	 * Fill a fixed-height container (the dialog) and scroll inside it: the speaker column, each tab,
	 * and Browse's results under its pinned search. Off, it grows with its content and the page scrolls.
	 */
	contained?: boolean;
	className?: string;
}

/**
 * Music Assistant player: the speakers, and for the picked one Now Playing (artwork, transport,
 * volume, up next, move), Queue (the whole queue: play from, move, remove), Browse (library covers, search, artist pages) and Speakers (play along
 * in sync, group and per-speaker volume). Grows with its content; the dialog or page scrolls.
 */
export const MusicPlayer: React.FC<MusicPlayerProps> = ({
	initialPlayer,
	initialTab = 'now',
	contained = false,
	className,
}) => {
	const players = useMusicPlayers();
	const controls = useMusicControls(players);
	const [stored, setStored] = useStoredPlayer();
	const [selectedId, setSelectedId] = useState<string | undefined>(initialPlayer);
	const [tab, setTab] = useState<MusicTab>(initialTab);
	const [browsePage, setBrowsePage] = useState<BrowsePage>(SEARCH_PAGE);

	const selected =
		players.find((p) => p.entityId === selectedId) ??
		players.find((p) => p.entityId === defaultPlayer(players, stored));

	if (!selected) {
		return <EmptyState icon={<Speaker className="size-10" />}>No Music Assistant speakers found.</EmptyState>;
	}

	// A follower shows (and controls) what its group leader plays
	const source = players.find((p) => p.entityId === selected.leader) ?? selected;
	const select = (id: string) => {
		setSelectedId(id);
		setStored(id);
	};
	// An artist, album or playlist page in Browse
	const open = (item: MediaItem) => {
		setBrowsePage(item.mediaType === 'artist' ? { artist: item, album: null } : { artist: null, album: item });
		setTab('browse');
	};

	return (
		<div className={cn('flex min-w-0 flex-col gap-4 md:flex-row md:gap-6', contained && 'min-h-0 flex-1', className)}>
			<SpeakerList
				players={players}
				selected={selected.entityId}
				onSelect={select}
				controls={controls}
				className={cn(contained && 'md:min-h-0 md:overflow-y-auto')}
			/>
			<Separator orientation="vertical" className="max-md:hidden" />
			<Tabs
				value={tab}
				onValueChange={(value) => setTab(value as MusicTab)}
				className={cn('min-w-0 flex-1 gap-4', contained && 'min-h-0')}
			>
				<TabsList className="h-11 w-full shrink-0">
					<TabsTrigger value="now">Now playing</TabsTrigger>
					<TabsTrigger value="queue">Queue</TabsTrigger>
					<TabsTrigger value="browse">Browse</TabsTrigger>
					<TabsTrigger value="speakers">Speakers</TabsTrigger>
				</TabsList>
				<TabsContent value="now" className={cn(contained && scrolls)}>
					<NowPlaying
						player={selected}
						source={source}
						players={players}
						controls={controls}
						onBrowse={() => setTab('browse')}
						onSpeakers={() => setTab('speakers')}
						onQueue={() => setTab('queue')}
						onOpen={open}
						onMoved={select}
					/>
				</TabsContent>
				<TabsContent value="queue" className={cn(contained && scrolls)}>
					<QueuePanel player={source} active={tab === 'queue'} onOpen={open} />
				</TabsContent>
				<TabsContent value="browse" className={cn(contained && 'flex min-h-0 flex-col')}>
					<BrowsePanel
						contained={contained}
						player={selected}
						source={source}
						players={players}
						controls={controls}
						onPlayed={() => setTab('now')}
						onSpeakers={() => setTab('speakers')}
						page={browsePage}
						onPage={setBrowsePage}
					/>
				</TabsContent>
				<TabsContent value="speakers" className={cn(contained && scrolls)}>
					<SpeakersPanel leader={source} players={players} controls={controls} />
				</TabsContent>
			</Tabs>
		</div>
	);
};
