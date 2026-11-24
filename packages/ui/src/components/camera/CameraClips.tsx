/**
 * The Cameras dialog's Clips tab: a camera's recorded events by day, filtered by type and range,
 * each opening in the clip player.
 *
 * @module
 */

import { Film, RefreshCw, VideoOff } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/compat';
import { useHassApi, useHassReady } from '../../context/HassContext';
import type { CameraDevice } from '../../lib/cameras';
import {
	CLIP_FILTERS,
	CLIP_RANGES,
	type Clip,
	type ClipFilter,
	type ClipRange,
	formatClipDuration,
	formatClipTime,
	groupClipsByDay,
} from '../../lib/clips';
import { cn } from '../../lib/utils';
import { Badge, Button, ChipRow, EmptyState, ToggleGroup, ToggleGroupItem } from '../ui';
import { ClipPlayer } from './ClipPlayer';
import { CLIP_ICONS, signedThumbnail } from './clipShared';
import { useCameraClips } from './useCameraClips';

export { CLIP_ICONS } from './clipShared';

const clipCaption = (clip: Clip) =>
	`${clip.label} · ${formatClipTime(clip.start)} · ${formatClipDuration(clip.duration)}`;

/** A clip's thumbnail, signed and loaded once it scrolls into view. */
const ClipThumbnail: React.FC<{ clip: Clip }> = ({ clip }) => {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const ref = useRef<HTMLDivElement>(null);
	const [src, setSrc] = useState<string>();
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		const element = ref.current;
		const hass = getHass();
		if (!clip.thumbnail || !ready || !hass || !element) return;
		let active = true;
		const load = () =>
			signedThumbnail(hass, clip)
				?.then((url) => active && setSrc(url))
				.catch(() => active && setFailed(true));
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					observer.disconnect();
					load();
				}
			},
			{ rootMargin: '200px' },
		);
		observer.observe(element);
		return () => {
			active = false;
			observer.disconnect();
		};
	}, [clip.thumbnail, ready]);

	const Icon = CLIP_ICONS[clip.kind];
	return (
		<div ref={ref} className="flex size-full items-center justify-center bg-muted text-muted-foreground">
			{src && !failed ? (
				<img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
			) : (
				<Icon className="size-6" />
			)}
		</div>
	);
};

const ClipTile: React.FC<{ clip: Clip; selected: boolean; onSelect: () => void }> = ({ clip, selected, onSelect }) => {
	const Icon = CLIP_ICONS[clip.kind];
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			aria-label={clipCaption(clip)}
			className="group relative aspect-video w-full overflow-hidden rounded-lg border bg-muted outline-none ring-offset-2 ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-primary"
		>
			<ClipThumbnail clip={clip} />
			<span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-white tabular-nums">
				{formatClipDuration(clip.duration)}
			</span>
			<span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-linear-to-t from-black/80 to-transparent px-2 pt-5 pb-1.5 text-left text-white">
				<Icon className="size-3.5 shrink-0" />
				<span className="truncate font-medium text-xs">{clip.label}</span>
				<span className="ml-auto shrink-0 text-white/80 text-xs tabular-nums">{formatClipTime(clip.start)}</span>
			</span>
		</button>
	);
};

/**
 * Recorded events for a camera from UniFi Protect: a player for the picked clip, then the clips of
 * the last 24 hours / 7 days / 30 days, filterable by event type, grouped by day, newest first.
 */
export const CameraClips: React.FC<{ camera: CameraDevice }> = ({ camera }) => {
	const [filter, setFilter] = useState<ClipFilter>('all');
	const [days, setDays] = useState<ClipRange>(1);
	const [selectedId, setSelectedId] = useState<string>();
	// The newest clip loads ready to play; one picked by hand starts playing
	const [picked, setPicked] = useState(false);
	const state = useCameraClips(camera.id, filter, days);

	const clips = state.status === 'ready' ? state.clips : [];
	const index = Math.max(
		0,
		clips.findIndex((c) => c.id === selectedId),
	);
	const selected = clips[index];
	const pick = (clip: Clip) => {
		setSelectedId(clip.id);
		setPicked(true);
	};
	const filters = 'filters' in state ? state.filters : [];

	if (state.status === 'unsupported') {
		return (
			<EmptyState icon={<VideoOff className="size-10" />} className="flex-1 justify-center">
				{camera.label} doesn't record events to UniFi Protect
			</EmptyState>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<ClipPlayer
				clip={selected}
				cameraName={camera.label}
				autoPlay={picked}
				onPrevious={index > 0 ? () => pick(clips[index - 1]) : undefined}
				onNext={index < clips.length - 1 ? () => pick(clips[index + 1]) : undefined}
				// Phones keep the player fixed at the top: only the clips under it scroll
				className="flex-3 max-md:flex-none"
			/>

			<ChipRow className="shrink-0">
				<ToggleGroup
					variant="outline"
					value={String(days)}
					onValueChange={(value) => value && setDays(Number(value) as ClipRange)}
					aria-label="How far back"
				>
					{CLIP_RANGES.map((range) => (
						<ToggleGroupItem key={range.days} value={String(range.days)} className="px-3">
							{range.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
				{filters.length > 1 && (
					<ToggleGroup
						variant="outline"
						value={filter}
						onValueChange={(value) => value && setFilter(value as ClipFilter)}
						aria-label="Event type"
					>
						{CLIP_FILTERS.filter((f) => filters.includes(f.id)).map((f) => (
							<ToggleGroupItem key={f.id} value={f.id} className="px-3">
								{f.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				)}
				<Button
					variant="ghost"
					size="icon"
					onClick={state.reload}
					disabled={state.status === 'loading'}
					aria-label="Refresh clips"
					className="ml-auto"
				>
					<RefreshCw className={cn(state.status === 'loading' && 'animate-spin')} />
				</Button>
			</ChipRow>

			<div className="min-h-0 flex-2 overflow-y-auto p-1 max-md:flex-1">
				{state.status === 'error' ? (
					<EmptyState icon={<VideoOff className="size-10" />} onRetry={state.reload}>
						Couldn't load clips from UniFi Protect
					</EmptyState>
				) : state.status === 'loading' && clips.length === 0 ? (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
						{['a', 'b', 'c', 'd', 'e', 'f'].map((key) => (
							<div key={key} className="aspect-video animate-pulse rounded-lg bg-muted" />
						))}
					</div>
				) : clips.length === 0 ? (
					<EmptyState icon={<Film className="size-10" />}>
						No {filter === 'all' ? 'clips' : `${CLIP_FILTERS.find((f) => f.id === filter)?.label.toLowerCase()}`} in the
						last {CLIP_RANGES.find((r) => r.days === days)?.label}
					</EmptyState>
				) : (
					<div className="flex flex-col gap-4">
						{groupClipsByDay(clips).map((group) => (
							<section key={group.day} className="flex flex-col gap-2">
								<h4 className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
									{group.day}
									<Badge variant="secondary" className="font-normal normal-case tracking-normal">
										{group.clips.length}
									</Badge>
								</h4>
								<div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
									{group.clips.map((clip) => (
										<ClipTile
											key={clip.id}
											clip={clip}
											selected={clip.id === selected?.id}
											onSelect={() => pick(clip)}
										/>
									))}
								</div>
							</section>
						))}
					</div>
				)}
			</div>
		</div>
	);
};
