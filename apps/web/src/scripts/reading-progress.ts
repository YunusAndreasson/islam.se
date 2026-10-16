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
		const pct = Number(localStorage.getItem(key(slug)));
		return Number.isFinite(pct) && pct >= 0 && pct <= 1 ? pct : 0;
	} catch {
		return 0;
	}
}

const LAST = "rp:last";

/** Stores `pct` when it is further than what is stored: progress is a high-water mark,
 *  so scrolling back up to re-read a passage never loses the place. Also remembers
 *  WHICH essay was read last, with its title, so the front page can offer to go back
 *  to it without fetching anything (see unfinished()). */
export function recordProgress(slug: string, pct: number, title?: string): void {
	if (!Number.isFinite(pct) || pct < 0 || pct > 1) return;
	rememberLast(slug, title);
	if (pct <= readProgress(slug)) return;
	try {
		localStorage.setItem(key(slug), pct.toFixed(3));
	} catch {
		// Blocked or full: the essay still reads, it just cannot offer to resume.
	}
}

/** Past this fraction an essay counts as READ: the reader is in its last few
 *  paragraphs. It is also where the essay page stops offering to resume ([...slug].astro).
 *  One number, so the »läst« mark on /essaer/ and a part's »läst« in a series can never
 *  disagree about the same essay. The fraction is of the PROSE (proseProgress), not the
 *  page: measured on the page, a reader who had read every line stood at 0.71–0.76 on a
 *  phone and 0.81–0.85 on a laptop, the notes and onward links still below, and was
 *  never marked as having read the essay (2026-10-16). */
export const READ_AT = 0.85;

/** How far into an essay's prose the reader has got, 0–1: the share of the prose that
 *  has come up past the foot of the screen. What is recorded, and what READ_AT and the
 *  resume offer read. */
export function proseProgress(prose: Element): number {
	const box = prose.getBoundingClientRect();
	if (box.height <= 0) return 0;
	return Math.min(1, Math.max(0, (window.innerHeight - box.top) / box.height));
}

/** The scroll position at which `fraction` of the prose stands above the foot of the
 *  screen: where the resume offer takes the reader back to. */
export function scrollForProse(prose: Element, fraction: number): number {
	const box = prose.getBoundingClientRect();
	return Math.max(0, box.top + window.scrollY + fraction * box.height - window.innerHeight);
}

export function hasRead(slug: string): boolean {
	return readProgress(slug) > READ_AT;
}

/** Below this an essay was opened, not read: the resume pill and the front page's
 *  »Fortsätt läsa« both ignore it. */
export const RESUME_FROM = 0.06;

interface Last {
	slug: string;
	title: string;
}

function rememberLast(slug: string, title?: string): void {
	if (!title) return;
	try {
		const next = JSON.stringify({ slug, title } satisfies Last);
		if (localStorage.getItem(LAST) !== next) localStorage.setItem(LAST, next);
	} catch {
		// Blocked storage: nothing to offer later, which is the same as a new reader.
	}
}

/** The essay the reader was last in, if it was left part-read — the front page's
 *  »Fortsätt läsa«. Null for a new reader, a finished essay, a stored value this
 *  version cannot read, or blocked storage. */
export function unfinished(): (Last & { pct: number }) | null {
	let last: Partial<Last> | null = null;
	try {
		last = JSON.parse(localStorage.getItem(LAST) ?? "null");
	} catch {
		return null;
	}
	if (!(last && typeof last.slug === "string" && typeof last.title === "string")) return null;
	const pct = readProgress(last.slug);
	return pct > RESUME_FROM && pct <= READ_AT ? { slug: last.slug, title: last.title, pct } : null;
}
