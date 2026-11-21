import { afterEach, describe, expect, test } from 'bun:test';
import { homeAssistantColorScheme, setHomeAssistantColorScheme } from '../ColorScheme';

describe('homeAssistantColorScheme', () => {
	test('reads the browser theme choice, unset being Auto', () => {
		expect(homeAssistantColorScheme({ selectedTheme: { dark: true } })).toBe('dark');
		expect(homeAssistantColorScheme({ selectedTheme: { theme: 'Blackout', dark: false } })).toBe('light');
		expect(homeAssistantColorScheme({ selectedTheme: { theme: 'Blackout' } })).toBe('auto');
		expect(homeAssistantColorScheme({ selectedTheme: null })).toBe('auto');
		expect(homeAssistantColorScheme(null)).toBe('auto');
	});
});

describe('setHomeAssistantColorScheme', () => {
	const original = globalThis.document;
	afterEach(() => {
		globalThis.document = original;
	});

	test('fires settheme on the app with the mode Home Assistant expects', () => {
		const sent: unknown[] = [];
		const app = { dispatchEvent: (e: CustomEvent) => sent.push([e.type, e.detail]) };
		globalThis.document = { querySelector: () => app } as unknown as Document;
		setHomeAssistantColorScheme('light');
		setHomeAssistantColorScheme('dark');
		setHomeAssistantColorScheme('auto');
		expect(sent).toEqual([
			['settheme', { dark: false }],
			['settheme', { dark: true }],
			['settheme', { dark: undefined }],
		]);
	});
});
