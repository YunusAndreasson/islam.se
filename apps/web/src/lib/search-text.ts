// Shared by every search surface: the palette (build index + client matcher) and
// the /svar/ filter. One definition — index and matcher must fold identically.

/** Case- and diacritic-insensitive: å/ä/ö → a/a/o, so "bon" finds "bön". */
export function fold(s: string): string {
	return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Folded words, punctuation dropped. One-letter leftovers are discarded. */
export function foldedWords(s: string): string[] {
	return fold(s)
		.split(/[^\p{L}\p{N}]+/u)
		.filter((w) => w.length > 1);
}

/** Below this, near-misses are noise rather than help. */
const FUZZY_MIN = 4;

/**
 * Would someone typing `token` plausibly have meant `word`?
 *
 * 1. Either is a prefix of the other — the Swedish case, and the common one: a
 *    substring search finds "bön" inside "böner" but never the reverse, so
 *    "böner", "moskéer", "aborten" and "halalslakten" all found nothing.
 * 2. Bounded edit distance for typos. The first letter must agree, which rejects
 *    almost every candidate before the expensive part.
 */
export function closeEnough(token: string, word: string): boolean {
	if (token.length < FUZZY_MIN || word.length < FUZZY_MIN) return false;
	if (token.startsWith(word) || word.startsWith(token)) return true;
	if (token.charAt(0) !== word.charAt(0)) return false;
	return withinEdits(token, word, token.length >= 8 ? 2 : 1);
}

/** Optimal string alignment (Levenshtein + adjacent transposition) bounded by
 *  `max`; a transposition counts as one edit. Bails once a whole row exceeds it. */
function withinEdits(a: string, b: string, max: number): boolean {
	if (Math.abs(a.length - b.length) > max) return false;

	const d = Array.from({ length: a.length + 1 }, (_, i) =>
		Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);

	for (let i = 1; i <= a.length; i++) {
		const row = d[i] ?? [];
		const previous = d[i - 1] ?? [];
		let best = row[0] ?? Number.POSITIVE_INFINITY;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let v = Math.min(
				(previous[j] ?? Number.POSITIVE_INFINITY) + 1,
				(row[j - 1] ?? Number.POSITIVE_INFINITY) + 1,
				(previous[j - 1] ?? Number.POSITIVE_INFINITY) + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				v = Math.min(v, (d[i - 2]?.[j - 2] ?? Number.POSITIVE_INFINITY) + 1);
			}
			row[j] = v;
			if (v < best) best = v;
		}
		if (best > max) return false;
	}
	return (d[a.length]?.[b.length] ?? Number.POSITIVE_INFINITY) <= max;
}
