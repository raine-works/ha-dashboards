import {
	ArrowDown,
	ArrowUp,
	EllipsisVertical,
	GripVertical,
	ListEnd,
	ListMusic,
	Loader2,
	Play,
	Trash2,
} from 'lucide-react';
import type React from 'preact/compat';
import { memo, useEffect, useState } from 'preact/compat';
import { useHassApi } from '../../context/HassContext';
import { useStableCallbacks } from '../../hooks/useStableCallbacks';
import {
	applyQueueEdit,
	editQueue,
	formatTrackTime,
	type MediaItem,
	type MusicPlayer as Player,
	type QueueEdit,
	type QueueEntry,
} from '../../lib/music';
import { dragShift, dragTarget, edgeScroll } from '../../lib/reorder';
import { hapticTap } from '../../lib/tones';
import { cn } from '../../lib/utils';
import { Button, EmptyState, Popover, PopoverContent, PopoverTrigger, toast } from '../ui';
import { Artwork, PlayingBars } from './Artwork';
import { useQueuePage } from './useQueue';

/** Songs read at a time; Show more reads this many more */
const PAGE = 50;
// The rows' gap (gap-1), part of the distance from one row to the next
const ROW_GAP_PX = 4;

/** A song being dragged by its grip: where it started, where the finger is, how far the list scrolled. */
interface Drag {
	id: string;
	/** Its place among the upcoming songs. */
	from: number;
	startY: number;
	y: number;
	startScroll: number;
	scroll: number;
	/** One row's height plus the gap: how far the finger moves to pass a song. */
	row: number;
}

// What scrolls during a drag (the dialog's tab, or the page on a phone), looked up and scrolled out
// here: the React Compiler skips a component that changes an element it holds
let dragScroller: HTMLElement | null = null;
const holdScroller = (el: HTMLElement | null) => {
	dragScroller = el;
};
const heldScroller = () => dragScroller;

/** The nearest scrolling ancestor, crossing out of the shadow root, else the page. */
function scrollerOf(el: Element | null): HTMLElement {
	let node: Element | null = el;
	while (node) {
		const style = getComputedStyle(node);
		if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node as HTMLElement;
		node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host || null);
	}
	return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

/** A song's menu: play it now or next, move it a place, take it out. */
const EntryMenu: React.FC<{
	entry: QueueEntry;
	first: boolean;
	last: boolean;
	onEdit: (edit: QueueEdit) => void;
}> = ({ entry, first, last, onEdit }) => {
	const [open, setOpen] = useState(false);
	const item = (label: string, Icon: typeof Play, edit: QueueEdit, disabled = false, destructive = false) => (
		<Button
			variant="ghost"
			size="lg"
			disabled={disabled}
			onClick={() => {
				setOpen(false);
				onEdit(edit);
			}}
			className={cn('w-full justify-start gap-3', destructive && 'text-destructive')}
		>
			<Icon />
			{label}
		</Button>
	);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="ghost" size="icon-lg" aria-label={`More for ${entry.name}`} title="More">
					<EllipsisVertical className="size-5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="flex w-52 flex-col gap-0.5 p-1.5">
				{item('Play now', Play, { action: 'play' })}
				{item('Play next', ListEnd, { action: 'move', shift: 0 }, first)}
				{item('Move up', ArrowUp, { action: 'move', shift: -1 }, first)}
				{item('Move down', ArrowDown, { action: 'move', shift: 1 }, last)}
				{item('Remove', Trash2, { action: 'remove' }, false, true)}
			</PopoverContent>
		</Popover>
	);
};

/** One song: its cover, name and artist, length; tap to play from it. The playing one is marked. */
const EntryRow: React.FC<{
	entry: QueueEntry;
	playing: boolean;
	paused: boolean;
	busy: boolean;
	/** The drag grip, before the cover. */
	grip?: React.ReactNode;
	menu?: React.ReactNode;
	onPlay?: () => void;
	/** Being dragged: lifted over the others. */
	lifted?: boolean;
	/** How far it's slid (px) while a song is dragged. */
	offset?: number;
}> = ({ entry, playing, paused, busy, grip, menu, onPlay, lifted = false, offset }) => (
	<div
		data-queue-row
		style={offset !== undefined ? { transform: `translateY(${offset}px)` } : undefined}
		className={cn(
			'flex items-center gap-2 rounded-lg py-1.5 pr-1',
			grip ? 'pl-0' : 'pl-2',
			playing && 'bg-accent',
			lifted
				? 'relative z-10 bg-card shadow-lg ring-1 ring-border'
				: offset !== undefined && 'transition-transform duration-150',
		)}
	>
		{grip}
		<button
			type="button"
			onClick={onPlay}
			disabled={!onPlay}
			aria-label={playing ? `Now playing: ${entry.name}` : `Play from ${entry.name}`}
			className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
		>
			<span className="relative shrink-0">
				<Artwork src={entry.image} className="size-11" />
				{(busy || playing) && (
					<span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/45 text-white">
						{busy ? <Loader2 className="size-4 animate-spin" /> : <PlayingBars paused={paused} />}
					</span>
				)}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className={cn('truncate font-medium', playing && 'text-primary')}>{entry.name}</span>
				{entry.artist && <span className="truncate text-muted-foreground text-xs">{entry.artist}</span>}
			</span>
			{entry.duration !== undefined && (
				<span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
					{formatTrackTime(entry.duration)}
				</span>
			)}
		</button>
		{menu}
	</div>
);

