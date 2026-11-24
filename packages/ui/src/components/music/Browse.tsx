/**
 * The music player's Browse tab: search, the library and recent plays, artists and albums, as tiles to
 * play, play next or add to the queue.
 *
 * @module
 */

import {
	Check,
	ChevronLeft,
	ChevronRight,
	Disc3,
	ListEnd,
	ListMusic,
	ListPlus,
	Loader2,
	Play,
	Search,
	Shuffle,
	Speaker,
	User,
} from 'lucide-react';
import type React from 'preact/compat';
import { createContext, useContext, useEffect, useState } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import {
	appendEpisodes,
	byArtist,
	type EpisodePage,
	episodeItem,
	episodeProgress,
	formatEpisodeDate,
	getLibrary,
	getPodcastEpisodes,
	getTracks,
	type MediaItem,
	type MediaType,
	mediaKindOf,
	type MusicPlayer as Player,
	type PodcastEpisode,
	type SearchResults,
	searchMusic,
	speakerNames,
} from '../../lib/music';
import { cn } from '../../lib/utils';
import type { HomeAssistant } from '../../types/homeassistant';
import { Button, Input, Progress, ToggleGroup, ToggleGroupItem } from '../ui';
import { Artwork, MEDIA_ICONS } from './Artwork';
import { type MusicControls, useMusicConfigEntry } from './useMusic';

const SEARCH_DEBOUNCE_MS = 400;

const TYPE_LABEL: Record<MediaItem['mediaType'], string> = {
	playlist: 'Playlist',
	artist: 'Artist',
	album: 'Album',
	track: 'Song',
	radio: 'Station',
	podcast: 'Podcast',
	podcast_episode: 'Episode',
};

const SECTION_TITLE: Record<MediaType, string> = {
	playlist: 'Playlists',
	artist: 'Artists',
	album: 'Albums',
	track: 'Songs',
	radio: 'Radio',
	podcast: 'Podcasts',
};

const RESULT_KEY: Record<MediaType, keyof SearchResults> = {
	playlist: 'playlists',
	artist: 'artists',
	album: 'albums',
	track: 'tracks',
	radio: 'radio',
	podcast: 'podcasts',
};

const FILTERS: { value: 'all' | MediaType; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'playlist', label: 'Playlists' },
	{ value: 'artist', label: 'Artists' },
	{ value: 'album', label: 'Albums' },
	{ value: 'track', label: 'Songs' },
	{ value: 'radio', label: 'Radio' },
	{ value: 'podcast', label: 'Podcasts' },
];

/** Tapping an artist, album, playlist or podcast opens it; anything else plays. */
type OnPick = (item: MediaItem, enqueue?: 'play' | 'next' | 'add') => void;

/** Whether a pick (play, next, add) of an item is still on its way, for its spinner. */
export const PickBusyContext = createContext<(item: MediaItem, action: 'play' | 'next' | 'add' | 'shuffle') => boolean>(
	() => false,
);

/** A spinner over a cover while it starts (over the artwork, so nothing moves). */
const CoverSpinner: React.FC<{ className: string }> = ({ className }) => (
	<span className={cn('absolute inset-0 flex items-center justify-center bg-black/45 text-white', className)}>
		<Loader2 className="size-5 animate-spin" />
	</span>
);

/** A page opened from Browse: Back, which stays put while the page under it scrolls (contained). */
const BrowsePageShell: React.FC<{ onBack: () => void; contained: boolean; children: React.ReactNode }> = ({
	onBack,
	contained,
	children,
}) => (
	<div className={cn('flex flex-col gap-5', contained && 'min-h-0 flex-1')}>
		<Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 self-start">
			<ChevronLeft />
			Back
		</Button>
		<div className={cn('flex flex-col gap-5', contained && '-m-1 min-h-0 flex-1 overflow-y-auto p-1')}>{children}</div>
	</div>
);

