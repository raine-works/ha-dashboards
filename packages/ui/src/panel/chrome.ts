import type { HomeAssistant } from '../types/homeassistant';

/**
 * Home Assistant's own chrome (the dashboard toolbar and the sidebar), changed from inside a card
 * for a dashboard with its own header: the toolbar hidden, the sidebar kept always hidden, and a
 * button of the card's opening it. The wall panels run in kiosk mode and need none of it.
 */

const TOOLBAR_STYLE_ID = 'panel-hide-toolbar';

/**
 * hui-root's toolbar (`.header`, fixed) hidden, and the view no longer padded under it; the safe
 * area (a phone's notch) stays clear.
 */
const TOOLBAR_CSS = `
.header { display: none !important; }
hui-view-container { padding-top: var(--safe-area-inset-top, 0px) !important; }
`;

/** The nearest ancestor named `tag`, through shadow roots (a card sits deep inside hui-root's). */
export function closestAcrossShadow(el: Element, tag: string): Element | null {
	let node: Node | null = el;
	while (node) {
		if (node instanceof Element && node.localName === tag) return node;
		node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
	}
	return null;
}

// Cards hiding each hui-root's toolbar: a card reconnecting (or a second one) shares the style, which
// goes only once the last of them shows the toolbar again
const toolbarUsers = new WeakMap<ShadowRoot, number>();

/** Hide the dashboard's toolbar; returns a function that shows it again (once, however often it's called). */
export function hideToolbar(card: Element): () => void {
	const root = closestAcrossShadow(card, 'hui-root')?.shadowRoot;
	if (!root) return () => {};
	if (!root.getElementById(TOOLBAR_STYLE_ID)) {
		const style = document.createElement('style');
		style.id = TOOLBAR_STYLE_ID;
		style.textContent = TOOLBAR_CSS;
		root.appendChild(style);
	}
	toolbarUsers.set(root, (toolbarUsers.get(root) ?? 0) + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const users = (toolbarUsers.get(root) ?? 1) - 1;
		toolbarUsers.set(root, users);
		if (users <= 0) root.getElementById(TOOLBAR_STYLE_ID)?.remove();
	};
}

/** The sidebar setting each card last asked to change, so it asks once per change, not per update. */
const askedFrom = new WeakMap<Element, string>();

/**
 * Set the user's "Always hide the sidebar" (Profile → sidebar; stored per browser), as the profile
 * page does, whenever it's anything else. A browser that has never set it reports none (a new
 * user's), which counts as docked; it asks once per setting it sees, not on every hass update.
 */
export function keepSidebarHidden(card: Element, hass: Pick<HomeAssistant, 'dockedSidebar'>) {
	const current = hass.dockedSidebar ?? 'unset';
	if (current === 'always_hidden' || askedFrom.get(card) === current) return;
	askedFrom.set(card, current);
	card.dispatchEvent(
		new CustomEvent('hass-dock-sidebar', { detail: { dock: 'always_hidden' }, bubbles: true, composed: true }),
	);
}

/**
 * Open Home Assistant's sidebar as a drawer (with it always hidden), like the toolbar's menu button
 * did; the Companion app opens its own.
 */
export function openSidebar(from: Element) {
	from.dispatchEvent(new CustomEvent('hass-toggle-menu', { bubbles: true, composed: true }));
}
