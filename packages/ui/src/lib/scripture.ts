import type { HomeAssistant } from '../types/homeassistant';
import { callForResponse } from './service-calls';
import { trimmedString as str } from './values';

/**
 * This week's Come, Follow Me lesson and today's scripture from it, from `script.daily_scripture`
 * (the Open Scripture API through Home Assistant). The script picks the scripture, so the Study tab
 * on every device and its Play get the same one.
 */
export const DAILY_SCRIPTURE_SCRIPT = 'daily_scripture';

/**
 * How every scripture recording's file starts (`daily-scripture-<date>-<hash>.mp3` under
 * `/local/daily_brief/`, made by `script.daily_scripture_audio`), which a speaker playing it reports.
 */
export const SCRIPTURE_AUDIO_FILE = 'daily-scripture-';

export interface StudyLesson {
	title: string;
	/** "October 26–November 1" */
	dates: string;
	/** The week's reading: "Jeremiah 31–33", "Lamentations 1" */
	readings: string[];
	/** The paragraphs before the lesson's first section: its introduction. */
	intro: string[];
	/** The rest, with its section headings ("Ideas for Teaching Children"). */
	sections: LessonBlock[];
	/** The lesson on the Church's site (the Gospel Library), when its week is known. */
	url?: string;
}

export interface LessonBlock {
	heading: boolean;
	text: string;
}

export interface DailyScripture {
	/** "Lamentations 3:22–26" */
	reference: string;
	text: string;
	/** The chapter's summary (its heading in the scriptures). */
	summary?: string;
}

export interface DailyStudy {
	lesson?: StudyLesson;
	scripture?: DailyScripture;
}

// Every lesson's sections; anything else is a paragraph
const SECTION_HEADINGS = new Set([
	'Ideas for Learning at Home and at Church',
	'Ideas for Teaching Children',
	'Scripture Helps',
]);
// The web page's collapsed-section control, kept in the lesson's text
const SKIPPED = new Set(['Click to see more.']);

/**
 * The lesson's number in its manual (the Gospel Library numbers them by week): the week holding
 * January 1 of its year is lesson 1, so 2026's starts on Monday, December 29, 2025. `start` is the
 * lesson's Monday (YYYY-MM-DD).
 */
export function lessonNumber(start: string, year: number): number | undefined {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
	if (!match) return undefined;
	const day = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	const newYear = new Date(Date.UTC(year, 0, 1));
	// The Monday on or before January 1
	const first = newYear.getTime() - ((newYear.getUTCDay() + 6) % 7) * 86_400_000;
	const week = Math.round((day - first) / (7 * 86_400_000)) + 1;
	// A 53rd week holds the next January 1, so it's the next year's lesson 1, in the next manual: no
	// link rather than a wrong one when the response gives the old year
	return week >= 1 && week <= 52 ? week : undefined;
}

/** The lesson in the Gospel Library: `.../study/manual/<manual>/44?lang=eng` (two digits, `01`). */
export const lessonUrl = (manual: string, number: number) =>
	`https://www.churchofjesuschrist.org/study/manual/${encodeURIComponent(manual)}/${String(number).padStart(2, '0')}?lang=eng`;

/** The lesson's plain text as paragraphs: its introduction, then the sections under their headings. */
export function lessonBlocks(text: string): { intro: string[]; sections: LessonBlock[] } {
	const paragraphs = text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line && !SKIPPED.has(line));
	const first = paragraphs.findIndex((p) => SECTION_HEADINGS.has(p));
	const split = first === -1 ? paragraphs.length : first;
	return {
		intro: paragraphs.slice(0, split),
		sections: paragraphs.slice(split).map((p) => ({ heading: SECTION_HEADINGS.has(p), text: p })),
	};
}

/** `script.daily_scripture`'s response; parts it doesn't have are left out. */
export function toDailyStudy(response: unknown): DailyStudy {
	const r = (response ?? {}) as { lesson?: Record<string, unknown> | null; scripture?: Record<string, unknown> | null };
	const study: DailyStudy = {};
	const l = r.lesson;
	const title = str(l?.title);
	if (l && title) {
		const manual = str(l.manual);
		const start = str(l.start);
		const number = start && typeof l.year === 'number' ? lessonNumber(start, l.year) : undefined;
		study.lesson = {
			title,
			dates: str(l.dates) ?? '',
			readings: Array.isArray(l.readings) ? l.readings.flatMap((x) => str(x) ?? []) : [],
			...lessonBlocks(typeof l.text === 'string' ? l.text : ''),
			url: manual && number ? lessonUrl(manual, number) : undefined,
		};
	}
	const s = r.scripture;
	const reference = str(s?.reference);
	const text = str(s?.text);
	if (s && reference && text) study.scripture = { reference, text, summary: str(s.summary) };
	return study;
}

/** This week's lesson and today's scripture (`script.daily_scripture`); rejects when Home Assistant does. */
export async function getDailyStudy(hass: Pick<HomeAssistant, 'callWS'>): Promise<DailyStudy> {
	return toDailyStudy(await callForResponse(hass, 'script', DAILY_SCRIPTURE_SCRIPT));
}