/** Play next and Add to queue: the pair a row (and a track list's header) ends with. */
const QueueButtons: React.FC<{ item: MediaItem; onPick: OnPick; variant?: 'ghost' | 'outline' }> = ({
	item,
	onPick,
	variant = 'ghost',
}) => {
	const busy = useContext(PickBusyContext);
	return (
		<>
			<Button
				variant={variant}
				size="icon-lg"
				onClick={() => onPick(item, 'next')}
				loading={busy(item, 'next')}
				aria-label={`Play ${item.name} next`}
				title="Play next"
			>
				<ListEnd className="size-5" />
			</Button>
			<Button
				variant={variant}
				size="icon-lg"
				onClick={() => onPick(item, 'add')}
				loading={busy(item, 'add')}
				aria-label={`Add ${item.name} to the queue`}
				title="Add to queue"
			>
				<ListPlus className="size-5" />
			</Button>
		</>
	);
};

/** A cover with its name; tap to play (an artist, album or playlist opens). */
export const MediaTile: React.FC<{ item: MediaItem; onPick: OnPick }> = ({ item, onPick }) => {
	const isArtist = item.mediaType === 'artist';
	const playing = useContext(PickBusyContext)(item, 'play');
	return (
		<button
			type="button"
			onClick={() => !playing && onPick(item)}
			aria-busy={playing || undefined}
			className="group flex min-w-0 flex-col gap-2 rounded-lg text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
		>
			<div className="relative">
				<Artwork
					src={item.image}
					round={isArtist}
					fallback={isArtist ? User : MEDIA_ICONS[mediaKindOf(item.mediaType)]}
					className={cn('aspect-square w-full', !isArtist && 'rounded-lg')}
				/>
				{playing && <CoverSpinner className={isArtist ? 'rounded-full' : 'rounded-lg'} />}
				{!isArtist && !playing && (
					<span className="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
						<Play className="size-4 translate-x-px" />
					</span>
				)}
			</div>
			<div className={cn('flex min-w-0 flex-col', isArtist && 'items-center text-center')}>
				<span className="line-clamp-2 font-medium text-sm leading-snug">{item.name}</span>
				{item.subtitle && <span className="truncate text-muted-foreground text-xs">{item.subtitle}</span>}
			</div>
		</button>
	);
};

/** Media tiles in a grid: three columns on phones, up to five on wide screens. */
export const TileGrid: React.FC<{ items: MediaItem[]; onPick: OnPick }> = ({ items, onPick }) => (
	<div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
		{items.map((item) => (
			<MediaTile key={item.uri} item={item} onPick={onPick} />
		))}
	</div>
);

/** One result: tap to play (an artist, album or playlist opens), or queue it next / at the end. */
const MediaRow: React.FC<{ item: MediaItem; onPick: OnPick }> = ({ item, onPick }) => {
	const isArtist = item.mediaType === 'artist';
	const busy = useContext(PickBusyContext);
	const playing = busy(item, 'play');
	return (
		<div className="flex items-center gap-2 py-2">
			<button
				type="button"
				onClick={() => !playing && onPick(item)}
				aria-busy={playing || undefined}
				className="flex min-w-0 flex-1 items-center gap-3 text-left"
			>
				<span className="relative shrink-0">
					<Artwork
						src={item.image}
						round={isArtist}
						fallback={isArtist ? User : MEDIA_ICONS[mediaKindOf(item.mediaType)]}
						className="size-12"
					/>
					{playing && <CoverSpinner className={isArtist ? 'rounded-full' : 'rounded-md'} />}
				</span>
				<div className="flex min-w-0 flex-col">
					<span className="truncate font-medium">{item.name}</span>
					<span className="truncate text-muted-foreground text-xs">
						{[TYPE_LABEL[item.mediaType], item.subtitle].filter(Boolean).join(' · ')}
					</span>
				</div>
			</button>
			{isArtist ? (
				<ChevronRight className="size-5 shrink-0 text-muted-foreground" />
			) : (
				<QueueButtons item={item} onPick={onPick} />
			)}
		</div>
	);
};

const Section: React.FC<{ title: string; children: React.ReactNode; dim?: boolean }> = ({ title, children, dim }) => (
	<section className={cn('flex flex-col gap-2', dim && 'opacity-60')}>
		<h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">{title}</h4>
		{children}
	</section>
);

