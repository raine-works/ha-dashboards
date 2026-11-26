/**
 * Builds the one dashboards bundle every card shares (`src/index.tsx`, through `@app/dashboard-build`'s
 * `runPanelBuild`) into `dist/dashboards.js` with its chunks, then publishes it. What `bun run build`,
 * `build:local`, `dev` and `build:integration` run.
 *
 * Flags:
 * - none: build and upload to Home Assistant (`POST /api/raineworks_dashboards/bundle`, `publish.ts`;
 *   `HA_URL` / `HA_TOKEN`), skipped when Home Assistant already serves this bundle.
 * - `--force`: upload even when Home Assistant already serves this bundle.
 * - `--no-sync`: build into `dist/` only; upload nothing (`build:local`).
 * - `--watch`: like `--no-sync`, then rebuild into `dist/` on every change to the dashboards' or
 *   `@app/ui`'s sources (`dev`); never deploys.
 * - `--integration`: instead of uploading, write the bundle, its chunks and compressed copies into
 *   `custom_components/raineworks_dashboards/www/` and the holiday chimes into its `sounds/`
 *   (`build:integration`, what a release ships), replacing what was there.
 *
 * Exits non-zero when the build or the upload fails (`runPanelBuild`).
 *
 * @module
 */

import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type BuildChunk, runPanelBuild } from '@app/dashboard-build';
import { bundleFiles, uploadBundle } from './publish';

const repo = resolve(import.meta.dir, '../../..');
const integrationWww = resolve(repo, 'custom_components/raineworks_dashboards/www');
// The holiday sounds the integration's announcements play as the chime
const integrationSounds = resolve(repo, 'custom_components/raineworks_dashboards/sounds');
const holidaySounds = resolve(repo, 'packages/ui/src/components/holiday/sounds');

/**
 * `--integration`: the bundle into the raineworks_dashboards integration's www/ (gitignored; a
 * release's zip carries it, and the integration installs it when it's newer than what it serves),
 * instead of uploading it. Replaces what was there, so only this build's files are packed.
 */
function packIntegration(bundle: string, chunks: BuildChunk[]) {
	mkdirSync(integrationWww, { recursive: true });
	for (const name of readdirSync(integrationWww)) rmSync(resolve(integrationWww, name), { recursive: true });
	const { file, files } = bundleFiles(bundle, chunks);
	for (const [name, content] of files) writeFileSync(resolve(integrationWww, name), content);
	rmSync(integrationSounds, { recursive: true, force: true });
	mkdirSync(integrationSounds, { recursive: true });
	for (const name of readdirSync(holidaySounds).filter((f) => f.endsWith('.mp3') || f === 'CREDITS.md'))
		copyFileSync(resolve(holidaySounds, name), resolve(integrationSounds, name));
	console.log(
		`📦 [dashboards] ${file} and ${chunks.length} chunks in custom_components/raineworks_dashboards/www, its sounds`,
	);
}

await runPanelBuild({
	name: 'dashboards',
	entrypoint: resolve(import.meta.dir, '../src/index.tsx'),
	outfile: resolve(import.meta.dir, '../dist/dashboards.js'),
	stylesKey: 'dashboards',
	// A build is a deploy: uploaded to Home Assistant's integration, which serves it at once (--no-sync and
	// --watch skip it; --force uploads even when Home Assistant already serves this bundle); --integration
	// packs it into the integration's www/ for a release instead
	publish: process.argv.includes('--integration')
		? async (bundle, chunks) => packIntegration(bundle, chunks)
		: (bundle, chunks) => uploadBundle(bundle, chunks, process.argv.includes('--force')),
	watchDirs: [resolve(import.meta.dir, '../src'), resolve(import.meta.dir, '../../ui/src')],
});
