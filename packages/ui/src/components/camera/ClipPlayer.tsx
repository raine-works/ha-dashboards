import {
	ChevronLeft,
	ChevronRight,
	Download,
	Maximize,
	Minimize,
	Pause,
	Play,
	Video,
	VideoOff,
	Volume2,
	VolumeX,
	ZoomOut,
} from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady } from '../../context/HassContext';
import { useWallPanel } from '../../context/WallPanel';
import {
	type Clip,
	clipFileName,
	downloadClip,
	formatClipClock,
	formatClipDuration,
	formatClipPosition,
	formatClipTime,
	nextClipSpeed,
} from '../../lib/clips';
import { cn } from '../../lib/utils';
import { formatZoom } from '../../lib/zoom';
import { Badge, Button, buttonVariants, markDialogActivity } from '../ui';
import { CLIP_ICONS, signedThumbnail } from './clipShared';
import { resolveClip } from './useCameraClips';
import { useClipFrames } from './useClipFrames';
import { useFullscreen } from './useFullscreen';
import { usePinchZoom } from './usePinchZoom';

// While a clip plays, tell the dialog it's in use this often (its idle timer closes it at 2 min)
const ACTIVITY_PING_MS = 20_000;
// Arrow keys on the scrubber step this far
const KEY_STEP_S = 5;