const Status: React.FC<{ loading: boolean; children?: React.ReactNode }> = ({ loading, children }) => (
	<p className="flex items-center gap-2 text-muted-foreground text-sm">
		{loading && <Loader2 className="size-4 animate-spin" />}
		{children}
	</p>
);

/** An artist: play everything, or pick from their albums and songs (exact name matches only). */
const ArtistPage: React.FC<{
	artist: MediaItem;
	configEntry: string;
	onPick: OnPick;
	onBack: () => void;
	contained?: boolean;
}> = ({ artist, configEntry, onPick, onBack, contained = false }) => {
	const { getHass } = useHassApi();
	const [results, setResults] = useState<{ albums: MediaItem[]; tracks: MediaItem[] } | null>(null);

	useEffect(() => {
		const hass = getHass();
		if (!hass) return;
		let active = true;
		// Another artist: never show the last one's albums and songs under this name
		setResults(null);
		searchMusic(hass, configEntry, artist.name, ['album', 'track'], { artist: artist.name })
			.then(
				(r) =>
					active && setResults({ albums: byArtist(r.albums, artist.name), tracks: byArtist(r.tracks, artist.name) }),
			)
			.catch(() => active && setResults({ albums: [], tracks: [] }));
		return () => {
			active = false;
		};
	}, [artist.uri]);
	const isBusy = useContext(PickBusyContext);

	return (
		<BrowsePageShell onBack={onBack} contained={contained}>
			<div className="flex items-center gap-4">
				<Artwork src={artist.image} round fallback={User} className="size-20" />
				<div className="flex min-w-0 flex-col gap-2">
					<h3 className="truncate font-semibold text-2xl">{artist.name}</h3>
					<Button
						size="lg"
						onClick={() => onPick({ ...artist, mediaType: 'artist' }, 'play')}
						loading={isBusy({ ...artist, mediaType: 'artist' }, 'play')}
						className="self-start"
					>
						<Play />
						Play
					</Button>
				</div>
			</div>
			{!results && <Status loading>Loading…</Status>}
			{results && results.albums.length > 0 && (
				<Section title="Albums">
					<TileGrid items={results.albums} onPick={onPick} />
				</Section>
			)}
			{results && results.tracks.length > 0 && (
				<Section title="Songs">
					<div className="flex flex-col divide-y">
						{results.tracks.map((item) => (
							<MediaRow key={item.uri} item={item} onPick={onPick} />
						))}
					</div>
				</Section>
			)}
			{results && results.albums.length + results.tracks.length === 0 && (
				<Status loading={false}>Nothing else found for {artist.name}.</Status>
			)}
		</BrowsePageShell>
	);
};

/**
 * One of an album's or playlist's tracks: its number (an album's) or cover (a playlist's) and name;
 * tap plays the list from it.
 */
const TrackRow: React.FC<{
	item: MediaItem;
	number: number;
	showCover: boolean;
	showArtist: boolean;
	onPlay: () => void;
	onPick: OnPick;
}> = ({ item, number, showCover, showArtist, onPlay, onPick }) => {
	const busy = useContext(PickBusyContext);
	const playing = busy(item, 'play');
	return (
		<div className="flex items-center gap-2 py-1.5">
			<button
				type="button"
				onClick={() => !playing && onPlay()}
				aria-busy={playing || undefined}
				aria-label={`Play from ${item.name}`}
				className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
			>
				{/* The number (or cover) turns into a spinner in place while it starts */}
				{showCover ? (
					<span className="relative shrink-0">
						<Artwork src={item.image} className="size-11" />
						{playing && <CoverSpinner className="rounded-md" />}
					</span>
				) : (
					<span className="flex w-7 shrink-0 justify-center text-muted-foreground text-sm tabular-nums">
						{playing ? <Loader2 className="size-4 animate-spin" /> : number}
					</span>
				)}
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium">{item.name}</span>
					{showArtist && item.subtitle && (
						<span className="truncate text-muted-foreground text-xs">{item.subtitle}</span>
					)}
				</span>
			</button>
			<QueueButtons item={item} onPick={onPick} />
		</div>
	);
};

