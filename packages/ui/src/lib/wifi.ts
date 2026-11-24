/**
 * A Wi-Fi network's QR code, read back: the `WIFI:` text phones join from (the ZXing format every
 * camera app reads, `WIFI:T:WPA;S:<network>;P:<password>;H:false;;`), so the guest dialog can show
 * the network and password for a laptop, which can't scan it.
 *
 * @module
 */

/** A network from its QR code: the name (SSID), the password (none for an open network), its security. */
export interface WifiNetwork {
	ssid: string;
	password?: string;
	/** `WPA`, `WEP`, `SAE`… or `nopass`, as the code says. */
	security?: string;
	hidden: boolean;
}

/**
 * The fields of a `WIFI:` code, unescaped (`\;`, `\,`, `\:`, `\\`, `\"`), or null for anything else.
 * A value between unescaped double quotes (`P:"pass"`) is taken without them, as some generators
 * quote a hex-looking SSID so it isn't read as hex; escaped quotes (`P:\"pass\"`) are part of the
 * value and stay.
 */
export function parseWifiQr(text: string): WifiNetwork | null {
	if (!/^WIFI:/i.test(text)) return null;
	const fields: Record<string, string> = {};
	let key = '';
	let value = '';
	let inKey = true;
	let escaped = false;
	// Whether the value opened with an unescaped quote, and whether its last character was one
	let opensQuoted = false;
	let closesQuoted = false;
	const end = () => {
		if (!key) return;
		fields[key.toUpperCase()] = opensQuoted && closesQuoted && value.length >= 2 ? value.slice(1, -1) : value;
	};
	for (const char of text.slice(5)) {
		if (escaped) {
			value += char;
			escaped = false;
			closesQuoted = false;
		} else if (char === '\\' && !inKey) escaped = true;
		else if (inKey && char === ':') {
			inKey = false;
			opensQuoted = false;
			closesQuoted = false;
		} else if (inKey) key += char;
		else if (char === ';') {
			end();
			key = '';
			value = '';
			inKey = true;
		} else {
			if (char === '"' && !value) opensQuoted = true;
			closesQuoted = char === '"';
			value += char;
		}
	}
	if (!inKey) end();
	const ssid = fields.S;
	if (!ssid) return null;
	const security = fields.T || undefined;
	const password = security?.toLowerCase() === 'nopass' ? undefined : fields.P || undefined;
	return { ssid, password, security, hidden: fields.H?.toLowerCase() === 'true' };
}
