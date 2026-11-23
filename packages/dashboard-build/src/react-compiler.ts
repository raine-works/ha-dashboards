/** The React Compiler as a Bun plugin, and the report of what it memoized and what it skipped. */

import { transformAsync } from '@babel/core';
import ReactCompiler, { type LoggerEvent } from 'babel-plugin-react-compiler';
import type { BunPlugin, PluginBuilder } from 'bun';

/** Our own sources (components and hooks in every package's src/), not node_modules or tests. */
const SOURCE_FILTER = /\/packages\/[^/]+\/src\/(?!.*__tests__\/).*\.tsx?$/;

/**
 * Our code imports hooks from `preact/compat`, which the compiler doesn't know: it took `useRef`'s
 * value for an ordinary one and skipped every component or hook that wrote `ref.current` ("This value
 * cannot be modified"). It sees them as React's (`from 'react'`), which the Preact alias plugin maps
 * straight back to `preact/compat`, so nothing changes at runtime.
 */
const asReact = (source: string) => source.replace(/from '(preact\/compat)'/g, "from 'react'");

/** What the compiler did over a build, filled in by {@link reactCompilerPlugin} as it goes. */
export interface CompilerReport {
	/** Components and hooks the compiler memoized. */
	compiled: number;
	/** Functions it left as written, with the reason (a rule it can't prove holds). */
	skipped: { file: string; line: number; reason: string }[];
}

/**
 * React Compiler (babel-plugin-react-compiler) as a Bun plugin: memoizes components and hooks
 * automatically, so a Home Assistant state update re-renders only what depends on the change.
 * Compiled code imports `react/compiler-runtime`, which the Preact alias plugin maps to
 * ./compiler-runtime.ts. Babel only parses TypeScript here (types are left for Bun to strip),
 * so each file keeps its own loader: `.ts` must not be parsed as TSX (`<T>(x) =>` generics).
 */
export function reactCompilerPlugin(report: CompilerReport): BunPlugin {
	return {
		name: 'react-compiler',
		setup(build: PluginBuilder) {
			build.onLoad({ filter: SOURCE_FILTER }, async ({ path }) => {
				const source = asReact(await Bun.file(path).text());
				const tsx = path.endsWith('.tsx');
				const result = await transformAsync(source, {
					filename: path,
					babelrc: false,
					configFile: false,
					parserOpts: { plugins: tsx ? ['jsx', 'typescript'] : ['typescript'] },
					plugins: [
						[
							ReactCompiler,
							{
								target: '19',
								logger: {
									logEvent(_file: string | null, event: LoggerEvent) {
										if (event.kind === 'CompileSuccess') report.compiled++;
										else if (event.kind === 'CompileError')
											report.skipped.push({
												file: path,
												line: event.fnLoc?.start.line ?? 0,
												reason: event.detail.reason,
											});
									},
								},
							},
						],
					],
				});
				return { contents: result?.code ?? source, loader: tsx ? 'tsx' : 'ts' };
			});
		},
	};
}
