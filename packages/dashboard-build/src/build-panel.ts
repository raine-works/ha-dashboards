/**
 * The cards' Bun build: Preact in place of React, the React Compiler, Tailwind's CSS embedded for
 * the ShadowRoot, inlined assets and content-named chunks, once or on every change (`--watch`).
 */

import { existsSync, mkdirSync, readdirSync, rmSync, watch } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import type { BunPlugin, PluginBuilder } from 'bun';
import tailwind from 'bun-plugin-tailwind';
import { type CompilerReport, reactCompilerPlugin } from './react-compiler';

const require = createRequire(import.meta.url);
const preactCompatPath = require.resolve('preact/compat');
const preactCompatClientPath = require.resolve('preact/compat/client');
const preactCompatJsxPath = require.resolve('preact/compat/jsx-runtime');
const compilerRuntimePath = require.resolve('./compiler-runtime.ts');
const reactIsPath = require.resolve('./react-is.ts');

/**
 * Preact alias plugin for Bun.build
 * Maps react and react-dom imports to preact/compat for ultra-lightweight bundles
 */
const preactAliasPlugin: BunPlugin = {
	name: 'preact-alias',
	setup(build: PluginBuilder) {
		build.onResolve({ filter: /^react$/ }, () => ({ path: preactCompatPath }));
		build.onResolve({ filter: /^react-dom$/ }, () => ({
			path: preactCompatPath,
		}));
		build.onResolve({ filter: /^react-dom\/client$/ }, () => ({
			path: preactCompatClientPath,
		}));
		build.onResolve({ filter: /^preact\/compat\/client$/ }, () => ({
			path: preactCompatClientPath,
		}));
		build.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({
			path: preactCompatJsxPath,
		}));
		build.onResolve({ filter: /^react\/jsx-dev-runtime$/ }, () => ({
			path: preactCompatJsxPath,
		}));
		build.onResolve({ filter: /^react\/compiler-runtime$/ }, () => ({
			path: compilerRuntimePath,
		}));
		build.onResolve({ filter: /^react-is$/ }, () => ({ path: reactIsPath }));
	},
};

// Embedded asset types, by extension
const INLINE_TYPES: Record<string, string> = { woff2: 'font/woff2', webp: 'image/webp', mp3: 'audio/mpeg' };

/**
 * Font, image and sound imports (the TV app icons, the holiday sounds, which load with `import()` in
 * chunks of their own) are embedded as base64 data URLs, so the bundle and its chunks are the only
 * files published, with no asset files to ship or name beside them.
 */
const inlineAssetsPlugin: BunPlugin = {
	name: 'inline-assets',
	setup(build: PluginBuilder) {
		build.onLoad({ filter: /\.(woff2|webp|mp3)$/ }, async ({ path }) => {
			const type = INLINE_TYPES[path.slice(path.lastIndexOf('.') + 1)];
			const base64 = Buffer.from(await Bun.file(path).arrayBuffer()).toString('base64');
			return { contents: `export default ${JSON.stringify(`data:${type};base64,${base64}`)};`, loader: 'js' };
		});
	},
};

/**
 * A file the bundle loads on demand (`import()`: the energy charts' Recharts), or code it shares
 * with one, written beside the bundle and imported by its relative name (`./chunk-<hash>.js`),
 * so it resolves wherever the bundle is served from. Named by content, so cached for good.
 */
export interface BuildChunk {
	/** Its file name (`chunk-<hash>.js`). */
	name: string;
	/** Its code. */
	contents: string;
}

/** One bundle to build: what it starts from, where it goes, and how it's published. */
export interface PanelBuildConfig {
	/** Short panel name, used in logs. */
	name: string;
	/** Panel entry module (registers the custom element). */
	entrypoint: string;
	/** Where to write the single-file bundle (JS with the CSS embedded). */
	outfile: string;
	/** Key under globalThis.__panelStyles; must match definePanelElement's stylesKey. */
	stylesKey: string;
	/** Directories to watch in --watch mode (defaults to the entrypoint's directory). */
	watchDirs?: string[];
	/**
	 * Deploy the built bundle and its chunks (the dashboards bundle uploads them to Home
	 * Assistant's integration); skipped by --no-sync and --watch.
	 */
	publish?: (bundle: string, chunks: BuildChunk[]) => Promise<void>;
}

/**
 * Tailwind v4 registers its internal `--tw-*` variables (shadow, ring, translate, scale...)
 * with `@property`, which browsers ignore inside a ShadowRoot. Tailwind ships the initial
 * values as a fallback in `@layer properties`, but gates them behind an `@supports` check
 * that only matches older Safari/Firefox. Unwrap that gate so the fallback always applies,
 * otherwise utilities like `shadow-sm`, `ring-2` and `-translate-x-1/2` silently do nothing.
 */
