/**
 * Reads the guest network's QR code back into its name and password, on this device: the picture
 * Home Assistant serves (UniFi's own code) drawn to a canvas and decoded by jsQR, which loads (a
 * chunk of its own, ~40KB) the first time the dialog opens. A promise chain, not try / catch in a
 * hook, so the React Compiler keeps its callers.
 *
 * @module
 */

import { parseWifiQr, type WifiNetwork } from '../../lib/wifi';

// One read per picture URL (Home Assistant's changes as its token rotates)
const reads = new Map<string, Promise<WifiNetwork | null>>();

/** The network in the QR code at `url`, or null when it can't be read (not a Wi-Fi code, a failed load). */
export function readWifiCode(url: string): Promise<WifiNetwork | null> {
	const known = reads.get(url);
	if (known) return known;
	const read = Promise.all([
		fetch(url, { credentials: 'same-origin' }).then((r) =>
			r.ok ? r.blob() : Promise.reject(new Error(String(r.status))),
		),
		import('jsqr'),
	])
		.then(([blob, { default: jsQR }]) =>
			createImageBitmap(blob).then((bitmap) => {
				const canvas = document.createElement('canvas');
				canvas.width = bitmap.width;
				canvas.height = bitmap.height;
				const context = canvas.getContext('2d');
				if (!context) return null;
				context.drawImage(bitmap, 0, 0);
				const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
				const code = jsQR(data, width, height);
				return code ? parseWifiQr(code.data) : null;
			}),
		)
		.catch(() => null);
	reads.set(url, read);
	// A failed read is tried again next time
	read.then((network) => {
		if (!network) reads.delete(url);
	});
	return read;
}
