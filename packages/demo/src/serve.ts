/**
 * `bun run demo`: the dashboards on the demo house at http://localhost:4173 (`?card=panel` for a
 * wall panel). Serves the built bundle from packages/dashboards/dist (`bun run build:local`, or
 * `bun run dev` alongside to rebuild on every change).
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import page from './index.html';

const dist = resolve(import.meta.dir, '../../dashboards/dist');
if (!existsSync(resolve(dist, 'dashboards.js'))) {
	console.error('No bundle yet: run `bun run build:local` (or `bun run dev`) first');
	process.exit(1);
}

const server = Bun.serve({
	port: Number(Bun.env.PORT ?? 4173),
	routes: { '/': page },
	async fetch(req) {
		const { pathname } = new URL(req.url);
		const file = Bun.file(resolve(dist, pathname.replace(/^\/dist\//, '')));
		if (pathname.startsWith('/dist/') && !pathname.includes('..') && (await file.exists())) return new Response(file);
		return new Response('Not found', { status: 404 });
	},
});
console.log(`Demo house: ${server.url}  (?card=panel, ?floor=upstairs, ?light)`);