/**
 * An album or playlist: Play, Shuffle, Play next and Add to queue (the whole list, after the current
 * song or at the end), and its tracks in order (from Home Assistant's media browser on the speaker);
 * tapping a track plays the list from it.
 */
const TrackListPage: React.FC<{
	album: MediaItem;
	player: Player;
	onPick: OnPick;
	onPlayFrom: (tracks: MediaItem[], from: number) => void;
	onShuffle: () => void;
	onBack: () => void;
	contained?: boolean;
}> = ({ album, player, onPick, onPlayFrom, onShuffle, onBack, contained = false }) => {
	const { getHass } = useHassApi();
	const [tracks, setTracks] = useState<MediaItem[] | null>(null);
	const isBusy = useContext(PickBusyContext);

	useEffect(() => {
		const hass = getHass();
		if (!hass) return;
		let active = true;
		setTracks(null);
		getTracks(hass, player.entityId, album)
			.then((list) => active && setTracks(list))
			.catch(() => active && setTracks([]));
		return () => {
			active = false;
		};
	}, [album.uri, player.entityId]);

	// A playlist's tracks show their covers and artists; an album's are numbered, naming each
	// track's artist only when they differ (a compilation, a guest)
	const isPlaylist = album.mediaType === 'playlist';
	const albumArtist = album.artists?.[0] ?? album.subtitle;
	const mixed = isPlaylist || !!tracks?.some((t) => t.subtitle && t.subtitle !== albumArtist);

	return (
		<BrowsePageShell onBack={onBack} contained={contained}>
			<div className="flex items-center gap-4">
				<Artwork
					src={album.image}
					fallback={isPlaylist ? ListMusic : Disc3}
					className="size-28 rounded-lg max-sm:size-24"
				/>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						{TYPE_LABEL[album.mediaType]}
					</span>
					<h3 className="line-clamp-2 font-semibold text-2xl leading-tight">{album.name}</h3>
					{album.subtitle && <p className="truncate text-muted-foreground">{album.subtitle}</p>}
					<div className="mt-2 flex flex-wrap gap-2">
						<Button size="lg" onClick={() => onPick(album, 'play')} loading={isBusy(album, 'play')}>
							<Play />
							Play
						</Button>
						<Button variant="outline" size="lg" onClick={onShuffle} loading={isBusy(album, 'shuffle')}>
							<Shuffle />
							Shuffle
						</Button>
						{/* The whole album or playlist after the current song, or at the end, like a track's row */}
						<QueueButtons item={album} onPick={onPick} variant="outline" />
					</div>
				</div>
			</div>
			{!tracks && <Status loading>Loading the tracks…</Status>}
			{tracks && tracks.length === 0 && (
				<Status loading={false}>
					{isPlaylist ? 'This playlist has no songs.' : "Couldn't list this album's tracks."}
				</Status>
			)}
			{tracks && tracks.length > 0 && (
				<Section title={`${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}`}>
					<div className="flex flex-col divide-y">
						{tracks.map((track, i) => (
							// A playlist can hold a song twice
							<TrackRow
								key={`${i}:${track.uri}`}
								item={track}
								number={i + 1}
								showCover={isPlaylist}
								showArtist={mixed}
								onPlay={() => onPlayFrom(tracks, i)}
								onPick={onPick}
							/>
						))}
					</div>
				</Section>
			)}
		</BrowsePageShell>
	);
};

/** Episodes a podcast page loads at a time (newest first; Show more loads the next). */
const EPISODE_PAGE = 50;

/**
 * One of a podcast's episodes: its date and length (or time left), name and show notes; tap plays
 * it, or queue it next / at the end. A started one shows how far along it is.
 */
