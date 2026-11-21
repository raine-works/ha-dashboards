import { encode } from 'uqr';

/**
 * A QR code as one SVG path: `size` modules square (a 4-module quiet zone included, which scanners
 * need), each row's dark runs as rectangles, drawn as elements (never injected markup). Medium error
 * correction, so a phone still reads it from across a room.
 */
export function qrPath(text: string): { size: number; path: string } {
	const { data, size } = encode(text, { ecc: 'M', border: 4 });
	let path = '';
	for (const [y, row] of data.entries()) {
		let x = 0;
		while (x < size) {
			if (!row[x]) {
				x++;
				continue;
			}
			const start = x;
			while (x < size && row[x]) x++;
			path += `M${start} ${y}h${x - start}v1h${start - x}z`;
		}
	}
	return { size, path };
}
