/**
 * How much the dashboards move: `full`, or `reduced`, which draws them as a device asking for less
 * motion does (no rolling numbers, nothing spinning, pulsing or drifting; dialogs open and close
 * without sliding). For hardware that struggles: the number rolls, the main cost of a light changing,
 * restyle their digits every frame of the roll.
 *
 * A card's `motion` option wins, then the integration's Animations option (General), else `full`.
 * Whatever they say, a device's own reduce-motion setting always gets less motion. definePanelElement
 * marks the card's mount point `data-motion="reduced"`, which the `motion-reduce:` variant and the
 * reduced-motion rules in theme.css follow (dialogs portal there too), and `lessMotion()` reads it
 * for what moves from code.
 *
 * @module
 */

/** How much the dashboards move. */
export type Motion = 'full' | 'reduced';

/** A setting as written (a card's YAML, the integration's option), or null when it isn't one. */
export function parseMotion(value: unknown): Motion | null {
	return value === 'full' || value === 'reduced' ? value : null;
}

let fromIntegration: Motion | null = null;

/** The integration's Animations option, from `raineworks_dashboards/info` (null: it didn't say). */
export function setIntegrationMotion(value: unknown) {
	fromIntegration = parseMotion(value);
}

/** The motion for a card: its own `motion` option, else the integration's, else `full`. */
export function resolveMotion(cardOption: unknown): Motion {
	return parseMotion(cardOption) ?? fromIntegration ?? 'full';
}

/** The attribute on a card's mount point that asks for less motion. */
export const REDUCED_MOTION_SELECTOR = '[data-motion="reduced"]';

/**
 * Whether what's at `el` should move less: the device asks for it, or it's inside a card set to
 * `reduced`. False for an element not (yet) in a card.
 */
export function lessMotion(el: Element | null | undefined): boolean {
	if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;
	return !!el?.closest(REDUCED_MOTION_SELECTOR);
}
