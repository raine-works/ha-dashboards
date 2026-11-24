import { describe, expect, it } from 'bun:test';
import { parseWifiQr } from '../wifi';

describe('parseWifiQr', () => {
	it('reads a UniFi guest network', () => {
		expect(parseWifiQr('WIFI:T:WPA;S:Rivera Guest;P:sunny-day-42;H:false;;')).toEqual({
			ssid: 'Rivera Guest',
			password: 'sunny-day-42',
			security: 'WPA',
			hidden: false,
		});
	});

	it('unescapes what the format escapes', () => {
		expect(parseWifiQr(String.raw`WIFI:S:Cafe\;Bar;T:WPA;P:a\:b\,c\\d\"e;;`)).toMatchObject({
			ssid: 'Cafe;Bar',
			password: 'a:b,c\\d"e',
		});
	});

	it('has no password for an open network', () => {
		expect(parseWifiQr('WIFI:T:nopass;S:Lobby;;')).toEqual({
			ssid: 'Lobby',
			password: undefined,
			security: 'nopass',
			hidden: false,
		});
	});

	it('takes a quoted value as written, and a hidden network', () => {
		expect(parseWifiQr('WIFI:S:"0123abcd";T:WPA;P:"pass";H:true;;')).toMatchObject({
			ssid: '0123abcd',
			password: 'pass',
			hidden: true,
		});
	});

	it('is null for anything else', () => {
		expect(parseWifiQr('https://example.com')).toBeNull();
		expect(parseWifiQr('WIFI:T:WPA;P:secret;;')).toBeNull();
		expect(parseWifiQr('')).toBeNull();
	});
});

describe('a Wi-Fi QR code, read back', () => {
	it('gives its network and password, as the guest dialog reads it', async () => {
		const { encode } = await import('uqr');
		const { default: jsQR } = await import('jsqr');
		const text = String.raw`WIFI:T:WPA;S:Rivera Guest;P:sunny\;day-42;H:false;;`;
		// The code as pixels, dark on white with a quiet zone, 8px a module (as the dialog draws UniFi's picture)
		const { data: matrix, size } = encode(text, { border: 4 });
		const scale = 8;
		const width = size * scale;
		const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
		for (let y = 0; y < width; y++)
			for (let x = 0; x < width; x++)
				if (matrix[Math.floor(y / scale)]?.[Math.floor(x / scale)]) {
					const i = (y * width + x) * 4;
					pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
				}
		const code = jsQR(pixels, width, width);
		expect(code?.data).toBe(text);
		expect(parseWifiQr(code?.data ?? '')).toMatchObject({ ssid: 'Rivera Guest', password: 'sunny;day-42' });
	});
});