const EpisodeRow: React.FC<{ episode: PodcastEpisode; podcast: MediaItem; onPick: OnPick }> = ({
	episode,
	podcast,
	onPick,
}) => {
	const busy = useContext(PickBusyContext);
	const item = episodeItem(episode, podcast);
	const playing = busy(item, 'play');
	const { label, progress } = episodeProgress(episode);
	const date = formatEpisodeDate(episode.released);
	return (
		<div className="flex items-start gap-2 py-3">
			<button
				type="button"
				onClick={() => !playing && onPick(item)}
				aria-busy={playing || undefined}
				aria-label={`Play ${episode.name}`}
				className="flex min-w-0 flex-1 flex-col gap-1 text-left"
			>
				<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
					{/* Turns into a spinner in place while it starts */}
					{playing ? <Loader2 className="size-3.5 animate-spin" /> : episode.played && <Check className="size-3.5" />}
					<span className="truncate">{[date, label].filter(Boolean).join(' · ')}</span>
				</span>
				<span className={cn('line-clamp-2 font-medium leading-snug', episode.played && 'text-muted-foreground')}>
					{episode.name}
				</span>
				{episode.description && (
					<span className="line-clamp-2 short:hidden text-muted-foreground text-sm">{episode.description}</span>
				)}
				{progress !== undefined && (
					<Progress
						value={progress * 100}
						aria-label={`${Math.round(progress * 100)}% played`}
						className="mt-1 h-1 max-w-48"
					/>
				)}
			</button>
			<QueueButtons item={item} onPick={onPick} />
		</div>
	);
};

/**
 * A podcast: Play (Music Assistant picks the episode) and its episodes, newest first, from Music
 * Assistant itself (Home Assistant's media browser doesn't list them), a page at a time.
 */
const PodcastPage: React.FC<{
	podcast: MediaItem;
	onPick: OnPick;
	onBack: () => void;
	contained?: boolean;
}> = ({ podcast, onPick, onBack, contained = false }) => {
	const { getHass } = useHassApi();
	// null while loading the first page; undefined when Music Assistant couldn't list them
	const [listing, setListing] = useState<EpisodePage | null | undefined>(null);
	const [loadingMore, setLoadingMore] = useState(false);
	const isBusy = useContext(PickBusyContext);

	useEffect(() => {
		const hass = getHass();
		if (!hass) return;
		let active = true;
		setListing(null);
		getPodcastEpisodes(hass, podcast, { limit: EPISODE_PAGE })
			.then((page) => active && setListing(page))
			.catch(() => active && setListing(undefined));
		return () => {
			active = false;
		};
	}, [podcast.uri]);

	const showMore = () => {
		const hass = getHass();
		if (!hass || !listing) return;
		setLoadingMore(true);
		void getPodcastEpisodes(hass, podcast, { offset: listing.episodes.length, limit: EPISODE_PAGE })
			.then((next) => {
				if (next) setListing((shown) => (shown ? appendEpisodes(shown, next) : shown));
			})
			// The button stays for another try
			.catch(() => {})
			.finally(() => setLoadingMore(false));
	};

	const episodes = listing?.episodes ?? [];

	return (
		<BrowsePageShell onBack={onBack} contained={contained}>
			<div className="flex items-center gap-4">
				<Artwork src={podcast.image} fallback={MEDIA_ICONS.podcast} className="size-28 rounded-lg max-sm:size-24" />
				<div className="flex min-w-0 flex-col gap-1">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						{TYPE_LABEL.podcast}
					</span>
					<h3 className="line-clamp-2 font-semibold text-2xl leading-tight">{podcast.name}</h3>
					{podcast.subtitle && <p className="truncate text-muted-foreground">{podcast.subtitle}</p>}
					<Button
						size="lg"
						onClick={() => onPick(podcast, 'play')}
						loading={isBusy(podcast, 'play')}
						className="mt-2 self-start"
					>
						<Play />
						Play
					</Button>
				</div>
			</div>
			{listing === null && <Status loading>Loading the episodes…</Status>}
			{listing === undefined && <Status loading={false}>Couldn't list this podcast's episodes.</Status>}
			{listing && episodes.length === 0 && <Status loading={false}>This podcast has no episodes.</Status>}
			{listing && episodes.length > 0 && (
				<Section title={`${listing.total} ${listing.total === 1 ? 'episode' : 'episodes'}`}>
					<div className="flex flex-col divide-y">
						{episodes.map((episode) => (
							<EpisodeRow key={episode.uri} episode={episode} podcast={podcast} onPick={onPick} />
						))}
					</div>
					{episodes.length < listing.total && (
						<Button variant="outline" size="lg" onClick={showMore} loading={loadingMore} className="self-center">
							Show more
						</Button>
					)}
				</Section>
			)}
		</BrowsePageShell>
	);
};

