import { describe, expect, it } from 'bun:test';
import { keepSidebarHidden } from '../chrome';

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
