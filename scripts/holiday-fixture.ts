// tests/fixtures/holidays.json: the dashboards' holiday (lib/holidays.ts activeHoliday) for every day
// of 2026 through 2030, which the integration's Python port (custom_components/raineworks_dashboards/
// holidays.py) is tested against. `bun scripts/holiday-fixture.ts` writes it; holiday-fixture.test.ts
// fails when the TypeScript and the file disagree.
import { resolve } from 'node:path';
import { activeHoliday } from '../packages/ui/src/lib/holidays';

export const FIXTURE = resolve(import.meta.dir, '../tests/fixtures/holidays.json');
export const START = '2026-01-01';
export const DAYS = 5 * 365 + 1;

export function holidayDays(): (string | null)[] {
	const [y, m, d] = START.split('-').map(Number) as [number, number, number];
	return Array.from({ length: DAYS }, (_, n) => activeHoliday(new Date(y, m - 1, d + n))?.holiday.id ?? null);
}

if (import.meta.main) {
	await Bun.write(FIXTURE, `${JSON.stringify({ start: START, days: holidayDays() })}\n`);
	console.log(`${FIXTURE}: ${DAYS} days from ${START}`);
}
