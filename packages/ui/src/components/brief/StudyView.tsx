/**
 * The Daily dialog's Study tab: today's scripture and this week's Come, Follow Me lesson, fetched
 * once a day per device.
 *
 * @module
 */

import { BookOpen, ExternalLink, Loader2, Play } from 'lucide-react';
import type React from 'preact/compat';
import { useEffect, useState } from 'preact/compat';
import { useHassApi, useHassReady } from '../../context/HassContext';
import { useWallPanel } from '../../context/WallPanel';
import { dayKey } from '../../lib/picker';
import { type DailyStudy, getDailyStudy } from '../../lib/scripture';
import { readStoredJson, writeStored } from '../../lib/storage';
import { cn } from '../../lib/utils';
import { Alert, AlertDescription, Button, buttonVariants, Card, EmptyState, StableLabel } from '../ui';
import { BriefCard } from './BriefCard';

// The last study this device got, with its day: fetched once a day, and shown while offline
const STUDY_KEY = 'ha-dashboards:daily-study:v1';

interface CachedStudy {
	day: string;
	study: DailyStudy;
}

const readCached = (): CachedStudy | undefined => {
	const cached = readStoredJson(STUDY_KEY) as Partial<CachedStudy> | undefined;
	return cached && typeof cached.day === 'string' && cached.study ? (cached as CachedStudy) : undefined;
};

/**
 * This week's Come, Follow Me lesson and today's scripture (`script.daily_scripture`), fetched while
 * `active` and once a day per device; yesterday's stays shown when it can't be fetched.
 */
export function useDailyStudy(active: boolean) {
	const { getHass } = useHassApi();
	const ready = useHassReady();
	const [cached, setCached] = useState(readCached);
	const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
	const [attempt, setAttempt] = useState(0);
	const today = dayKey(new Date());
	const fresh = cached?.day === today;

	useEffect(() => {
		if (!active || !ready || fresh) return;
		const hass = getHass();
		if (!hass) return;
		let live = true;
		setStatus('loading');
		getDailyStudy(hass)
			.then((study) => {
				if (!live) return;
				// The script answers without either when the Open Scripture API can't be reached
				if (!study.lesson && !study.scripture) return setStatus('failed');
				const next = { day: today, study };
				setCached(next);
				writeStored(STUDY_KEY, JSON.stringify(next));
				setStatus('idle');
			})
			.catch(() => live && setStatus('failed'));
		return () => {
			live = false;
		};
	}, [active, ready, fresh, today, attempt]);

	return {
		study: cached?.study,
		/** Shown from an earlier day, since today's couldn't be fetched */
		stale: !!cached && !fresh && status === 'failed',
		loading: status === 'loading',
		failed: status === 'failed',
		retry: () => setAttempt((n) => n + 1),
	};
}

/** {@link StudyView}'s props. */
export interface StudyViewProps {
	/** Whether the tab is showing (the study is fetched only then). */
	active: boolean;
	/** The speaker chips the dialog's tabs share */
	playOn: React.ReactNode;
	/**
	 * Plays today's scripture (its reference and verses) on the picked speaker, as the brief plays
	 * (`script.daily_scripture_announce`)
	 */
	onPlay: () => void;
	/** Whether a Play is under way (its button shows busy). */
	playing: boolean;
	/** Whether Play can be tapped (a speaker is picked). */
	canPlay: boolean;
	/** The scripture on the speakers it's playing on: where, how far along, Pause / Resume and Stop */
	playback?: React.ReactNode;
}

/**
 * The Daily dialog's Study tab: today's scripture (a verse this week's lesson quotes) with Play on a
 * speaker, separate from the brief's, beside this week's Come, Follow Me lesson (under it on phones
 * and the 10.5" panels), its introduction and, on Read more at its end, the whole lesson; off the
 * wall panels, a link to it in the Gospel Library.
 */
