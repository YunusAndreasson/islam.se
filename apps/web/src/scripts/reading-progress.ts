// How far into an essay the reader has got, kept per essay as `rp:<slug>` in
// localStorage: the furthest fraction scrolled, 0–1. Base.astro writes it while an
// essay is read; the essay's resume pill and the »läst« mark on /essaer/ read it.
//
// Every access is guarded. With storage blocked (a hardened Firefox profile, some
// private modes) localStorage throws on touch, and unguarded that escaped from the
// scroll handler — and from the before-swap hook ahead of the abort() that unbinds
// it, so each in-site navigation stacked another set of scroll listeners.

const key = (slug: string) => `rp:${slug}`;

export function readProgress(slug: string): number {
	try {
		return Number(localStorage.getItem(key(slug))) || 0;
	} catch {
		return 0;
	}
}

/** Stores `pct` when it is further than what is stored: progress is a high-water mark,
 *  so scrolling back up to re-read a passage never loses the place. */
export function recordProgress(slug: string, pct: number): void {
	if (pct <= readProgress(slug)) return;
	try {
		localStorage.setItem(key(slug), pct.toFixed(3));
	} catch {
		// Blocked or full: the essay still reads, it just cannot offer to resume.
	}
}
