/**
 * The compiled stylesheet, parsed once and shared by every card's ShadowRoot (constructable
 * stylesheets, `adoptedStyleSheets`), instead of a `<style>` copy each: a page of section cards
 * parsed and kept the ~220KB of CSS once per card. Each card keeps its theme's tokens in a small
 * sheet of its own, adopted after the shared one so they win.
 *
 * @module
 */

const shared = new Map<string, CSSStyleSheet>();

/** Whether this ShadowRoot can adopt constructable stylesheets (every browser Home Assistant supports). */
export function canAdoptStyles(root: ShadowRoot): boolean {
	return (
		'adoptedStyleSheets' in root &&
		typeof CSSStyleSheet === 'function' &&
		typeof CSSStyleSheet.prototype.replaceSync === 'function'
	);
}

/**
 * The stylesheet for `key`, parsed from `css` the first time it's asked for and the same object
 * after (the bundle's CSS never changes while the page lives; a new bundle is a new page).
 */
export function sharedStyleSheet(key: string, css: string): CSSStyleSheet {
	let sheet = shared.get(key);
	if (!sheet) {
		sheet = new CSSStyleSheet();
		sheet.replaceSync(css);
		shared.set(key, sheet);
	}
	return sheet;
}
