// Renders the integration's brand icons (custom_components/raineworks_dashboards/brand/icon.png,
// 256px, and icon@2x.png, 512px: what Home Assistant and its Marketplace show) from assets/logo.svg, with
// headless Chrome on a transparent background (`bun scripts/render-brand.ts`; CHROME overrides the
// browser's path). Run again after changing the SVG, and commit the PNGs.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const chrome = Bun.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svg = readFileSync(resolve(root, 'assets/logo.svg'), 'utf8');
const out = resolve(root, 'custom_components/raineworks_dashboards/brand');
const work = mkdtempSync(join(tmpdir(), 'brand-'));

for (const [name, size] of [
	['icon.png', 256],
	['icon@2x.png', 512],
] as const) {
	const page = join(work, `${size}.html`);
	writeFileSync(
		page,
		`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
	);
	const run = Bun.spawnSync([
		chrome,
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--default-background-color=00000000',
		`--window-size=${size},${size}`,
		`--user-data-dir=${join(work, 'chrome')}`,
		`--screenshot=${join(out, name)}`,
		`file://${page}`,
	]);
	if (run.exitCode !== 0) throw new Error(`Chrome failed on ${name}: ${run.stderr.toString()}`);
	console.log(`${name} (${size}px)`);
}
rmSync(work, { recursive: true, force: true });
