import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { canAdoptStyles, sharedStyleSheet } from '../styles';

// Bun has no DOM: a stand-in that counts how often CSS is parsed
let parsed = 0;
class FakeSheet {
	css = '';
	replaceSync(css: string) {
		parsed++;
		this.css = css;
	}
}
const real = globalThis.CSSStyleSheet;
beforeAll(() => {
	(globalThis as { CSSStyleSheet: unknown }).CSSStyleSheet = FakeSheet;
});
afterAll(() => {
	(globalThis as { CSSStyleSheet: unknown }).CSSStyleSheet = real;
});

describe("the cards' shared stylesheet", () => {
	it('is parsed once, however many cards ask for it', () => {
		const first = sharedStyleSheet('test-bundle', '.a{color:red}');
		const again = sharedStyleSheet('test-bundle', '.a{color:red}');
		expect(again).toBe(first);
		expect(parsed).toBe(1);
		expect((first as unknown as FakeSheet).css).toBe('.a{color:red}');
		expect(sharedStyleSheet('other-bundle', '.b{}')).not.toBe(first);
	});

	it('is used only where a ShadowRoot can adopt it', () => {
		expect(canAdoptStyles({ adoptedStyleSheets: [] } as unknown as ShadowRoot)).toBe(true);
		expect(canAdoptStyles({} as ShadowRoot)).toBe(false);
	});
});
