import { describe, expect, it } from 'bun:test';
import { moreItems } from '../header/HeaderControls';
import { actionLeads, detailClasses, STATUS_ICON_TONES, type StatusTone } from '../ui/status-tile';
import { ICON_TONES } from '../ui/tile';

// docs/design/color.md: theme tokens only, never raw palette colors
const RAW_PALETTE =
	/\b(?:bg|text|border|ring)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d/;

describe('icon tile tones', () => {
	it('use theme tokens only', () => {
		for (const [tone, classes] of Object.entries(ICON_TONES)) expect(classes, tone).not.toMatch(RAW_PALETTE);
	});

	it('draw "on" neutral (primary), never a status hue', () => {
		expect(ICON_TONES.on).toContain('bg-primary');
		expect(ICON_TONES.off).toContain('bg-muted');
	});
});

describe('status tiles', () => {
	it("give each state its status color's tone", () => {
		expect(STATUS_ICON_TONES).toEqual({ ok: 'success', attention: 'warning', danger: 'alarm', neutral: 'off' });
	});

	it("lead with the action only when the state needs it (a safe house's Disarm stays quiet)", () => {
		const leads = (['ok', 'attention', 'danger', 'neutral'] as StatusTone[]).filter(actionLeads);
		expect(leads).toEqual(['attention', 'danger']);
	});
});

describe("a status tile's detail", () => {
	it('is one line unless it must be read whole', () => {
		expect(detailClasses()).toContain('truncate');
		// A refusal to arm names the sensors Arm anyway would bypass: never cut off
		expect(detailClasses(true)).not.toContain('truncate');
	});

	it('warns in amber, keeping its words', () => {
		expect(detailClasses(false, 'warning')).toContain('text-warning');
		expect(detailClasses()).toContain('text-muted-foreground');
	});
});

describe('the More menu', () => {
	it('lists what the house has, alphabetical by label, To-do among them', () => {
		expect(moreItems({ tv: true, todo: true, brief: true, intercom: true })).toEqual([
			'brief',
			'intercom',
			'todo',
			'tv',
		]);
		expect(moreItems({ energy: true, wifi: false })).toEqual(['energy']);
		expect(moreItems({})).toEqual([]);
	});
});

describe('the design roles in the stock components', () => {
	it('draws outline buttons tonal, with no border (the design has no outline role)', async () => {
		const { buttonVariants } = await import('../ui/button');
		const outline = buttonVariants({ variant: 'outline' });
		expect(outline).toContain('bg-secondary');
		expect(outline).not.toMatch(/(^|\s)border(\s|$)/);
	});

	it('has one segmented control, and tonal chips that fill when picked', async () => {
		const { toggleVariants } = await import('../ui/toggle-group');
		expect(toggleVariants({ variant: 'outline' })).toContain('data-[state=on]:bg-card');
		expect(toggleVariants({ variant: 'outline' })).not.toMatch(/(^|\s)border(\s|$)/);
		const chip = toggleVariants({ variant: 'chip' });
		expect(chip).toContain('bg-secondary');
		expect(chip).toContain('data-[state=on]:bg-primary');
	});
});
