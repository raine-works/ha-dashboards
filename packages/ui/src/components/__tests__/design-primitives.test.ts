import { describe, expect, it } from 'bun:test';
import { actionLeads, STATUS_ICON_TONES, type StatusTone } from '../ui/status-tile';
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
