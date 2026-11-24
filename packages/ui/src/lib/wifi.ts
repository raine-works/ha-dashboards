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
 * A value in double quotes that's all hex digits is taken as written (some generators quote a
 * hex-looking SSID so it isn't read as hex).
 */
export function parseWifiQr(text: string): WifiNetwork | null {
	if (!/^WIFI:/i.test(text)) return null;
	const fields: Record<string, string> = {};
	let key = '';
	let value = '';
	let inKey = true;
	let escaped = false;
	for (const char of text.slice(5)) {
		if (escaped) {
			value += char;
			escaped = false;
		} else if (char === '\\' && !inKey) escaped = true;
		else if (inKey && char === ':') inKey = false;
		else if (inKey) key += char;
		else if (char === ';') {
			if (key) fields[key.toUpperCase()] = value;
			key = '';
			value = '';
			inKey = true;
		} else value += char;
	}
	if (key && !inKey) fields[key.toUpperCase()] = value;
	const unquote = (v: string | undefined) => (v && /^"[^"]*"$/.test(v) ? v.slice(1, -1) : v);
	const ssid = unquote(fields.S);
	if (!ssid) return null;
	const security = fields.T || undefined;
	const password = security?.toLowerCase() === 'nopass' ? undefined : unquote(fields.P) || undefined;
	return { ssid, password, security, hidden: fields.H?.toLowerCase() === 'true' };
}
