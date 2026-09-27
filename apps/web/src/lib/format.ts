// Shared Swedish number formatters. Cached module-level instances (constructing an
// Intl.NumberFormat is not free) reused across the bönetider/moskeer pages, which
// each previously declared their own identical `nf0`. Swedish locale gives the
// space-grouped thousands ("4 102") the design calls for.

/** Integer — no decimals (populations, densities, counts). */
export const nf0 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

/** One decimal (areas, solar-depression degrees). */
export const nf1 = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 });

const TALORD = [
	"noll",
	"en",
	"två",
	"tre",
	"fyra",
	"fem",
	"sex",
	"sju",
	"åtta",
	"nio",
	"tio",
	"elva",
	"tolv",
];

/** A count as running text writes it: words up to twelve, digits above — the rule
 *  Språkrådet and Myndigheternas skrivregler give, and the one DN keeps. »4
 *  registrerade moskéer« in a sentence read as a table cell. `ett` for a neuter noun
 *  (»ett avsnitt«). Tables, labels and counters keep their digits; this is for prose. */
export function talord(n: number, genus: "utrum" | "neutrum" = "utrum"): string {
	if (!Number.isInteger(n) || n < 0 || n > 12) return nf0.format(n);
	if (n === 1) return genus === "neutrum" ? "ett" : "en";
	return TALORD[n] as string;
}

/** Swedish genitive of a place name. A name ending in s, x or z takes no extra s:
 *  »Borås breddgrad«, »Västerås stadsdelar« — the template's naive `${name}s` printed
 *  »Boråss« and »Västeråss« on every such page. */
export function genitive(name: string): string {
	return /[sxz]$/i.test(name) ? name : `${name}s`;
}

/** »Stockholms kommun«, »Malmö kommun«, »Borås kommun«: the official form adds a
 *  genitive s only after a consonant other than s, x or z. The template's
 *  `${kommun} kommun` printed »Stockholm kommun«. */
export function kommunLabel(kommun: string): string {
	return /[aeiouyåäö]$/i.test(kommun) ? `${kommun} kommun` : `${genitive(kommun)} kommun`;
}

/** Straight double quotes → Swedish »…«, pairwise.
 *
 *  A frontmatter string never passes through smartypants — remark-smartypants runs on
 *  markdown bodies only (astro.config.ts) — so a quotation typed in an essay's
 *  `description` reached the front page, the essay's standfirst, the share card and
 *  the RSS feed as ASCII: »Selma Lagerlöfs Jerusalem, "Vi Ingemarer…"« on the one
 *  paragraph every visitor reads. Only balanced pairs on one line are converted; an
 *  odd quote out is left as typed rather than guessed at. Apostrophes are untouched.
 *  The essay publisher applies the same rule (packages/orchestrator,
 *  article-publisher.ts), so this is the guard for descriptions edited by hand. */
export function swedishQuotes(text: string): string {
	return text.replace(/"([^"\n]*)"/g, "»$1«");
}

/** Words that end in a full stop without ending a sentence. Lower-cased, without the
 *  final stop. A single letter (an initial, »f.« in »f. Kr.«) is caught separately. */
const ABBREVIATIONS = new Set([
	"t.ex",
	"bl.a",
	"d.v.s",
	"dvs",
	"s.k",
	"m.fl",
	"o.s.v",
	"osv",
	"f.d",
	"ca",
	"kap",
	"nr",
	"jfr",
	"resp",
	"f.kr",
	"e.kr",
	"d.ä",
	"d.y",
	"s",
	"st",
	"sid",
	"vol",
	"uppl",
]);

/** As many WHOLE sentences from the start of `text` as fit in `max` characters — and
 *  always the first, however long, because a deck cut mid-sentence and closed with »…«
 *  reads as breakage (user review, 2026-09-25). For lists where decks sit side by side:
 *  the full description ran them to uneven heights, a line clamp cut them off unread,
 *  and the first sentence of an essay's deck is its claim.
 *
 *  A sentence ends at . ! or ? (after any closing »«"')] ), before whitespace and a
 *  capital or an opening quote — not after an abbreviation or an initial. Markdown
 *  emphasis (*…*) is left as written for inlineMarkdown(). */
export function leadSentences(text: string, max: number): string {
	const source = text.trim();
	if (source.length <= max) return source;
	const boundary = /[.!?][»«"')\]]*(?=\s+[*_]*[»"(A-ZÅÄÖÉÜ0-9])/g;
	const ends: number[] = [];
	for (let m = boundary.exec(source); m; m = boundary.exec(source)) {
		const before = source.slice(0, m.index).split(/\s/).at(-1) ?? "";
		const word = before.replace(/^[»"(*_]+/, "").toLowerCase();
		if (m[0][0] === "." && (ABBREVIATIONS.has(word) || /^\p{L}$/u.test(word))) continue;
		ends.push(m.index + m[0].length);
	}
	let cut = ends.find(() => true) ?? source.length;
	for (const end of ends) {
		if (end > max) break;
		cut = end;
	}
	return source.slice(0, cut).trim();
}
