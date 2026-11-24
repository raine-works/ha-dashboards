import { describe, expect, it } from 'bun:test';
import { LOCK_LOOKS } from '../SecuritySection';

// docs/design/components.md: a lock's state is its status line; its button says what a tap does
describe('lock rows', () => {
	it('never label a button with the state it shows', () => {
		for (const [status, look] of Object.entries(LOCK_LOOKS)) expect(look.label, status).not.toBe(look.state);
	});

	it('offer the move a tap makes', () => {
		expect(LOCK_LOOKS.locked).toMatchObject({ state: 'Locked', label: 'Unlock', variant: 'secondary' });
		// The one door needing a tap leads, and its line says so in amber, with the word
		expect(LOCK_LOOKS.unlocked).toMatchObject({
			state: 'Unlocked',
			label: 'Lock',
			variant: 'default',
			tone: 'warning',
		});
		expect(LOCK_LOOKS.jammed).toMatchObject({ state: 'Jammed', label: 'Lock again', tone: 'alarm' });
	});

	it('color only what is wrong', () => {
		expect(LOCK_LOOKS.locked.tone).toBeUndefined();
		expect(LOCK_LOOKS.locking.tone).toBeUndefined();
		expect(LOCK_LOOKS.offline.tone).toBeUndefined();
	});
});