// A transparent poster: without one, Android's WebView draws its own gray play-icon placeholder
// over the player until the first frame arrives
const BLANK_POSTER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// iOS saves a video through the share sheet (Save Video), not a download; everywhere else a link does
const isIos = () =>
	typeof navigator !== 'undefined' &&
	(/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// The playing video, looked up and changed out here: the React Compiler won't let a component
// change an element it holds in state
const videoIn = (root: HTMLElement | null) => root?.querySelector('video') ?? null;
const isPlaying = (root: HTMLElement | null) => {
	const video = videoIn(root);
	return !!video && !video.paused && !video.ended;
};
const playVideo = (root: HTMLElement | null) =>
	void videoIn(root)
		?.play()
		.catch(() => {});
const pauseVideo = (root: HTMLElement | null) => videoIn(root)?.pause();
function setVideo(root: HTMLElement | null, change: { time?: number; rate?: number }) {
	const video = videoIn(root);
	if (!video) return;
	if (change.time !== undefined) video.currentTime = change.time;
	if (change.rate !== undefined) video.playbackRate = change.rate;
}

// The clip plays from a local copy, downloaded whole (`downloadClip()`), never from the stream:
// Home Assistant serves Protect clips without range requests, so a browser couldn't seek in the
// stream; Protect puts a clip's index at its end, so the stream couldn't start any sooner anyway;
// and since UniFi OS 6.0.17 the stream breaks off at its last 4KB, which left the video loading forever
// while the browser fetched it again and again. A seek before the copy is in waits for it
// (`pendingSeek`), as does whether to play (`swapResume`). Module state, for the one clip that
// plays at a time (the compiler skips a component that writes a ref).
let pendingSeek: number | null = null;
let swapResume: { time: number; play: boolean } | null = null;

// The last ping, for the one clip that plays at a time (module state: the compiler skips a
// component that writes a ref)
let lastPing = 0;
const pingDialog = () => {
	if (Date.now() - lastPing < ACTIVITY_PING_MS) return;
	lastPing = Date.now();
	markDialogActivity();
};

const caption = (clip: Clip) => `${clip.label} · ${formatClipTime(clip.start)} · ${formatClipDuration(clip.duration)}`;

/**
 * The clip's scrubber, under the video: a strip of its frames (as they arrive; a plain bar until
 * then) with what's been played bright, a playhead, and while dragging a preview above it of the frame there with the
 * time of day and position. Drag or tap to seek; arrows step 5s. Pinch-zoom leaves it alone.
 */
const Scrubber: React.FC<{
	clip: Clip;
	position: number;
	duration: number;
	frames: (string | undefined)[];
	onScrub: (time: number) => void;
	onScrubEnd: () => void;
	/** Jump there without pausing (the arrow keys). */
	onSeek: (time: number) => void;
	scrubbing: boolean;
	/** Playing: the playhead glides between the video's time updates (about 4 a second). */
	playing: boolean;
}> = ({ clip, position, duration, frames, onScrub, onScrubEnd, onSeek, scrubbing, playing }) => {
	const fraction = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
	const pct = `${fraction * 100}%`;
	const glide = playing && !scrubbing;
	const frame = frames.length ? frames[Math.min(frames.length - 1, Math.floor(fraction * frames.length))] : undefined;

	const timeAt = (e: React.PointerEvent<HTMLDivElement>) => {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width))) * duration;
	};

	return (
		<div className="relative" data-zoom-ignore>
			{/* While dragging: the frame under the finger, the time of day there and the position */}
			{scrubbing && (
				<div
					className="pointer-events-none absolute bottom-full z-10 mb-2 flex w-36 -translate-x-1/2 flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
					style={{ left: `clamp(4.5rem, ${pct}, calc(100% - 4.5rem))` }}
				>
					{frame ? <img src={frame} alt="" className="aspect-video w-full object-cover" /> : null}
					<div className="flex items-center justify-between gap-2 px-2 py-1 text-xs tabular-nums">
						<span className="font-medium">{formatClipClock(clip.start, position)}</span>
						<span className="text-muted-foreground">{formatClipPosition(position)}</span>
					</div>
				</div>
			)}
			<div
				role="slider"
				tabIndex={0}
				aria-label="Seek"
				aria-valuemin={0}
				aria-valuemax={Math.round(duration)}
				aria-valuenow={Math.round(position)}
				aria-valuetext={`${formatClipPosition(position)}, ${formatClipClock(clip.start, position)}`}
				onPointerDown={(e) => {
					if (!duration) return;
					(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
					onScrub(timeAt(e));
				}}
				onPointerMove={(e) => {
					if (scrubbing) onScrub(timeAt(e));
				}}
				onPointerUp={() => onScrubEnd()}
				onPointerCancel={() => scrubbing && onScrubEnd()}
				onKeyDown={(e) => {
					const step = { ArrowRight: KEY_STEP_S, ArrowLeft: -KEY_STEP_S }[e.key];
					if (!step || !duration) return;
					e.preventDefault();
					onSeek(Math.min(duration, Math.max(0, position + step)));
				}}
				className="relative h-12 cursor-pointer touch-none select-none overflow-hidden rounded-md bg-muted outline-none ring-ring/50 focus-visible:ring-[3px]"
			>
				{frames.length > 0 && (
					<div className="absolute inset-0 flex">
						{frames.map((src, i) =>
							src ? (
								<img key={i} src={src} alt="" className="h-full min-w-0 flex-1 object-cover" />
							) : (
								<div key={i} className="h-full min-w-0 flex-1 animate-pulse bg-muted-foreground/15" />
							),
						)}
					</div>
				)}
				{/* What's still to play is dimmed */}
				<div
					className={cn(
						'absolute inset-y-0 right-0 bg-background/60',
						glide && 'transition-[left] duration-300 ease-linear',
					)}
					style={{ left: pct }}
				/>
				<div
					className={cn(
						'absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_0_1px_var(--background)]',
						glide && 'transition-[left] duration-300 ease-linear',
					)}
					style={{ left: pct }}
				/>
			</div>
		</div>
	);
};

/**
 * Plays one clip (the signed MP4 Protect serves through Home Assistant) in the panel's own player:
 * a frame scrubber with the time of day, play/pause, speed (1×, 2×, 4×), sound, saving the clip
 * (not on the wall panels; the share sheet on iOS), full screen (the browser's, else filling the
 * window) and pinch to zoom (as the live view), with previous / next under it.
 */
