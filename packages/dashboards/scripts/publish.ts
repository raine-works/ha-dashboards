import { createHash } from 'node:crypto';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { BuildChunk } from '@app/dashboard-build';
import { homeAssistantToken, homeAssistantUrl } from '@app/ha-client';

// Deploying the dashboards bundle: the raineworks_dashboards integration serves it on every page
// from /config/raineworks_dashboards/www, under its content hash (dashboards-<hash>.js, cached for
// good) with a version.json naming it (read uncached by the dashboards). `bun run build` uploads a
// build straight there (an admin's upload, POST /api/raineworks_dashboards/bundle, with HA_URL and
// HA_TOKEN), and a release's zip carries one for everyone else. Chunks (code loaded on demand,
// chunk-<hash>.js, and what it shares with the bundle) go beside it: the bundle imports them by
// relative name and names them, so its hash changes with theirs.

/** The bundle's content hash: the same bundle gets the same name, so browsers keep their copy. */
export const bundleHash = (bundle: string) => createHash('sha256').update(bundle).digest('hex').slice(0, 12);

/** What Home Assistant serves now (null when it can't be read, or HA_URL isn't set). */
async function liveHash(url: string): Promise<string | null> {
	try {
		const res = await fetch(`${url}/raineworks_dashboards/version.json`, { cache: 'no-store' });
		return res.ok ? (((await res.json()) as { hash?: string }).hash ?? null) : null;
	} catch {
		return null;
	}
}

/**
 * What's served for a build: the bundle under its hash (dashboards-<hash>.js), its chunks, each with
 * precompressed copies (Home Assistant's file server sends one when the browser accepts it; it
 * doesn't compress static files on the fly), and version.json naming the bundle. An upload and a
 * release's packaged www/ hold the same files.
 */
export function bundleFiles(
	bundle: string,
	chunks: BuildChunk[],
): { file: string; files: [string, string | Uint8Array][] } {
	const hash = bundleHash(bundle);
	const file = `dashboards-${hash}.js`;
	const version = `${JSON.stringify({ hash, file, built: new Date().toISOString() })}\n`;
	const compressed = (name: string, content: string): [string, string | Uint8Array][] => [
		[name, content],
		[`${name}.br`, brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })],
		[`${name}.gz`, gzipSync(content, { level: 9 })],
	];
	return {
		file,
		files: [
			...compressed(file, bundle),
			...chunks.flatMap((chunk) => compressed(chunk.name, chunk.contents)),
			['version.json', version],
		],
	};
}

/**
 * Upload the build to Home Assistant's raineworks_dashboards integration, which serves it at once,
 * reloads the wall panels and tells open dashboards; skipped when it already serves this bundle
 * (`force`: anyway).
 */
export async function uploadBundle(bundle: string, chunks: BuildChunk[], force = false): Promise<void> {
	const url = homeAssistantUrl();
	const token = homeAssistantToken();
	if (!url || !token) throw new Error("Set HA_URL and HA_TOKEN (an admin's long-lived token) in .env to deploy");
	const hash = bundleHash(bundle);
	if (!force && (await liveHash(url)) === hash) {
		console.log(`📦 [dashboards] ${hash} is already live; nothing to upload`);
		return;
	}
	const { file, files } = bundleFiles(bundle, chunks);
	const form = new FormData();
	for (const [name, content] of files) form.append('files', new Blob([content]), name);
	const res = await fetch(`${url}/api/raineworks_dashboards/bundle`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` },
		body: form,
	});
	if (!res.ok)
		throw new Error(`Home Assistant refused the upload (${res.status}): ${(await res.text()).slice(0, 300)}`);
	const { served } = (await res.json()) as { served?: boolean };
	console.log(
		served
			? `🚀 [dashboards] Uploaded ${file}; Home Assistant serves it now`
			: `📦 [dashboards] Uploaded ${file}, but the integration's "Serve the dashboards" option is off`,
	);
}
