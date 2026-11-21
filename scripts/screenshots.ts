// docs/images: screenshots of the demo house (`bun run demo` must be running on :4173, after
// `bun run build:local`), taken with headless Chrome. `bun scripts/screenshots.ts`; CHROME
// overrides the browser's path. Chrome won't go under ~500px wide, so phones are 540.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = resolve(import.meta.dir, '../docs/images');
const SHOTS = [
	{ name: 'home-dark', size: '1440,900', query: '?card=home' },
	{ name: 'home-light', size: '1440,900', query: '?card=home&light' },
	{ name: 'phone', size: '540,1100', query: '?card=home' },
	{ name: 'wall-panel', size: '1280,800', query: '?card=panel' },
];

const up = await fetch('http://localhost:4173/').then(
	(r) => r.ok,
	() => false,
);
if (!up) throw new Error('Start the demo first: bun run build:local && bun run demo');

for (const shot of SHOTS) {
	const profile = mkdtempSync(join(tmpdir(), 'shot-'));
	const run = Bun.spawnSync([
		chrome,
		'--headless=new',
		'--hide-scrollbars',
		`--user-data-dir=${profile}`,
		`--window-size=${shot.size}`,
		'--virtual-time-budget=9000',
		`--screenshot=${join(out, `${shot.name}.png`)}`,
		`http://localhost:4173/${shot.query}`,
	]);
	rmSync(profile, { recursive: true, force: true });
	console.log(run.exitCode === 0 ? `docs/images/${shot.name}.png` : `${shot.name}: Chrome failed`);
}
