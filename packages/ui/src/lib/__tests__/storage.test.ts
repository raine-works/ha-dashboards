import { afterEach, describe, expect, it } from 'bun:test';
import { readStored, readStoredJson, writeStored } from '../storage';

const real = globalThis.localStorage;
const use = (storage: unknown) =>
	Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

function memoryStorage() {
	const items = new Map<string, string>();
	return {
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => void items.set(key, value),
		removeItem: (key: string) => void items.delete(key),
	};
}

afterEach(() => use(real));

describe('storage', () => {
	it('reads back what it stored, and removes with null', () => {
		use(memoryStorage());
		expect(readStored('pick')).toBeNull();
		writeStored('pick', 'kitchen');
		expect(readStored('pick')).toBe('kitchen');
		writeStored('pick', null);
		expect(readStored('pick')).toBeNull();
	});

	it('parses JSON, with undefined for nothing, null or junk', () => {
		use(memoryStorage());
		expect(readStoredJson('settings')).toBeUndefined();
		writeStored('settings', '{"volume":75}');
		expect(readStoredJson('settings')).toEqual({ volume: 75 });
		writeStored('settings', 'null');
		expect(readStoredJson('settings')).toBeUndefined();
		writeStored('settings', '{not json');
		expect(readStoredJson('settings')).toBeUndefined();
	});

	it('never throws when storage is unavailable', () => {
		const broken = () => {
			throw new Error('blocked');
		};
		use({ getItem: broken, setItem: broken, removeItem: broken });
		expect(readStored('pick')).toBeNull();
		expect(readStoredJson('pick')).toBeUndefined();
		expect(() => writeStored('pick', 'kitchen')).not.toThrow();
		expect(() => writeStored('pick', null)).not.toThrow();
	});
});
