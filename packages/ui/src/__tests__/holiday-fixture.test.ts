import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { FIXTURE, holidayDays, START } from '../../../../scripts/holiday-fixture';

// The integration's Python holiday calendar is tested against this file; it has to be the
// dashboards' own calendar (`bun scripts/holiday-fixture.ts` writes it again after a change)
describe('the holiday fixture', () => {
	it("is the dashboards' calendar, day by day", () => {
		const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { start: string; days: (string | null)[] };
		expect(fixture.start).toBe(START);
		expect(fixture.days).toEqual(holidayDays());
	});
});