/** What an Up next row does, the same functions every render (`useStableCallbacks`). */
interface QueueHandlers {
	startDrag: (entry: QueueEntry, from: number, e: React.PointerEvent<HTMLElement>) => void;
	moveDrag: (entryId: string, y: number) => void;
	endDrag: (entry: QueueEntry, cancelled: boolean) => void;
	edit: (entry: QueueEntry, change: QueueEdit) => void;
}

/**
 * An Up next song (`memo`): its props are its own (where it is, whether it's dragged or busy, how far
 * it's slid) plus stable handlers, so a drag re-renders the dragged row on each pointer move and the
 * others only as it passes them, not the whole queue.
 */
const UpcomingRowContent: React.FC<{
	entry: QueueEntry;
	index: number;
	first: boolean;
	last: boolean;
	busy: boolean;
	lifted: boolean;
	offset?: number;
	handlers: QueueHandlers;
}> = ({ entry, index, first, last, busy, lifted, offset, handlers }) => (
	<EntryRow
		entry={entry}
		playing={false}
		paused={false}
		busy={busy}
		lifted={lifted}
		offset={offset}
		// Drag by the grip (a scroll anywhere else still scrolls); the menu moves it by keyboard
		grip={
			<span
				aria-hidden
				onPointerDown={(e) => handlers.startDrag(entry, index, e)}
				onPointerMove={(e) => handlers.moveDrag(entry.id, e.clientY)}
				onPointerUp={() => handlers.endDrag(entry, false)}
				onPointerCancel={() => handlers.endDrag(entry, true)}
				className={cn(
					'flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground',
					lifted && 'cursor-grabbing text-foreground',
				)}
			>
				<GripVertical className="size-5" />
			</span>
		}
		onPlay={() => handlers.edit(entry, { action: 'play' })}
		menu={<EntryMenu entry={entry} first={first} last={last} onEdit={(change) => handlers.edit(entry, change)} />}
	/>
);
const UpcomingRow = memo(UpcomingRowContent);

/**
 * The music player's Queue tab: the speaker's whole queue from Music Assistant (Home Assistant shows
 * only the next song), from the playing song on: tap a song to play from it, drag it by its grip to
 * a new place (the others slide aside, a tick as it passes each, the list scrolling when held near an
 * edge), or use its menu to play it next, move it up or down, or take it out. Edits show at once and the queue is read again after;
 * it's also read on every new song and every 15 seconds while open (nothing announces other edits).
 */
