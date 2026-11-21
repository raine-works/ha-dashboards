import { describe, expect, it } from 'bun:test';
import { talkbackPresets } from '../cameras';
import { HOLIDAY_MESSAGES, withHolidayCategory } from '../holidayMessages';
import { HOLIDAY_IDS } from '../holidays';
import { ANNOUNCEMENT_PRESETS, PHONE_MESSAGE_MAX, PHONE_PRESETS } from '../intercom';
import { NOTE_MAX } from '../printer';

// Emoji (TTS would read them out) in what the speakers say
const EMOJI = /\p{Extended_Pictographic}/u;

describe('holiday messages', () => {
	it('has every kind of message for every holiday', () => {
		for (const id of HOLIDAY_IDS) {
			const m = HOLIDAY_MESSAGES[id];
			expect(m.announcements.length).toBeGreaterThan(0);
			expect(m.phone.length).toBeGreaterThan(0);
			expect(m.notes.length).toBeGreaterThan(0);
			expect(m.doorbell.length).toBeGreaterThan(0);
			expect(m.indoor.length).toBeGreaterThan(0);
		}
	});

	it('speaks no emoji, and fits a phone push', () => {
		for (const m of Object.values(HOLIDAY_MESSAGES)) {
			for (const spoken of [...m.announcements.map((a) => a.message), ...m.doorbell, ...m.indoor]) {
				expect(spoken).not.toMatch(EMOJI);
			}
			for (const push of m.phone) expect(push.length).toBeLessThanOrEqual(PHONE_MESSAGE_MAX);
		}
	});

	it('prints notes in the code page: plain characters only, within the note limit', () => {
		for (const note of Object.values(HOLIDAY_MESSAGES).flatMap((m) => m.notes)) {
			expect(note).toMatch(/^[\x20-\x7e]+$/);
			expect(note.length).toBeLessThanOrEqual(NOTE_MAX);
		}
	});

	it("puts the holiday's category first, featured, and nothing without one", () => {
		const categories = withHolidayCategory(ANNOUNCEMENT_PRESETS, 'halloween', (m) => m.announcements);
		expect(categories[0]).toMatchObject({ id: 'holiday', label: '🎃 Halloween', featured: true });
		expect(categories[0]?.presets).toEqual(HOLIDAY_MESSAGES.halloween.announcements);
		expect(categories.slice(1)).toEqual(ANNOUNCEMENT_PRESETS);
		expect(withHolidayCategory(PHONE_PRESETS, null, (m) => m.phone)).toBe(PHONE_PRESETS);
	});

	it("leads a camera's talkback with the holiday's lines for where it is", () => {
		const doorbell = talkbackPresets({ id: 'front_porch_doorbell' }, 'halloween');
		expect(doorbell.slice(0, HOLIDAY_MESSAGES.halloween.doorbell.length)).toEqual(HOLIDAY_MESSAGES.halloween.doorbell);
		expect(doorbell.slice(-3)).toEqual(talkbackPresets({ id: 'front_porch_doorbell' }));
		// The living room's own presets are for family: the indoor lines
		expect(talkbackPresets({ id: 'living_room_living_room' }, 'christmas')[0]).toBe('Merry Christmas!');
		expect(talkbackPresets({ id: 'garage_camera' }, null)).toEqual(talkbackPresets({ id: 'garage_camera' }));
	});
});
