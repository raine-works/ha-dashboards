import { afterEach, describe, expect, it } from 'bun:test';
import { hidePageScrollbar, keepSidebarHidden } from '../chrome';

const card = () => {
	const asked: string[] = [];
	const element = { dispatchEvent: (e: CustomEvent) => asked.push(e.detail.dock) } as unknown as Element;
	return { element, asked };
};

describe('keepSidebarHidden', () => {
	it("hides a new browser's sidebar (no setting yet), once", () => {
		const { element, asked } = card();
		keepSidebarHidden(element, {});
		keepSidebarHidden(element, {});
		expect(asked).toEqual(['always_hidden']);
	});

	it('asks again when the setting changes back, and never once it is hidden', () => {
		const { element, asked } = card();
		keepSidebarHidden(element, { dockedSidebar: 'docked' });
		keepSidebarHidden(element, { dockedSidebar: 'always_hidden' });
		keepSidebarHidden(element, { dockedSidebar: 'auto' });
		expect(asked).toEqual(['always_hidden', 'always_hidden']);
	});
});

describe('hidePageScrollbar', () => {
	// A page of its own: a head holding style elements by id
	const fakePage = () => {
		const styles = new Map<string, { id: string; textContent: string; remove: () => void }>();
		(globalThis as { document?: unknown }).document = {
			getElementById: (id: string) => styles.get(id) ?? null,
			createElement: () => {
				const style = { id: '', textContent: '', remove: () => styles.delete(style.id) };
				return style;
			},
			head: {
				appendChild: (style: { id: string; textContent: string; remove: () => void }) => styles.set(style.id, style),
			},
		};
		return styles;
	};
	afterEach(() => {
		delete (globalThis as { document?: unknown }).document;
	});

	it("hides the page's scrollbar while a dashboard is on it, and shows it once the last one leaves", () => {
		const styles = fakePage();
		const first = hidePageScrollbar();
		const second = hidePageScrollbar();
		expect(styles.size).toBe(1);
		expect([...styles.values()][0].textContent).toContain('scrollbar-width:none');
		first();
		expect(styles.size).toBe(1);
		second();
		expect(styles.size).toBe(0);
	});

	it('counts a release once, however often it is called', () => {
		const styles = fakePage();
		const first = hidePageScrollbar();
		const second = hidePageScrollbar();
		first();
		first();
		expect(styles.size).toBe(1);
		second();
		expect(styles.size).toBe(0);
	});
});
