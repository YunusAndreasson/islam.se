/** Where a line must not break. A number split at the end of a line reads as two numbers
 *  (»Omkring 70 / 000 besökare«, the first line of an essay, 2026-10-30), and a date, a
 *  percentage or a reference split from its number reads as a typo. Swedish sets these with
 *  a plain space, so the source cannot say so: the no-break space goes in on the way to the
 *  page, in the markdown (plugins/rehype-no-break.ts) and in the text that comes from data.
 *
 *  Its own module and build-only, unlike lib/format.ts, which client scripts import. */
const NBSP = "\u00A0";
const MONTHS =
	"januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december";
const NO_BREAK: readonly RegExp[] = [
	// 70 000 · 1 652 895
	/(?<=(?<![\d.,:])\d{1,3}(?: \d{3})*) (?=\d{3}(?!\d))/g,
	// 12 % · 106 procent · 30 kronor · 8 km · 3 miljoner
	/(?<=\d) (?=(?:%|procent|kronor|kr|km|m|cm|kg|ton|meter|grader|miljoner|miljarder)(?![\p{L}\d]))/gu,
	// 31 oktober
	new RegExp(`(?<=(?<!\\d)\\d{1,2}) (?=(?:${MONTHS})(?!\\p{L}))`, "gu"),
	// 622 e.Kr. · 1448 e.H.
	/(?<=\d) (?=[ef]\.(?:Kr|H)\b)/g,
	// nr 977 · s. 12 · kl. 14 · kap. 3 · § 8 · sura 2 · vers 5 · Koranen 59:10
	/(?<=(?<![\p{L}])(?:nr|s\.|kl\.|kap\.|§|sura|vers|Koranen)) (?=\d)/gu,
];

export function noBreak(text: string): string {
	return NO_BREAK.reduce((out, rule) => out.replace(rule, NBSP), text);
}
