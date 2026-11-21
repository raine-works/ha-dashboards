import { describe, expect, it } from 'bun:test';
import { lessonBlocks, lessonNumber, lessonUrl, toDailyStudy } from '../scripture';

const MANUAL = 'come-follow-me-for-home-and-church-old-testament-2026';

describe('lessonNumber', () => {
	it('counts weeks from the one holding January 1', () => {
		expect(lessonNumber('2025-12-29', 2026)).toBe(1);
		expect(lessonNumber('2026-01-05', 2026)).toBe(2);
		// Checked against the Gospel Library: lesson 44 is October 26–November 1
		expect(lessonNumber('2026-10-26', 2026)).toBe(44);
		expect(lessonNumber('2026-12-21', 2026)).toBe(52);
		// The week holding January 1, 2027 is 2027's lesson 1, never 2026's 53rd
		expect(lessonNumber('2026-12-28', 2027)).toBe(1);
		expect(lessonNumber('2026-12-28', 2026)).toBeUndefined();
	});

	it('starts a year whose January 1 is a Monday on that day', () => {
		// January 1, 2029 is a Monday
		expect(lessonNumber('2029-01-01', 2029)).toBe(1);
		expect(lessonNumber('2029-01-08', 2029)).toBe(2);
	});

	it('gives up on dates outside the year', () => {
		expect(lessonNumber('2024-06-03', 2026)).toBeUndefined();
		expect(lessonNumber('soon', 2026)).toBeUndefined();
	});
});

describe('lessonUrl', () => {
	it('links the lesson in the Gospel Library', () => {
		expect(lessonUrl(MANUAL, 44)).toBe(
			'https://www.churchofjesuschrist.org/study/manual/come-follow-me-for-home-and-church-old-testament-2026/44?lang=eng',
		);
		expect(lessonUrl(MANUAL, 2)).toContain('/02?lang=eng');
	});
});

describe('lessonBlocks', () => {
	it('splits the introduction from the sections', () => {
		const text = [
			'When the Lord first called Jeremiah…',
			'',
			'For an overview of Lamentations, see the Guide to the Scriptures.',
			'',
			'Ideas for Learning at Home and at Church',
			'',
			'The Lord will bring His covenant people out of captivity.',
			'',
			'Click to see more.',
			'',
			'Ideas for Teaching Children',
		].join('\n');
		expect(lessonBlocks(text)).toEqual({
			intro: [
				'When the Lord first called Jeremiah…',
				'For an overview of Lamentations, see the Guide to the Scriptures.',
			],
			sections: [
				{ heading: true, text: 'Ideas for Learning at Home and at Church' },
				{ heading: false, text: 'The Lord will bring His covenant people out of captivity.' },
				{ heading: true, text: 'Ideas for Teaching Children' },
			],
		});
	});

	it('is all introduction without sections', () => {
		expect(lessonBlocks('One.\n\nTwo.')).toEqual({ intro: ['One.', 'Two.'], sections: [] });
	});
});

describe('toDailyStudy', () => {
	it("reads the script's lesson and scripture", () => {
		const study = toDailyStudy({
			lesson: {
				id: '2026-10-26',
				manual: MANUAL,
				year: 2026,
				title: 'I Will Turn Their Mourning into Joy',
				dates: 'October 26–November 1',
				start: '2026-10-26',
				end: '2026-11-01',
				readings: ['Jeremiah 31–33', 'Lamentations 3'],
				text: 'Intro.\n\nScripture Helps\n\nWho was Baruch?',
			},
			scripture: {
				reference: 'Lamentations 3:22',
				book: 'Lamentations',
				chapter: 3,
				verse: 22,
				verse_end: 22,
				text: 'It is of the Lord’s mercies that we are not consumed, because his compassions fail not.',
				summary: '',
			},
		});
		expect(study.lesson).toEqual({
			title: 'I Will Turn Their Mourning into Joy',
			dates: 'October 26–November 1',
			readings: ['Jeremiah 31–33', 'Lamentations 3'],
			intro: ['Intro.'],
			sections: [
				{ heading: true, text: 'Scripture Helps' },
				{ heading: false, text: 'Who was Baruch?' },
			],
			url: lessonUrl(MANUAL, 44),
		});
		expect(study.scripture).toEqual({
			reference: 'Lamentations 3:22',
			text: 'It is of the Lord’s mercies that we are not consumed, because his compassions fail not.',
			summary: undefined,
		});
	});

	it('leaves out what the script could not find', () => {
		expect(toDailyStudy({ lesson: null, scripture: null })).toEqual({});
		expect(toDailyStudy(undefined)).toEqual({});
		expect(toDailyStudy({ lesson: { title: 'T', year: 2026 } }).lesson?.url).toBeUndefined();
	});
});