export const ClipPlayer: React.FC<{
	clip?: Clip;
	/** For the saved file's name. */
	cameraName: string;
	autoPlay: boolean;
	onPrevious?: () => void;
	onNext?: () => void;
	className?: string;
}> = ({ clip, cameraName, autoPlay, onPrevious, onNext, className }) => {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const wallPanel = useWallPanel();
	const [url, setUrl] = useState<string>();
	const [error, setError] = useState(false);
	// The video has its first frame; until then the clip's thumbnail stands in
	const [loaded, setLoaded] = useState(false);
	// Ready to play (iOS fetches no frame before Play, so this can come long before `loaded`)
	const [playable, setPlayable] = useState(false);
	const [poster, setPoster] = useState<string>();
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [playing, setPlaying] = useState(false);
	const [time, setTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [muted, setMuted] = useState(false);
	const [speed, setSpeed] = useState(1);
	// The position under the finger while scrubbing, and whether it was playing before
	const [scrub, setScrub] = useState<{ time: number; resume: boolean } | null>(null);
	// The browser's full screen, or (where an element can't go full screen: iPhones) filling the window
	// The whole clip, downloaded (seekable; and a file, so Save on iOS opens the share sheet within the tap)
	const [local, setLocal] = useState<{ for: string; src: string; file: File }>();
	const localReady = !!url && local?.for === url;
	const src = localReady ? local.src : undefined;
	// How much of the clip has arrived (0–1), shown while it downloads
	const [progress, setProgress] = useState(0);
	const zoom = usePinchZoom(loaded && !error);
	// The stills come from the local copy too (a copy of the stream can't seek either)
	const frames = useClipFrames(localReady ? local.src : undefined, loaded && !error);
	const fileName = clip ? clipFileName(cameraName, clip) : 'clip.mp4';
	const canSave = !wallPanel && !!url && !error;

	useEffect(() => {
		setUrl(undefined);
		setError(false);
		setLoaded(false);
		setPlayable(false);
		setPoster(undefined);
		setTime(0);
		setDuration(clip?.duration ?? 0);
		setScrub(null);
		pendingSeek = null;
		swapResume = null;
		zoom.reset();
		const hass = getHass();
		if (!clip || !ready || !hass) return;
		let active = true;
		resolveClip(hass, clip)
			.then((resolved) => active && setUrl(resolved))
			.catch(() => active && setError(true));
		// Usually already signed for its tile
		signedThumbnail(hass, clip)
			?.then((src) => active && setPoster(src))
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [clip?.id, ready]);

	// A new source resets the rate, so set it again with each clip (and its local copy)
	useEffect(() => {
		setVideo(container, { rate: speed });
	}, [container, speed, src]);

	useEffect(() => {
		if (!url) return;
		let active = true;
		let objectUrl: string | undefined;
		setProgress(0);
		// Another clip (or the dialog closing) stops the download: a whole clip on a wall panel's Wi-Fi
		const download = new AbortController();
		downloadClip(url, download.signal, (fraction) => active && setProgress(fraction))
			.then((blob) => {
				if (!active) return;
				const video = videoIn(container);
				// Where the stream is, to pick up there (unless a seek already said where, and whether to play)
				if (!swapResume)
					swapResume = {
						time: video?.currentTime ?? 0,
						play: isPlaying(container) || (autoPlay && !video?.played.length),
					};
				objectUrl = URL.createObjectURL(blob);
				setLocal({ for: url, src: objectUrl, file: new File([blob], fileName, { type: 'video/mp4' }) });
			})
			.catch(() => active && setError(true));
		return () => {
			active = false;
			download.abort();
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [url]);

	// Seek now on the local copy; on the stream, once the copy is in
	const seekTo = (to: number) => {
		if (localReady) setVideo(container, { time: to });
		else pendingSeek = to;
	};

	const { fullscreen, windowFull, toggle: toggleFullscreen } = useFullscreen(container);
	// Going full screen (or back) starts unzoomed: the picture's size changes
	useEffect(() => {
		zoom.reset();
	}, [fullscreen]);

	const togglePlay = () => (isPlaying(container) ? pauseVideo(container) : playVideo(container));

	// Paused while scrubbing (the video follows the finger), playing again after if it was
	const onScrub = (to: number) => {
		const resume = scrub ? scrub.resume : isPlaying(container);
		if (!scrub && resume) pauseVideo(container);
		setScrub({ time: to, resume });
		seekTo(to);
		setTime(to);
	};
	const onScrubEnd = () => {
		// Waiting for the local copy: it plays on from there when it's in
		if (pendingSeek !== null) swapResume = { time: pendingSeek, play: !!scrub?.resume };
		else if (scrub?.resume) playVideo(container);
		setScrub(null);
	};
	const onSeek = (to: number) => {
		if (pendingSeek === null && !localReady) {
			swapResume = { time: to, play: isPlaying(container) };
			pauseVideo(container);
		}
		seekTo(to);
		setTime(to);
	};

	const save = (e: React.MouseEvent<HTMLAnchorElement>) => {
		const files = localReady && isIos() ? [local.file] : undefined;
		if (!files || !navigator.canShare?.({ files })) return; // the link downloads it
		e.preventDefault();
		void navigator.share({ files, title: fileName }).catch(() => {});
	};

	const position = scrub?.time ?? time;
	const Icon = clip ? CLIP_ICONS[clip.kind] : Video;
	const controlsShown = playable && !error;
	// Full screen is watched from further away: 56px targets
	const iconSize = fullscreen ? 'icon-2xl' : 'icon-lg';

	return (
		<div className={cn('flex min-h-0 flex-col gap-2', className)}>
			{/* The video with its scrubber and controls under it: what goes full screen */}
			<div
				ref={setContainer}
				className={cn(
					'flex min-h-0 flex-1 flex-col gap-2 max-md:flex-none',
					fullscreen && 'bg-background p-3 pb-[max(--spacing(3),env(safe-area-inset-bottom))]',
					// Filling the window where the browser's full screen isn't available (below the toolbar)
					windowFull && 'fixed inset-x-0 top-(--panel-top) bottom-0 z-55 flex-none!',
				)}
			>
				<div
					className={cn(
						'relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-black max-md:aspect-video max-md:flex-none',
						fullscreen && 'max-md:aspect-auto max-md:flex-1',
					)}
				>
					{/* Pinch to zoom, drag to pan, double-tap; unzoomed a vertical swipe still scrolls */}
					<div
						className="absolute inset-0 overflow-hidden"
						style={{ touchAction: zoom.touchAction }}
						{...zoom.handlers}
					>
						{src && !error && (
							<video
								key={url}
								src={src}
								poster={BLANK_POSTER}
								playsInline
								autoPlay={autoPlay}
								muted={muted}
								onLoadedMetadata={(e) => {
									const video = e.currentTarget as HTMLVideoElement;
									setPlayable(true);
									if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
									// Where a seek asked while it downloaded, playing if it should
									if (swapResume) {
										const { time: at, play } = swapResume;
										video.currentTime = pendingSeek ?? at;
										if (play) void video.play().catch(() => {});
										else video.pause();
										pendingSeek = null;
										swapResume = null;
									}
								}}
								onLoadedData={() => setLoaded(true)}
								onPlaying={() => setLoaded(true)}
								onPlay={() => setPlaying(true)}
								onPause={() => setPlaying(false)}
								onEnded={() => setPlaying(false)}
								onTimeUpdate={(e) => {
									// Held at a seek still waiting for the local copy
									if (!scrub && pendingSeek === null) setTime((e.currentTarget as HTMLVideoElement).currentTime);
									pingDialog();
								}}
								onError={() => setError(true)}
								style={zoom.style}
								className="size-full object-contain"
							/>
						)}
					</div>

					{error ? (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/70">
							<VideoOff className="size-6" />
							Couldn't load this clip
						</div>
					) : !clip ? (
						<div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
							Pick a clip to play it
						</div>
					) : (
						!loaded && (
							// Until the first frame: the clip's own thumbnail, softened (it's a small square), under its kind
							<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
								{poster && (
									<img
										src={poster}
										alt=""
										className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-md"
									/>
								)}
								<span className="relative flex size-14 items-center justify-center rounded-full bg-black/55 text-white">
									{/* The clip's kind inside a ring that turns until the clip can play */}
									{!playable && (
										<span className="absolute inset-0 animate-spin rounded-full border-2 border-white/25 border-t-white" />
									)}
									<Icon className="size-5" />
									{/* How much has downloaded: a big clip takes a while on a panel's Wi-Fi */}
									{!localReady && progress > 0 && (
										<span className="absolute top-full mt-2 rounded-sm bg-black/55 px-1.5 text-white text-xs tabular-nums">
											{Math.round(progress * 100)}%
										</span>
									)}
								</span>
							</div>
						)
					)}

					{clip && !error && (
						<>
							{/* What and when, over the video (always dark) */}
							<div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-2">
								<Badge variant="secondary" className="bg-black/60 text-white">
									<Icon />
									{clip.label}
									<span className="text-white/70 tabular-nums">
										{clip.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·{' '}
										{formatClipClock(clip.start, position)}
									</span>
								</Badge>
								{zoom.zoom.scale > 1 && (
									<Button
										variant="secondary"
										size="sm"
										onClick={zoom.reset}
										title="Zoom out"
										aria-label={`Zoomed ${formatZoom(zoom.zoom.scale)}; zoom out`}
										className="pointer-events-auto tabular-nums"
									>
										<ZoomOut />
										{formatZoom(zoom.zoom.scale)}
									</Button>
								)}
							</div>

							{/* Paused (and loaded): a big play button in the middle */}
							{loaded && !playing && !scrub && (
								<button
									type="button"
									onClick={togglePlay}
									aria-label="Play"
									className="-translate-1/2 absolute top-1/2 left-1/2 flex size-16 items-center justify-center rounded-full bg-black/55 text-white transition-transform active:scale-95"
								>
									<Play className="ml-1 size-7 fill-current" />
								</button>
							)}
						</>
					)}
				</div>

				{/* The scrubber and controls, under the video (there from the start, so nothing moves) */}
				{clip && !error && (
					<div className="flex shrink-0 flex-col gap-2">
						<Scrubber
							clip={clip}
							position={position}
							duration={controlsShown ? duration : 0}
							frames={frames}
							onScrub={onScrub}
							onScrubEnd={onScrubEnd}
							onSeek={onSeek}
							scrubbing={!!scrub}
							playing={playing}
						/>
						<div className={cn('flex items-center gap-2', fullscreen && 'gap-3')}>
							<Button
								variant="outline"
								size={iconSize}
								onClick={togglePlay}
								disabled={!controlsShown}
								aria-label={playing ? 'Pause' : 'Play'}
								title={playing ? 'Pause' : 'Play'}
							>
								{playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
							</Button>
							<span
								className={cn(
									'min-w-0 truncate font-mono text-muted-foreground text-xs tabular-nums',
									fullscreen && 'text-sm',
								)}
							>
								{formatClipPosition(position)} / {formatClipPosition(duration)}
							</span>
							<span className="flex-1" />
							<Button
								variant="outline"
								size={fullscreen ? '2xl' : 'lg'}
								onClick={() => setSpeed(nextClipSpeed(speed))}
								disabled={!controlsShown}
								aria-label={`Speed ${speed}×; change`}
								title="Playback speed"
								className={cn('w-14 tabular-nums', fullscreen && 'w-18')}
							>
								{speed}×
							</Button>
							<Button
								variant="outline"
								size={iconSize}
								onClick={() => setMuted(!muted)}
								disabled={!controlsShown}
								aria-label={muted ? 'Unmute' : 'Mute'}
								title={muted ? 'Unmute' : 'Mute'}
							>
								{muted ? <VolumeX /> : <Volume2 />}
							</Button>
							{canSave && (
								<a
									href={src}
									download={fileName}
									onClick={save}
									aria-label="Save clip"
									title="Save clip"
									// Once the clip has downloaded (there's nothing to save before)
									aria-disabled={!localReady || undefined}
									className={cn(
										buttonVariants({ variant: 'outline', size: iconSize }),
										!localReady && 'pointer-events-none opacity-50',
									)}
								>
									<Download />
								</a>
							)}
							<Button
								variant="outline"
								size={iconSize}
								onClick={toggleFullscreen}
								aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
								title={fullscreen ? 'Exit full screen' : 'Full screen'}
							>
								{fullscreen ? <Minimize /> : <Maximize />}
							</Button>
						</div>
					</div>
				)}
			</div>
			{clip && !fullscreen && (
				<div className="flex shrink-0 items-center gap-2">
					<Button variant="outline" size="icon-lg" onClick={onPrevious} disabled={!onPrevious} aria-label="Newer clip">
						<ChevronLeft />
					</Button>
					<p className="min-w-0 flex-1 truncate text-center font-medium text-sm">
						{caption(clip)}
						<span className="text-muted-foreground">
							{' '}
							· {clip.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
						</span>
					</p>
					<Button variant="outline" size="icon-lg" onClick={onNext} disabled={!onNext} aria-label="Older clip">
						<ChevronRight />
					</Button>
				</div>
			)}
		</div>
	);
};