export const QueuePanel: React.FC<{
	/** The speaker whose queue it is (a group's leader). */
	player: Player;
	active: boolean;
	/** Open the playlist or album the queue was started from. */
	onOpen: (item: MediaItem) => void;
}> = ({ player, active, onOpen }) => {
	const { getHass } = useHassApi();
	const [limit, setLimit] = useState(PAGE);
	const [drag, setDrag] = useState<Drag | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	// Not read mid-drag (the list never changes under the finger) or while an edit is on its way (a
	// read from before Music Assistant applied it would put the old order back)
	const { page, setPage, reload } = useQueuePage(player, active && !drag && !busy, limit);

	const upcomingCount = page
		? page.entries[0]?.index === page.currentIndex
			? page.entries.length - 1
			: page.entries.length
		: 0;
	const dragDy = drag ? drag.y - drag.startY + drag.scroll - drag.startScroll : 0;
	const target = drag ? dragTarget(drag.from, dragDy, drag.row, upcomingCount) : -1;

	// A light tick as a song is picked up and as it passes another
	useEffect(() => {
		if (target >= 0) hapticTap(6);
	}, [target]);

	// Held near the top or bottom edge: scroll that way, so a song can travel past what's on screen
	useEffect(() => {
		const scroller = heldScroller();
		if (!drag || !scroller) return;
		const y = drag.y;
		const timer = setInterval(() => {
			const page = scroller === document.scrollingElement;
			const rect = page ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
			const step = edgeScroll(y, rect.top, rect.bottom);
			if (!step) return;
			const before = scroller.scrollTop;
			scroller.scrollTop = before + step;
			const after = scroller.scrollTop;
			if (after !== before) setDrag((prev) => (prev ? { ...prev, scroll: after } : prev));
		}, 16);
		return () => clearInterval(timer);
	}, [drag?.id, drag?.y]);

	// Every row's handlers, the same functions every render (before the early returns: a hook)
	const edit = (entry: QueueEntry, change: QueueEdit) => {
		const hass = getHass();
		if (!hass || busy || !page) return;
		setBusy(entry.id);
		// Shown at once; Music Assistant's own order replaces it when the queue is read again
		setPage({ ...page, entries: applyQueueEdit(page.entries, entry.id, change, page.currentIndex) });
		editQueue(hass, player, entry.id, change)
			.catch((err) =>
				toast.error(
					change.action === 'remove'
						? `Couldn't remove ${entry.name}`
						: change.action === 'play'
							? `Couldn't play ${entry.name}`
							: `Couldn't move ${entry.name}`,
					{ description: (err as Error).message },
				),
			)
			.then(() => {
				setBusy(null);
				reload();
			});
	};

	const startDrag = (entry: QueueEntry, from: number, e: React.PointerEvent<HTMLElement>) => {
		if (busy || drag) return;
		e.preventDefault();
		const handle = e.currentTarget as HTMLElement;
		handle.setPointerCapture(e.pointerId);
		const row = handle.closest('[data-queue-row]');
		const scroller = scrollerOf(row);
		holdScroller(scroller);
		const scroll = scroller.scrollTop;
		setDrag({
			id: entry.id,
			from,
			startY: e.clientY,
			y: e.clientY,
			startScroll: scroll,
			scroll,
			row: (row?.getBoundingClientRect().height ?? 56) + ROW_GAP_PX,
		});
	};
	// Let go: one move of that many places (Music Assistant's move_item), shown at once
	const endDrag = (entry: QueueEntry, cancelled: boolean) => {
		if (!drag) return;
		const to = target;
		setDrag(null);
		holdScroller(null);
		if (!cancelled && to >= 0 && to !== drag.from) edit(entry, { action: 'move', shift: to - drag.from });
	};
	const moveDrag = (entryId: string, y: number) =>
		setDrag((prev) => (prev && prev.id === entryId ? { ...prev, y } : prev));
	const handlers = useStableCallbacks({ startDrag, moveDrag, endDrag, edit });

	if (page === undefined)
		return (
			<p className="flex items-center gap-2 text-muted-foreground text-sm">
				<Loader2 className="size-4 animate-spin" />
				Loading the queue…
			</p>
		);
	if (page === null || page.entries.length === 0)
		return (
			<EmptyState icon={<ListMusic className="size-10" />} onRetry={page === null ? reload : undefined}>
				{page === null ? "Couldn't read the queue from Music Assistant." : 'Nothing in the queue.'}
			</EmptyState>
		);

	// The page starts at the playing song (unless the queue moved on since it was read)
	const startsAtCurrent = page.entries[0]?.index === page.currentIndex;
	const current = startsAtCurrent ? page.entries[0] : undefined;
	const upcoming = startsAtCurrent ? page.entries.slice(1) : page.entries;
	const left = Math.max(0, page.total - page.currentIndex - 1);

	return (
		<div className="flex flex-col gap-4">
			{/* Where it came from, and how much is left */}
			<div className="flex items-center gap-3">
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						{page.source ? `Playing from ${page.source.mediaType === 'album' ? 'album' : 'playlist'}` : 'Queue'}
					</span>
					{page.source ? (
						<button
							type="button"
							onClick={() => page.source && onOpen(page.source)}
							className="truncate text-left font-semibold text-lg hover:underline"
						>
							{page.source.name}
						</button>
					) : (
						<span className="font-semibold text-lg">{player.name}</span>
					)}
				</div>
				<span className="shrink-0 text-muted-foreground text-sm">
					{left} {left === 1 ? 'song' : 'songs'} to go
				</span>
			</div>

			{current && (
				<section className="flex flex-col gap-1">
					<h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Now playing</h4>
					{/* Spacers where the others have their grip and menu, so the cover and time line up with theirs */}
					<EntryRow
						entry={current}
						playing
						paused={player.state !== 'playing'}
						busy={busy === current.id}
						grip={<span aria-hidden className="w-8 shrink-0" />}
						menu={<span aria-hidden className="size-10 touch:size-12 shrink-0" />}
					/>
				</section>
			)}

			<section className="flex flex-col gap-1">
				<h4 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">Up next</h4>
				{upcoming.length === 0 && <p className="text-muted-foreground text-sm">Nothing after this.</p>}
				{upcoming.map((entry, i) => (
					<UpcomingRow
						key={entry.id}
						entry={entry}
						index={i}
						first={i === 0}
						last={i === upcoming.length - 1 && page.offset + page.entries.length >= page.total}
						busy={busy === entry.id}
						lifted={drag?.id === entry.id}
						offset={drag ? (drag.id === entry.id ? dragDy : dragShift(i, drag.from, target, drag.row)) : undefined}
						handlers={handlers}
					/>
				))}
				{page.offset + page.entries.length < page.total && (
					<Button variant="outline" onClick={() => setLimit((n) => n + PAGE)} className="mt-2 self-center">
						Show more
					</Button>
				)}
			</section>
		</div>
	);
};