export const StudyView: React.FC<StudyViewProps> = ({ active, playOn, onPlay, playing, canPlay, playback }) => {
	const { study, stale, loading, failed, retry } = useDailyStudy(active);
	const wallPanel = useWallPanel();
	const [more, setMore] = useState(false);
	const lesson = study?.lesson;
	const scripture = study?.scripture;

	if (!study) {
		return (
			<EmptyState
				icon={failed ? <BookOpen className="size-10" /> : <Loader2 className="size-8 animate-spin" />}
				onRetry={failed ? retry : undefined}
				retrying={loading}
			>
				{failed ? "Couldn't get this week's lesson." : "Finding this week's lesson…"}
			</EmptyState>
		);
	}

	const showMore = !!lesson && lesson.sections.length > 0;
	const link = lesson?.url && !wallPanel ? lesson.url : undefined;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 short:gap-2">
			{stale && (
				<Alert variant="warning" className="shrink-0">
					<AlertDescription>Couldn't get today's scripture, so this is from an earlier day.</AlertDescription>
				</Alert>
			)}

			{/* One scrolling column on phones and the 10.5" panels; from lg the scripture beside the
			    lesson, which scrolls on its own */}
			<div className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 lg:flex-row lg:overflow-hidden">
				{scripture && (
					<Card className="justify-center-safe shrink-0 items-center gap-0 px-6 py-8 short:py-4 text-center lg:min-h-0 lg:w-2/5 lg:overflow-y-auto">
						<figure className="flex flex-col items-center gap-5 short:gap-3">
							<span className="flex size-12 items-center justify-center rounded-lg bg-chart-4/10 text-chart-4">
								<BookOpen className="size-6" />
							</span>
							<blockquote className="wrap-break-word text-balance font-medium text-xl leading-snug sm:text-2xl">
								{scripture.text}
							</blockquote>
							<figcaption className="font-semibold">{scripture.reference}</figcaption>
							{scripture.summary && (
								<p className="short:hidden max-w-prose text-muted-foreground text-sm">{scripture.summary}</p>
							)}
						</figure>
					</Card>
				)}

				{lesson && (
					<BriefCard
						icon={BookOpen}
						tone="text-chart-4"
						title="Come, Follow Me"
						detail={lesson.dates}
						className="shrink-0 lg:min-h-0 lg:flex-1 lg:shrink"
					>
						<div className="flex flex-col gap-3 p-4 lg:min-h-0 lg:overflow-y-auto">
							<div className="flex flex-col gap-1">
								<h3 className="text-balance font-semibold text-xl leading-snug">{lesson.title}</h3>
								{lesson.readings.length > 0 && (
									<span className="text-muted-foreground text-sm">{lesson.readings.join('; ')}</span>
								)}
							</div>
							{lesson.intro.map((paragraph) => (
								<p key={paragraph} className="max-w-prose leading-relaxed max-xl:text-sm">
									{paragraph}
								</p>
							))}
							{more &&
								lesson.sections.map((block, i) =>
									block.heading ? (
										<h4 key={`${i}-${block.text}`} className="mt-2 font-semibold text-lg">
											{block.text}
										</h4>
									) : (
										<p key={`${i}-${block.text}`} className="max-w-prose leading-relaxed max-xl:text-sm">
											{block.text}
										</p>
									),
								)}
							{/* Where the reading stops, not across the dialog in its actions */}
							{showMore && (
								<Button variant="outline" onClick={() => setMore((m) => !m)} className="self-start">
									<StableLabel options={['Read more', 'Show less']} value={more ? 1 : 0} />
								</Button>
							)}
						</div>
					</BriefCard>
				)}
			</div>

			{playback}

			{/* Kept under the scroller, at the dialog's bottom edge, as on the brief */}
			<div className="mt-auto flex shrink-0 flex-wrap items-center gap-2 border-t pt-3">
				{scripture && playOn}
				{/* On phones the buttons share the dialog's full width */}
				<div className="ml-auto flex flex-wrap gap-2 max-sm:w-full max-sm:*:flex-1">
					{link && (
						<a
							href={link}
							target="_blank"
							rel="noopener noreferrer"
							className={cn(buttonVariants({ variant: 'outline', size: 'xl' }))}
						>
							<ExternalLink />
							Gospel Library
						</a>
					)}
					{scripture && (
						<Button size="xl" onClick={onPlay} loading={playing} disabled={!canPlay}>
							<Play />
							Play
						</Button>
					)}
				</div>
			</div>
		</div>
	);
};
