import { describe, expect, it } from 'bun:test';
import type { Clip } from '../../lib/clips';
import { signedThumbnail } from '../camera/clipShared';

const clip = (id: string): Clip => ({
	id: `nvr:event:${id}`,
	start: new Date(2026, 9, 30, 9),
	duration: 10,
	kind: 'person',
	label: 'Person',
	thumbnail: `/api/unifiprotect/thumbnail/nvr/${id}?width=185&height=185`,
});

/** A Home Assistant that signs each path with a counter, so a new signature shows. */
function signer() {
	const calls: { path: string; expires: number }[] = [];
	const hass = {
		callWS: async <T>(msg: Record<string, unknown>) => {
			calls.push({ path: msg.path as string, expires: msg.expires as number });
			return { path: `${msg.path}?authSig=${calls.length}` } as T;
		},
	};
	return { hass, calls };
}

describe('signedThumbnail', () => {
	it('signs a thumbnail once and shares it', async () => {
		const { hass, calls } = signer();
		const now = 1_000_000;
		const first = await signedThumbnail(hass, clip('a'), now);
		const again = await signedThumbnail(hass, clip('a'), now + 60_000);
		expect(again).toBe(first);
		expect(calls).toEqual([{ path: '/api/unifiprotect/thumbnail/nvr/a', expires: 3600 }]);
	});

	it('signs it again before the signature expires (pages stay open for hours)', async () => {
		const { hass, calls } = signer();
		const now = 2_000_000;
		const first = await signedThumbnail(hass, clip('b'), now);
		const later = await signedThumbnail(hass, clip('b'), now + 55 * 60_000);
		expect(later).not.toBe(first);
		expect(calls).toHaveLength(2);
	});

	it('tries again after a failed signature', async () => {
		let fail = true;
		const hass = {
			callWS: async <T>(msg: Record<string, unknown>) => {
				if (fail) throw new Error('offline');
				return { path: `${msg.path}?authSig=1` } as T;
			},
		};
		await expect(signedThumbnail(hass, clip('c'), 0) as Promise<string>).rejects.toThrow('offline');
		fail = false;
		expect(await signedThumbnail(hass, clip('c'), 1)).toBe('/api/unifiprotect/thumbnail/nvr/c?authSig=1');
	});

	it('has nothing to sign without a thumbnail', () => {
		const { hass } = signer();
		expect(signedThumbnail(hass, { ...clip('d'), thumbnail: undefined })).toBeUndefined();
	});
});
