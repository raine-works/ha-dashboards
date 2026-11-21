// `react/compiler-runtime` for Preact: the React Compiler's memo cache hook. React 19 ships it
// in react itself; preact/compat doesn't, so compiled components import this instead.
import { useMemo } from 'preact/hooks';

const EMPTY = Symbol.for('react.memo_cache_sentinel');

/** A per-component cache of `size` slots, each starting as the "not computed" sentinel. */
export function c(size: number): unknown[] {
	return useMemo(() => new Array<unknown>(size).fill(EMPTY), []);
}
