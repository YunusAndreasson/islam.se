// localStorage that cannot throw. A hardened Firefox profile, some private modes and a
// full quota all throw on touch, and every reader on the site means the same thing by
// that: nothing is stored, and the page works without it. Unguarded, one such throw
// escaped a scroll handler ahead of the abort() that unbinds it, and every in-site
// navigation stacked another set of listeners (reading-progress.ts). The guard lives
// here once instead of in a try block at each of fourteen call sites.

/** The stored string, or null when there is none or storage is blocked. */
export function readStored(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** The stored value parsed as JSON, or null when it is absent, blocked or not JSON. The
 *  shape is still the caller's to check: what comes out of storage is input. */
export function readStoredJson(key: string): unknown {
	const raw = readStored(key);
	if (raw === null) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/** Blocked or full, the write is dropped: the page carries on without remembering. */
export function writeStored(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Nothing to fall back to; the next read finds nothing and takes its default.
	}
}

export function removeStored(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// Blocked storage holds nothing to remove.
	}
}
