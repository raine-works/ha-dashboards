// `react-is` for Preact: Recharts reads `isFragment` to unwrap fragments among a chart's children.
// React's own package checks React's element symbols, which Preact's elements don't carry.
import { Fragment, isValidElement } from 'preact/compat';

export const isFragment = (element: unknown): boolean =>
	isValidElement(element) && (element as { type?: unknown }).type === Fragment;