export function unwrapPropertyFallbacks(css: string): string {
	const match = /@layer properties\s*\{\s*@supports[^{]*\{/.exec(css);
	if (!match) return css;

	const bodyStart = match.index + match[0].length;
	let depth = 1;
	for (let i = bodyStart; i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}' && --depth === 0) {
			// i closes the @supports block; drop it and its opening wrapper
			return `${css.slice(0, match.index)}@layer properties{${css.slice(bodyStart, i)}${css.slice(i + 1)}`;
		}
	}
	return css;
}

/**
 * Builds `panel` once: its bundle (JS with its CSS embedded under `globalThis.__panelStyles`) and
 * its chunks, written beside `outfile` (replacing the last build's chunks), then published when
 * `sync` is on and the panel has `publish`.
 *
 * @param options.production Minified, no sourcemap (default); off for `--watch`'s development builds.
 * @param options.sync Publish the result (default); off for `--no-sync` and `--watch`.
 * @returns `false` when Bun's build failed (its logs printed), else `true`. A failing `publish` throws.
 */
export async function buildPanel(panel: PanelBuildConfig, { production = true, sync = true } = {}) {
	const isProduction = production;
	const tempOutdir = join(dirname(panel.outfile), `.build-tmp-${panel.name}`);

	if (existsSync(tempOutdir)) {
		rmSync(tempOutdir, { recursive: true, force: true });
	}

	const compiler: CompilerReport = { compiled: 0, skipped: [] };
	const result = await Bun.build({
		entrypoints: [panel.entrypoint],
		outdir: tempOutdir,
		plugins: [preactAliasPlugin, reactCompilerPlugin(compiler), inlineAssetsPlugin, tailwind],
		target: 'browser',
		// Code imported with import() goes in chunks of its own, loaded when first used
		splitting: true,
		minify: isProduction,
		define: {
			'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
			'Bun.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
		},
		sourcemap: isProduction ? 'none' : 'inline',
	});

	if (!result.success) {
		console.error(`❌ [${panel.name}] Build failed:`);
		for (const log of result.logs) {
			console.error(log);
		}
		return false;
	}

	let cssContent = '';
	let jsContent = '';
	const chunks: BuildChunk[] = [];

	for (const output of result.outputs) {
		if (output.path.endsWith('.css')) {
			cssContent += await output.text();
		} else if (output.kind === 'entry-point') {
			jsContent = await output.text();
		} else if (output.path.endsWith('.js')) {
			chunks.push({ name: basename(output.path), contents: await output.text() });
		}
	}

	cssContent = unwrapPropertyFallbacks(cssContent);

	// Inject the compiled Tailwind styles ahead of the module; definePanelElement reads them
	const finalBundle = `(globalThis.__panelStyles??={})[${JSON.stringify(panel.stylesKey)}]=${JSON.stringify(cssContent)};\n${jsContent}`;

	// Chunks from earlier builds aren't the bundle's any more
	const outdir = dirname(panel.outfile);
	mkdirSync(outdir, { recursive: true });
	for (const old of readdirSync(outdir)) if (/^chunk-[\w-]+\.js$/.test(old)) rmSync(join(outdir, old));
	await Bun.write(panel.outfile, finalBundle);
	for (const chunk of chunks) await Bun.write(join(dirname(panel.outfile), chunk.name), chunk.contents);

	// Clean up temp build output
	if (existsSync(tempOutdir)) {
		rmSync(tempOutdir, { recursive: true, force: true });
	}

	const outputStat = Bun.file(panel.outfile);
	console.log(`✅ [${panel.name}] Built successfully -> ${panel.outfile} (${(outputStat.size / 1024).toFixed(1)} KB)`);
	for (const chunk of chunks) {
		console.log(`   + ${chunk.name} (${(Buffer.byteLength(chunk.contents) / 1024).toFixed(1)} KB)`);
	}
	console.log(
		`⚛️ [${panel.name}] React Compiler memoized ${compiler.compiled} components/hooks, skipped ${compiler.skipped.length}`,
	);
	if (Bun.env.REACT_COMPILER_REPORT) {
		for (const { file, line, reason } of compiler.skipped) console.log(`   ${file}:${line} ${reason}`);
	}

	if (sync && panel.publish) await panel.publish(finalBundle, chunks);
	else if (panel.publish) console.log(`🏠 [${panel.name}] Local build only; nothing published`);

	return true;
}

/**
 * CLI entry for a panel package's build script.
 *   (default)  build for production and publish (`panel.publish`: for the dashboards, a deploy)
 *   --no-sync  build only, into `outfile`; publish nothing
 *   --watch    local only, like --no-sync: build into `outfile`, then rebuild on changes to watchDirs as
 *              development builds (unminified, inline sourcemaps); nothing is ever published, so saving
 *              a file never deploys
 */
export async function runPanelBuild(panel: PanelBuildConfig, argv = process.argv) {
	const watchMode = argv.includes('--watch');
	const sync = !argv.includes('--no-sync') && !watchMode;

	console.log(`⚡ Building panel [${panel.name}]...`);
	const success = await buildPanel(panel, { production: true, sync });
	if (!success && !watchMode) process.exit(1);
	if (!watchMode) return;

	const dirs = panel.watchDirs ?? [dirname(panel.entrypoint)];
	console.log(`👀 Watching ${dirs.join(', ')} (rebuilds are local only)...`);
	// One rebuild at a time: a change during one marks it dirty, and it runs once more after
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let building = false;
	let dirty = false;
	const rebuild = async () => {
		if (building) {
			dirty = true;
			return;
		}
		building = true;
		do {
			dirty = false;
			try {
				await buildPanel(panel, { production: false, sync: false });
			} catch (err) {
				console.error(`❌ [${panel.name}] Rebuild failed:`, err);
			}
		} while (dirty);
		building = false;
	};
	for (const dir of dirs) {
		watch(resolve(dir), { recursive: true }, (_, filename) => {
			if (!filename || filename.includes('.build-tmp')) return;
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				console.log(`🔄 [${filename}] changed. Rebuilding (local)...`);
				void rebuild();
			}, 50);
		});
	}
}
