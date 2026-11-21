import { Disc3, type LucideIcon, MicVocal, Music, Newspaper, RadioReceiver, Tv } from 'lucide-react';
import type React from 'preact/compat';
import { useState } from 'preact/compat';
import { fullSizeCover, type MediaKind, type MusicPlayer } from '../../lib/music';
import { cn } from '../../lib/utils';

/** Placeholder art for each kind of media, when there's no cover or it doesn't load. */
export const MEDIA_ICONS: Record<MediaKind, LucideIcon> = {
	music: Music,
	radio: RadioReceiver,
	podcast: MicVocal,
	brief: Newspaper,
};

/** A player's placeholder: a TV for the TV's sound, the record for a live input (the turntable), else by what it plays. */
export const playerArtIcon = (player: Pick<MusicPlayer, 'kind' | 'liveInput' | 'tvAudio'>): LucideIcon =>
	player.tvAudio ? Tv : player.liveInput ? Disc3 : MEDIA_ICONS[player.kind];

// Smaller than this is a site icon (radio stations' favicons), not cover art: show the placeholder
const MIN_COVER_PX = 64;

/** Whether an image `src` failed (or was too small to be a cover); keyed by URL, so a new one starts fresh. */
function useFailedImage(src?: string) {
	const [failedSrc, setFailedSrc] = useState<string>();
	return {
		failed: !!src && failedSrc === src,
		onError: () => setFailedSrc(src),
		onLoad: (e: Event) => {
			const img = e.currentTarget as HTMLImageElement;
			if (img.naturalWidth < MIN_COVER_PX || img.naturalHeight < MIN_COVER_PX) setFailedSrc(src);
		},
	};
}

/**
 * Cover art, or an icon (a music note by default) when there is none, it fails to load, or it's a
 * tiny site icon; the icon, faint, shows behind the cover while it loads. `spin` turns the icon like a record (a playing live input's turntable).
 */
export const Artwork: React.FC<{
	src?: string;
	round?: boolean;
	fallback?: LucideIcon;
	spin?: boolean;
	className?: string;
}> = ({ src: given, round, fallback: Fallback = Music, spin, className }) => {
	const src = fullSizeCover(given);
	const { failed, onError, onLoad } = useFailedImage(src);
	return (
		<div
			className={cn(
				'relative flex shrink-0 items-center justify-center overflow-hidden bg-muted text-muted-foreground',
				round ? 'rounded-full' : 'rounded-md',
				className,
			)}
		>
			{src && !failed ? (
				<>
					{/* The placeholder: the kind's icon, faint, behind the cover until the cover's pixels arrive
					    and cover it. The cover itself is the plain image in the flow that always showed on the
					    wall panels; it never waits on a load event or lazy-load quirks to appear */}
					<span aria-hidden className="absolute top-0 left-0 flex size-full items-center justify-center">
						<Fallback className="size-2/5 opacity-40" />
					</span>
					<img
						src={src}
						alt=""
						loading="lazy"
						className="relative size-full object-cover"
						onError={onError}
						onLoad={onLoad}
					/>
				</>
			) : (
				<Fallback className={cn('size-2/5', spin && 'animate-record-spin motion-reduce:animate-none')} />
			)}
		</div>
	);
};

const BAR_DELAYS = ['0s', '-0.3s', '-0.6s'];

/** Three bouncing bars: something is playing (still while paused, and for reduced motion). */
export const PlayingBars: React.FC<{ paused?: boolean; className?: string }> = ({ paused, className }) => (
	<span aria-hidden className={cn('inline-flex h-3.5 items-end gap-0.5', className)}>
		{BAR_DELAYS.map((delay) => (
			<span
				key={delay}
				style={{ animationDelay: delay }}
				className={cn(
					'h-full w-0.75 origin-bottom rounded-full bg-current motion-reduce:animate-none',
					paused ? 'scale-y-40' : 'animate-eq-bar',
				)}
			/>
		))}
	</span>
);

/** The cover, blurred and faded behind a card's content (the card needs `relative isolate overflow-hidden`). */
export const ArtBackdrop: React.FC<{ src?: string }> = ({ src: given }) => {
	const src = fullSizeCover(given);
	const { failed, onError, onLoad } = useFailedImage(src);
	if (!src || failed) return null;
	return (
		<img
			src={src}
			alt=""
			aria-hidden
			onError={onError}
			onLoad={onLoad}
			className="pointer-events-none absolute inset-0 -z-10 size-full scale-125 object-cover opacity-25 blur-3xl saturate-150 dark:opacity-35"
		/>
	);
};
