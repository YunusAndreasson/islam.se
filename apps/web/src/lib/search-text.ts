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
	if (token[0] !== word[0]) return false;
	return withinEdits(token, word, token.length >= 8 ? 2 : 1);
}

/** Optimal string alignment (Levenshtein + adjacent transposition) bounded by
 *  `max`; a transposition counts as one edit. Bails once a whole row exceeds it. */
function withinEdits(a: string, b: string, max: number): boolean {
	if (Math.abs(a.length - b.length) > max) return false;

	const d: number[][] = [];
	for (let i = 0; i <= a.length; i++) d.push(new Array<number>(b.length + 1).fill(0));
	for (let i = 0; i <= a.length; i++) d[i][0] = i;
	for (let j = 0; j <= b.length; j++) d[0][j] = j;

	for (let i = 1; i <= a.length; i++) {
		let best = d[i][0];
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				v = Math.min(v, d[i - 2][j - 2] + 1);
			}
			d[i][j] = v;
			if (v < best) best = v;
		}
		if (best > max) return false;
	}
	return d[a.length][b.length] <= max;
}
