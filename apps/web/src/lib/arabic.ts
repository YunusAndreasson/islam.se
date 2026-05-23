/**
 * Pure Arabic-text helpers shared by the Astro runtime and the `sync-verses`
 * authoring script. No Astro imports here — this file must be loadable by a
 * plain `tsx` process (the script) as well as by the site build.
 */

/** One word's recitation window: [wordNumber (1-based), startMs, endMs]. */
export type Segment = [word: number, start: number, end: number];

/** A token of voweled Uthmanic text: a recited word (carries a 1-based `word`
 *  index matching QUL segment numbering) or a standalone pause/waqf mark
 *  (`word: null`, rendered but never highlighted). */
export interface VerseToken {
	text: string;
	word: number | null;
}

/**
 * Split voweled Uthmanic text into word and waqf tokens, assigning each word a
 * 1-based index in recitation order. A token counts as a word when it contains
 * at least one Arabic base letter (U+0621–U+064A); standalone pause marks
 * (ۖ ۗ ۚ …, U+06D6+) carry only combining/symbol codepoints and are skipped in
 * the numbering. This mirrors QUL's word segmentation, so token index N lines up
 * with segment `word` N — `sync-verses` asserts the counts match per verse.
 */
export function tokenizeArabic(text: string): VerseToken[] {
	const hasLetter = /[ء-ي]/;
	let word = 0;
	return text
		.split(/\s+/)
		.filter(Boolean)
		.map((t) => (hasLetter.test(t) ? { text: t, word: ++word } : { text: t, word: null }));
}

/** Number of recited words in a verse — the highest word index `tokenizeArabic`
 *  assigns. Used to validate that the text and the QUL segment data agree. */
export function wordCount(text: string): number {
	return tokenizeArabic(text).reduce((n, t) => (t.word ? n + 1 : n), 0);
}
