import { describe, expect, it } from 'bun:test';
import { contrast, cssToHex, mixHex } from '../color';
import { PRESET_THEMES } from '../index';
import type { Tokens } from '../tokens';

// docs/design/color.md: text at 4.5:1 (WCAG 1.4.3), a control's edge at 3:1 (1.4.11), in every theme
// and both modes, so a theme can't ship a status color that can't be read
const TEXT = 4.5;
const CONTROL = 3;
const STATUSES = ['success', 'warning', 'info', 'destructive', 'alarm'] as const;

/** A status's tint, as the dashboards draw it: the color mixed into the surface (10% light, 14% dark). */
const tint = (tokens: Tokens, status: string, dark: boolean) =>
	mixHex(tokens[status as keyof Tokens], cssToHex(tokens.card) ?? '#000000', dark ? 0.14 : 0.1);

for (const theme of PRESET_THEMES)
	describe(`${theme.name}`, () => {
		for (const [mode, tokens] of [
			['light', theme.light],
			['dark', theme.dark],
		] as const) {
			const dark = mode === 'dark';
			// A translucent token (a dark border) shows over the card
			const on = (fg: string, bg: string) => contrast(fg, bg, cssToHex(tokens.card) ?? '#000000');

			it(`${mode}: text reads on every surface`, () => {
				for (const surface of ['background', 'card', 'popover', 'muted'] as const) {
					expect(on(tokens.foreground, tokens[surface]), `foreground on ${surface}`).toBeGreaterThanOrEqual(TEXT);
					expect(on(tokens['muted-foreground'], tokens[surface]), `muted text on ${surface}`).toBeGreaterThanOrEqual(
						TEXT,
					);
				}
				expect(on(tokens['primary-foreground'], tokens.primary), 'on primary').toBeGreaterThanOrEqual(TEXT);
				expect(on(tokens['secondary-foreground'], tokens.secondary), 'on secondary').toBeGreaterThanOrEqual(TEXT);
			});

			it(`${mode}: a control's edge shows (3:1)`, () => {
				expect(on(tokens.input, tokens.card), 'input on card').toBeGreaterThanOrEqual(CONTROL);
			});

			for (const status of STATUSES)
				it(`${mode}: ${status} reads as text, on its tint, and under its foreground`, () => {
					const color = tokens[status];
					expect(on(color, tokens.card), `${status} on card`).toBeGreaterThanOrEqual(TEXT);
					expect(on(color, tint(tokens, status, dark)), `${status} on its tint`).toBeGreaterThanOrEqual(TEXT);
					const foreground = status === 'destructive' ? undefined : tokens[`${status}-foreground` as keyof Tokens];
					if (foreground)
						expect(on(foreground, color), `${status}-foreground on ${status}`).toBeGreaterThanOrEqual(TEXT);
				});

			it(`${mode}: the alarm is the destructive red (one red for danger)`, () => {
				expect(tokens.alarm).toBe(tokens.destructive);
			});
		}
	});
