import { afterEach, describe, expect, it } from 'bun:test';
import { lessMotion, parseMotion, REDUCED_MOTION_SELECTOR, resolveMotion, setIntegrationMotion } from '../motion';

// Just enough of an element: whether it sits inside a card set to `reduced`
const inCard = (reduced: boolean) =>
	({
		closest: (selector: string) => (reduced && selector === REDUCED_MOTION_SELECTOR ? {} : null),
	}) as unknown as Element;

const withDevice = (reduce: boolean) => {
	(globalThis as { window?: unknown }).window = {
		matchMedia: (query: string) => ({ matches: reduce && query === '(prefers-reduced-motion: reduce)' }),
	};
};

afterEach(() => {
	setIntegrationMotion(null);
	delete (globalThis as { window?: unknown }).window;
});

describe('parseMotion', () => {
	it('takes the two settings and nothing else', () => {
		expect(parseMotion('full')).toBe('full');
		expect(parseMotion('reduced')).toBe('reduced');
		for (const value of ['Reduced', 'off', '', true, 0, null, undefined, {}]) expect(parseMotion(value)).toBeNull();
	});
});

describe('resolveMotion', () => {
	it('is full when nothing says otherwise', () => {
		expect(resolveMotion(undefined)).toBe('full');
	});

	it("follows the integration's option", () => {
		setIntegrationMotion('reduced');
		expect(resolveMotion(undefined)).toBe('reduced');
	});

	it("lets a card's own option win either way", () => {
		setIntegrationMotion('reduced');
		expect(resolveMotion('full')).toBe('full');
		setIntegrationMotion('full');
		expect(resolveMotion('reduced')).toBe('reduced');
	});

	it('ignores a setting it doesn’t know', () => {
		setIntegrationMotion('sometimes');
		expect(resolveMotion('lots')).toBe('full');
	});
});

describe('lessMotion', () => {
	it('is false in a card with full motion on a device that moves', () => {
		withDevice(false);
		expect(lessMotion(inCard(false))).toBe(false);
	});

	it('is true inside a card set to reduced', () => {
		withDevice(false);
		expect(lessMotion(inCard(true))).toBe(true);
	});

	it("always follows the device's own setting, whatever the card says", () => {
		withDevice(true);
		expect(lessMotion(inCard(false))).toBe(true);
		expect(lessMotion(null)).toBe(true);
	});

	it('is false for no element on a device that moves', () => {
		withDevice(false);
		expect(lessMotion(null)).toBe(false);
	});
});
