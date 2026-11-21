import { useEffect, useState } from 'preact/compat';

/** Whether a CSS media query matches, kept up to date (works inside the panel's ShadowRoot: it reads window). */
export function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
	useEffect(() => {
		const list = window.matchMedia(query);
		const update = () => setMatches(list.matches);
		update();
		list.addEventListener('change', update);
		return () => list.removeEventListener('change', update);
	}, [query]);
	return matches;
}

/** 10.5" wall panels (960×600 CSS px) get compact layouts; the 15" kitchen panel is 1280×800. */
export const COMPACT_PANEL_QUERY = '(max-width: 1023px)';

/** A short window: a phone on its side, or an on-screen keyboard open (Tailwind's `short:` variant). */
export const SHORT_QUERY = '(max-height: 480px)';