/**
 * The artist or album page Browse shows (an album over the artist it came from), else the search.
 * `album` is an album, a playlist or a podcast.
 */
export interface BrowsePage {
	artist: MediaItem | null;
	album: MediaItem | null;
}

/** No artist or album open: Browse shows the search (or the library). */
export const SEARCH_PAGE: BrowsePage = { artist: null, album: null };

/**
 * Browse's sections: a search's results by type, or with no search the library by type, most
 * recently played first (outside the component: the compiler can't take try/finally).
 */
async function loadSections(
	hass: HomeAssistant,
	configEntry: string,
	term: string,
	filter: 'all' | MediaType,
): Promise<{ type: MediaType; items: MediaItem[] }[]> {
	let next: { type: MediaType; items: MediaItem[] }[];
	if (term) {
		const types: MediaType[] =
			filter === 'all' ? ['artist', 'album', 'track', 'playlist', 'radio', 'podcast'] : [filter];
		const results = await searchMusic(hass, configEntry, term, filter === 'all' ? undefined : [filter]);
		next = types.map((type) => ({ type, items: results[RESULT_KEY[type]] }));
	} else {
		const shown: MediaType[] = filter === 'all' ? ['playlist', 'album', 'podcast', 'radio'] : [filter];
		next = await Promise.all(
			shown.map(async (type) => ({
				type,
				items: (await getLibrary(hass, configEntry, type, { orderBy: 'last_played_desc' })).slice(
					0,
					filter === 'all' ? 10 : undefined,
				),
			})),
		);
	}
	return next.filter((section) => section.items.length > 0);
}

/**
 * Search Music Assistant, or browse the library (recently played first, as covers) with an empty
 * search. Tapping plays on the picked speaker (and its group); an artist opens its page.
 */
