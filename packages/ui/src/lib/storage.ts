// The device's own storage: remembered picks (a speaker, a tab), a running timer. It can be
// unavailable or throw (a private window, blocked site data), and everything kept in it has a
// default, so these never throw.

/** A stored value; null when there's none or storage can't be read. */
export function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** Store a value (null removes it). Nothing happens when storage is unavailable. */
export function writeStored(key: string, value: string | null): void {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// Storage off: kept until the page reloads, by whoever holds it in state
	}
}

/** A stored JSON value; undefined when there's none or it can't be read or parsed. */
export function readStoredJson(key: string): unknown {
	const stored = readStored(key);
	if (!stored) return undefined;
	try {
		return JSON.parse(stored) ?? undefined;
	} catch {
		return undefined;
	}
}
