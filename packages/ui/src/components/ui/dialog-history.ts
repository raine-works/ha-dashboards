/**
 * Open dialogs as browser history entries, so Back (the browser's, or Android's back button in the
 * Companion app) closes the top dialog instead of leaving the dashboard. Each open dialog has an
 * entry of its own, its title in the URL (`?dialog=music`); closing one any other way (its X,
 * Escape, a tap outside, the idle timeout) takes its entry off again. A reload opens no dialog: the
 * parameter is only a marker, dropped on load.
 *
 * History moves asynchronously (`history.go` lands with a popstate later), so this keeps the dialogs
 * that want an entry and brings history in line with them a microtask after each change, one move
 * at a time. Its state key is its own: Home Assistant acts on popstates whose state has `dialog` or
 * `opensDialog` (its own dialogs), so its state is never copied into ours.
 */

const STATE_KEY = 'haDashboardsDialogs';
export const DIALOG_PARAM = 'dialog';
/** A move whose popstate never comes (the page navigated away meanwhile) stops blocking after this. */
const MOVE_TIMEOUT_MS = 1000;

/** The parts of `window` this uses (a fake in tests). */
export interface HistoryWindow {
	readonly location: { readonly href: string };
	readonly history: Pick<History, 'state' | 'pushState' | 'replaceState' | 'go'>;
	addEventListener(type: 'popstate', listener: () => void): void;
}

/** A dialog's title as a URL word: "Open Doors & Windows" → "open-doors-windows". */
export function dialogSlug(title: string | null | undefined): string {
	const slug = (title ?? '')
		.normalize('NFKD')
		.replace(/[̀-ͯ'’]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || 'open';
}

interface Entry {
	/** Read when its history entry is made, after the dialog has rendered its title. */
	name: () => string;
	close: () => void;
}

export function createDialogHistory(win: HistoryWindow) {
	const entries: Entry[] = [];
	let started = false;
	let scheduled = false;
	let moving: ReturnType<typeof setTimeout> | undefined;

	const depthOf = (state: unknown) => {
		const depth = (state as Record<string, unknown> | null)?.[STATE_KEY];
		return typeof depth === 'number' ? depth : 0;
	};

	const urlFor = (name?: string) => {
		const url = new URL(win.location.href);
		if (name) url.searchParams.set(DIALOG_PARAM, name);
		else url.searchParams.delete(DIALOG_PARAM);
		return url.toString();
	};

	const sync = () => {
		scheduled = false;
		if (moving) return;
		const depth = depthOf(win.history.state);
		if (depth > entries.length) {
			// Dialogs closed without Back (or Forward onto an entry whose dialog is gone): step back
			moving = setTimeout(() => {
				moving = undefined;
				schedule();
			}, MOVE_TIMEOUT_MS);
			win.history.go(entries.length - depth);
			return;
		}
		// The URL names the dialog on top (one under it may have closed first)
		const top = entries[depth - 1];
		if (top && new URL(win.location.href).searchParams.get(DIALOG_PARAM) !== top.name()) {
			win.history.replaceState({ [STATE_KEY]: depth }, '', urlFor(top.name()));
		}
		for (let d = depth; d < entries.length; d++) {
			win.history.pushState({ [STATE_KEY]: d + 1 }, '', urlFor(entries[d].name()));
		}
	};

	function schedule() {
		if (scheduled) return;
		scheduled = true;
		queueMicrotask(sync);
	}

	const onPopState = () => {
		if (moving) {
			// Our own step back landing: nothing to close (a dialog opened meanwhile gets its entry now)
			clearTimeout(moving);
			moving = undefined;
		} else {
			// Back left these dialogs' entries: close them, top first
			const closing = entries.splice(depthOf(win.history.state));
			for (const entry of closing.reverse()) entry.close();
		}
		schedule();
	};

	const start = () => {
		if (started) return;
		started = true;
		win.addEventListener('popstate', onPopState);
		// A reload while a dialog was open: this entry is the page again, with no dialog
		const url = new URL(win.location.href);
		if (depthOf(win.history.state) > 0 || url.searchParams.has(DIALOG_PARAM)) {
			win.history.replaceState(null, '', urlFor());
		}
	};

	return {
		/** A dialog opened: give it a history entry. Returns its release, for when it closes. */
		open(name: () => string, close: () => void) {
			start();
			const entry: Entry = { name, close };
			entries.push(entry);
			schedule();
			return () => {
				const index = entries.indexOf(entry);
				if (index < 0) return; // Back closed it, and took its entry with it
				entries.splice(index, 1);
				schedule();
			};
		},
	};
}

let pageHistory: ReturnType<typeof createDialogHistory> | undefined;

/** The page's dialog history (one for every card on it). */
export const dialogHistory = () => {
	pageHistory ??= createDialogHistory(window);
	return pageHistory;
};
