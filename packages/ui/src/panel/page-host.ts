/**
 * Which card on the page mounts what the page needs once: the connection banner, the "Dashboard
 * updated" toast, the Assist glow, the TV-audio confirm and, for section cards, the alerts (door
 * toasts, the doorbell's live view). A dashboard can hold several of our cards (the section cards in
 * Home Assistant's sections view); each would otherwise draw its own copy, and two Assist glows or
 * doorbell views at once.
 *
 * The host is the card with the highest priority (a full-page card over a section card), the
 * earliest to join among equals; when it leaves, the next takes over. Each card hears only when its
 * own role changes.
 *
 * @module
 */

/** A card taking part: its priority, and what to call when it becomes, or stops being, the host. */
export interface PageCard {
	/** Higher hosts first: a full-page card (1) over a section card (0). */
	priority: number;
	/** Called when this card becomes the host or stops being it. */
	onHostChange: () => void;
}

const cards: PageCard[] = [];
let host: PageCard | undefined;

function elect() {
	const before = host;
	host = cards.reduce<PageCard | undefined>(
		(best, card) => (!best || card.priority > best.priority ? card : best),
		undefined,
	);
	if (host === before) return;
	before?.onHostChange();
	host?.onHostChange();
}

/** A card joins the page (on connect); returns what it calls to leave (on disconnect). */
export function joinPage(card: PageCard): () => void {
	cards.push(card);
	elect();
	let left = false;
	return () => {
		if (left) return;
		left = true;
		cards.splice(cards.indexOf(card), 1);
		elect();
	};
}

/** Whether this card mounts the page's overlays now. */
export const isPageHost = (card: PageCard) => host === card;