export const BrowsePanel: React.FC<{
	player: Player;
	source: Player;
	players: Player[];
	controls: MusicControls;
	onPlayed: () => void;
	onSpeakers: () => void;
	/** The open artist or album page (kept by the player, so Now Playing can open one). */
	page: BrowsePage;
	onPage: (page: BrowsePage) => void;
	/** Keep the search and filter pinned and scroll the results under them (the dialog). */
	contained?: boolean;
}> = ({ player, source, players, controls, onPlayed, onSpeakers, page, onPage, contained = false }) => {
	const { getHass } = useHassApi();
	const configEntry = useMusicConfigEntry(player.entityId);
	const [query, setQuery] = useState('');
	const [filter, setFilter] = useState<'all' | MediaType>('all');
	const [sections, setSections] = useState<{ type: MediaType; items: MediaItem[] }[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const { artist, album } = page;
	const term = query.trim();

	useEffect(() => {
		const hass = getHass();
		if (!hass || !configEntry) return;
		let active = true;
		const timer = setTimeout(
			() => {
				setLoading(true);
				setError(false);
				loadSections(hass, configEntry, term, filter)
					.then((next) => active && setSections(next))
					.catch((err) => {
						console.error('Music Assistant browse failed:', err);
						if (active) setError(true);
					})
					.finally(() => active && setLoading(false));
			},
			term ? SEARCH_DEBOUNCE_MS : 0,
		);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [term, filter, configEntry]);

	const pick: OnPick = async (item, enqueue = 'play') => {
		// An artist, album, playlist or podcast opens its page; its own Play button (the open one) plays it
		if (item.mediaType === 'artist' && enqueue === 'play' && artist?.uri !== item.uri) {
			onPage({ artist: item, album: null });
			return;
		}
		if (
			(item.mediaType === 'album' || item.mediaType === 'playlist' || item.mediaType === 'podcast') &&
			enqueue === 'play' &&
			album?.uri !== item.uri
		) {
			onPage({ artist, album: item });
			return;
		}
		const ok = await controls.playItem(player, item, enqueue);
		if (ok && enqueue === 'play') onPlayed();
	};

	const isPickBusy = (item: MediaItem, action: 'play' | 'next' | 'add' | 'shuffle') =>
		controls.isBusy(player, `${action}:${item.uri}`);

	if (album?.mediaType === 'podcast') {
		return (
			<PickBusyContext.Provider value={isPickBusy}>
				<PodcastPage
					podcast={album}
					onPick={pick}
					onBack={() => onPage({ artist, album: null })}
					contained={contained}
				/>
			</PickBusyContext.Provider>
		);
	}

	if (album) {
		return (
			<PickBusyContext.Provider value={isPickBusy}>
				<TrackListPage
					album={album}
					player={player}
					onPick={pick}
					onPlayFrom={async (tracks, from) => {
						if (await controls.playTracks(player, tracks, from, album)) onPlayed();
					}}
					onShuffle={async () => {
						if (await controls.shuffleItem(player, album)) onPlayed();
					}}
					onBack={() => onPage({ artist, album: null })}
					contained={contained}
				/>
			</PickBusyContext.Provider>
		);
	}

	if (artist && configEntry) {
		return (
			<PickBusyContext.Provider value={isPickBusy}>
				<ArtistPage
					artist={artist}
					configEntry={configEntry}
					onPick={pick}
					onBack={() => onPage(SEARCH_PAGE)}
					contained={contained}
				/>
			</PickBusyContext.Provider>
		);
	}

	return (
		<PickBusyContext.Provider value={isPickBusy}>
			<div className={cn('flex flex-col gap-4', contained && 'min-h-0 flex-1')}>
				{/* Where a tap plays, one tap from changing it */}
				<button
					type="button"
					onClick={onSpeakers}
					className="flex shrink-0 items-center gap-2 self-start text-muted-foreground text-sm hover:text-foreground"
				>
					<Speaker className="size-4" />
					<span>
						Plays on <span className="font-medium text-foreground">{speakerNames(source, players)}</span>
					</span>
					<ChevronRight className="size-4" />
				</button>

				<div className="relative shrink-0">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="search"
						value={query}
						onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
						placeholder="Search music, radio and podcasts…"
						aria-label="Search music"
						className="h-12 pl-9 text-base md:text-base"
					/>
				</div>

				<div className="-mx-1 shrink-0 overflow-x-auto px-1">
					<ToggleGroup
						variant="outline"
						value={filter}
						onValueChange={(value) => setFilter(value as 'all' | MediaType)}
						aria-label="Kind of music"
					>
						{FILTERS.map(({ value, label }) => (
							<ToggleGroupItem key={value} value={value} className="px-3">
								{label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>

				{/* The results: everything above stays put while these scroll (contained) */}
				<div className={cn('flex flex-col gap-4', contained && '-m-1 min-h-0 flex-1 overflow-y-auto p-1')}>
					{!configEntry && <Status loading>Connecting to Music Assistant…</Status>}
					{error && <p className="text-destructive text-sm">Couldn't reach Music Assistant. Try again.</p>}
					{loading && sections.length === 0 && <Status loading>{term ? 'Searching…' : 'Loading your library…'}</Status>}
					{!loading && !error && configEntry && sections.length === 0 && (
						<Status loading={false}>{term ? `Nothing found for "${term}".` : 'Nothing here yet.'}</Status>
					)}

					{sections.map((section) => (
						<Section
							key={section.type}
							title={term || filter !== 'all' ? SECTION_TITLE[section.type] : `Recent ${SECTION_TITLE[section.type]}`}
							dim={loading}
						>
							{/* Covers to browse the library; rows (with queue actions) for search results and songs */}
							{!term && section.type !== 'track' ? (
								<TileGrid items={section.items} onPick={pick} />
							) : (
								<div className="flex flex-col divide-y">
									{section.items.map((item) => (
										<MediaRow key={item.uri} item={item} onPick={pick} />
									))}
								</div>
							)}
						</Section>
					))}
				</div>
			</div>
		</PickBusyContext.Provider>
	);
};
