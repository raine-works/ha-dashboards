import { describe, expect, test } from 'bun:test';
import { createDialogHistory, dialogSlug, type HistoryWindow } from '../ui/dialog-history';

/** A browser's session history: entries, the current one, and popstate after a move (async, as in browsers). */
function fakeWindow(start = { state: null as unknown, url: 'https://ha.local/dashboard-home/home' }) {
	const entries = [start];
	let index = 0;
	const listeners: (() => void)[] = [];
	const win: HistoryWindow & { back(): void } = {
		get location() {
			return { href: entries[index].url };
		},
		history: {
			get state() {
				return entries[index].state;
			},
			pushState(state: unknown, _title: string, url?: string | URL | null) {
				entries.splice(index + 1, entries.length, { state, url: String(url ?? entries[index].url) });
				index++;
			},
			replaceState(state: unknown, _title: string, url?: string | URL | null) {
				entries[index] = { state, url: String(url ?? entries[index].url) };
			},
			go(delta = 0) {
				setTimeout(() => {
					index = Math.max(0, Math.min(entries.length - 1, index + delta));
					for (const listener of listeners) listener();
				}, 0);
			},
		},
		addEventListener(_type, listener) {
			listeners.push(listener);
		},
		back() {
			this.history.go(-1);
		},
	};
	return {
		win,
		get index() {
			return index;
		},
		get urls() {
			return entries.map((entry) => new URL(entry.url).search);
		},
	};
}

// Lets the fake history's moves land: each history.go() lands on a timer of its own, and a landing can
// start another move (a microtask, then another timer). A few zero-delay timers in a row run after
// every such timer queued before them, whatever the machine's speed; a fixed wait (5ms) could end
// before a late timer's follow-up on a slow CI runner.
const settle = async () => {
	for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
};

function dialog(name: string) {
	const shown = { open: true };
	return { shown, name: () => name, close: () => (shown.open = false) };
}

describe('dialogSlug', () => {
	test('makes a title a URL word', () => {
		expect(dialogSlug('Open Doors & Windows')).toBe('open-doors-windows');
		expect(dialogSlug("Kai's Room Is in Bedtime")).toBe('kais-room-is-in-bedtime');
		expect(dialogSlug('Café · Music')).toBe('cafe-music');
		expect(dialogSlug('')).toBe('open');
		expect(dialogSlug(undefined)).toBe('open');
	});
});

describe('createDialogHistory', () => {
	test('an open dialog gets an entry naming it, and Back closes it', async () => {
		const page = fakeWindow();
		const history = createDialogHistory(page.win);
		const music = dialog('music');
		history.open(music.name, music.close);
		await settle();
		expect(page.urls).toEqual(['', '?dialog=music']);
		expect(page.index).toBe(1);

		page.win.back();
		await settle();
		expect(music.shown.open).toBe(false);
		expect(page.index).toBe(0);
		expect(page.urls).toEqual(['', '?dialog=music']); // the forward entry, until something new is pushed
	});

	test('closing a dialog another way takes its entry off', async () => {
		const page = fakeWindow();
		const history = createDialogHistory(page.win);
		const music = dialog('music');
		const release = history.open(music.name, music.close);
		await settle();
		release();
		await settle();
		expect(page.index).toBe(0);
		expect(new URL(page.win.location.href).search).toBe('');
	});

	test('stacked dialogs close one Back at a time, top first', async () => {
		const page = fakeWindow();
		const history = createDialogHistory(page.win);
		const music = dialog('music');
		const colors = dialog('light-colors');
		history.open(music.name, music.close);
		history.open(colors.name, colors.close);
		await settle();
		expect(page.urls).toEqual(['', '?dialog=music', '?dialog=light-colors']);

		page.win.back();
		await settle();
		expect(colors.shown.open).toBe(false);
		expect(music.shown.open).toBe(true);
		expect(new URL(page.win.location.href).search).toBe('?dialog=music');

		page.win.back();
		await settle();
		expect(music.shown.open).toBe(false);
		expect(page.index).toBe(0);
	});

	test('the one under closing first leaves the top one named and on one entry', async () => {
		const page = fakeWindow();
		const history = createDialogHistory(page.win);
		const music = dialog('music');
		const camera = dialog('cameras');
		const releaseMusic = history.open(music.name, music.close);
		history.open(camera.name, camera.close);
		await settle();
		releaseMusic();
		await settle();
		expect(page.index).toBe(1);
		expect(new URL(page.win.location.href).search).toBe('?dialog=cameras');

		page.win.back();
		await settle();
		expect(camera.shown.open).toBe(false);
		expect(page.index).toBe(0);
	});

	test('one closing as another opens swaps the entry, never moving history', async () => {
		const page = fakeWindow();
		const history = createDialogHistory(page.win);
		const music = dialog('music');
		const release = history.open(music.name, music.close);
		await settle();
		release();
		const doorbell = dialog('cameras');
		history.open(doorbell.name, doorbell.close);
		await settle();
		expect(page.index).toBe(1);
		expect(page.urls).toEqual(['', '?dialog=cameras']);
	});

	test('a dialog opened while a step back is under way gets its entry after it', async () => {
		const page = fakeWindow();
		const history = createDialogHistory(page.win);
		const music = dialog('music');
		const release = history.open(music.name, music.close);
		await settle();
		release();
		await Promise.resolve(); // the step back has started, its popstate not yet in
		const weather = dialog('weather');
		history.open(weather.name, weather.close);
		await settle();
		expect(page.index).toBe(1);
		expect(new URL(page.win.location.href).search).toBe('?dialog=weather');
		expect(weather.shown.open).toBe(true);
	});

	test('Forward onto an entry whose dialog is gone steps back again', async () => {
		const page = fakeWindow();
		const history = createDialogHistory(page.win);
		const music = dialog('music');
		history.open(music.name, music.close);
		await settle();
		page.win.back();
		await settle();
		page.win.history.go(1);
		await settle();
		expect(page.index).toBe(0);
	});

	test('a reload with a dialog in the URL opens on the page alone', async () => {
		const page = fakeWindow({
			state: { haDashboardsDialogs: 1 },
			url: 'https://ha.local/dashboard-home/home?dialog=music',
		});
		const history = createDialogHistory(page.win);
		const weather = dialog('weather');
		history.open(weather.name, weather.close);
		await settle();
		expect(page.urls).toEqual(['', '?dialog=weather']);
		expect(page.index).toBe(1);
	});
});
