import { describe, expect, it } from 'bun:test';
import { isPageHost, joinPage, type PageCard } from '../page-host';

const card = (priority: number) => {
	const changes: boolean[] = [];
	const c: PageCard = { priority, onHostChange: () => changes.push(isPageHost(c)) };
	return { c, changes };
};

describe('the page host', () => {
	it('is the first card to join, until it leaves; then the next', () => {
		const a = card(0);
		const b = card(0);
		const leaveA = joinPage(a.c);
		const leaveB = joinPage(b.c);
		expect(isPageHost(a.c)).toBe(true);
		expect(isPageHost(b.c)).toBe(false);
		expect(b.changes).toEqual([]);

		leaveA();
		expect(isPageHost(b.c)).toBe(true);
		expect(a.changes).toEqual([true, false]);
		expect(b.changes).toEqual([true]);
		leaveA(); // Leaving twice changes nothing
		expect(isPageHost(b.c)).toBe(true);
		leaveB();
		expect(isPageHost(b.c)).toBe(false);
	});

	it('is a full-page card over the section cards, whenever it joins', () => {
		const section = card(0);
		const page = card(1);
		const leaveSection = joinPage(section.c);
		const leavePage = joinPage(page.c);
		expect(isPageHost(page.c)).toBe(true);
		expect(section.changes).toEqual([true, false]);
		leavePage();
		expect(isPageHost(section.c)).toBe(true);
		leaveSection();
	});
});
