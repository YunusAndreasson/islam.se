import { closeEnough, fold, foldedWords } from "./search-text";

export type PaletteType = "Sida" | "Svar" | "Ort" | "Ämne" | "Tråd" | "Tänkare" | "Essä";

export interface PaletteEntry {
	type: PaletteType;
	/** What the reader matches against and what the row/chip shows. */
	label: string;
	/** A one-line gloss — framing prose or the essay lead; also searched. */
	sub: string;
	/** A cornerstone answer. Breaks score ties toward the canonical page, so
	    "ramadan" opens "Vad är ramadan?" and not "Måste gravida fasta?". */
	core?: true;
	/** Extra wording matched but never shown. Answer pages carry the question in
	    the reader's own words here, so typing the query the page was written for
	    ("får muslimer dricka alkohol") finds it even when the title is phrased
	    differently. */
	alt?: string;
	href: string;
	/** Tänkare only: which tradition the thinker belongs to, so the palette can
	    list the classical Islamic scholars apart from the Swedish/Western voices
	    instead of interleaving the two — the same division the /tankare directory
	    draws. */
	group?: "sunni" | "western";
}

// Results render in sections, not raw types: Tänkare splits into its two
// traditions so the classical Islamic scholars never interleave with the
// Swedish/Western voices (the same division the /tankare directory draws).
// Each section is one heading + the entries it claims.
const SECTIONS: readonly {
	heading: string;
	type: PaletteType;
	group?: PaletteEntry["group"];
	limit?: number;
}[] = [
	{ heading: "Sidor", type: "Sida" },
	{ heading: "Frågor & svar", type: "Svar", limit: 8 },
	{ heading: "Bönetider", type: "Ort" },
	{ heading: "Ämnen", type: "Ämne" },
	{ heading: "Trådar", type: "Tråd" },
	{ heading: "Den klassiska islamiska traditionen", type: "Tänkare", group: "sunni" },
	{ heading: "Svenska och västerländska röster", type: "Tänkare", group: "western" },
	{ heading: "Essäer", type: "Essä", limit: 8 },
];

interface PreparedEntry {
	entry: PaletteEntry;
	label: string;
	sub: string;
	alt: string;
	text: string;
	words: string[];
}

function score(prepared: PreparedEntry, q: string): number {
	const { entry: e, label, sub, alt } = prepared;
	let base = 0;
	if (label === q) base = 1000;
	else if (label.startsWith(q)) base = 700;
	else if (label.includes(` ${q}`))
		base = 500; // start of a later word
	else if (label.includes(q)) base = 300;
	else if (e.alt && alt === q)
		base = 700; // a locality's bare name
	else if (sub.includes(q)) base = 120;
	else if (e.alt && alt.includes(q)) base = 110;
	if (!base) return 0;
	// Sub-point tiebreaks only separate entries that are otherwise dead level. "ramadan" hit both
	// "Vad är ramadan?" and "Måste gravida fasta under ramadan?" at the same
	// word-start score, and the broader page lost on array order alone.
	const cornerstone = e.core ? 0.5 : 0;
	// Shorter titles are the more canonical page for a bare-noun query.
	const brevity = Math.max(0, 60 - e.label.length) / 1000;
	return base + cornerstone + brevity;
}

/** Prepare immutable index text once, rather than normalize every field on each keystroke. */
export function createPaletteSearch(entries: readonly PaletteEntry[]) {
	const prepared: PreparedEntry[] = entries.map((entry) => ({
		entry,
		label: fold(entry.label),
		sub: fold(entry.sub),
		alt: fold(entry.alt ?? ""),
		text: fold(`${entry.label} ${entry.sub} ${entry.alt ?? ""}`),
		words: foldedWords(`${entry.label} ${entry.sub} ${entry.alt ?? ""}`),
	}));
	// Partition once too: results are ordered by section, so cross-section sorting
	// and type score bonuses cannot affect the displayed ranking.
	const sections = SECTIONS.map((section) => ({
		...section,
		prepared: prepared.filter(
			({ entry }) =>
				entry.type === section.type && (!section.group || entry.group === section.group),
		),
	}));
	return (
		query: string,
		expanded = false,
	): { heading: string; entries: PaletteEntry[]; total: number; loose: boolean }[] => {
		const q = fold(query.trim());
		if (!q) return [];
		const tokens = fold(query)
			.split(/[^\p{L}\p{N}]+/u)
			.filter(Boolean);
		if (!tokens.length) return [];
		const exact = (e: PreparedEntry) => tokens.every((token) => e.text.includes(token));
		const loose = !prepared.some(exact);
		return sections.flatMap((section) => {
			const list = section.prepared
				.filter((e) =>
					loose
						? tokens.every(
								(token) =>
									e.text.includes(token) || e.words.some((word) => closeEnough(token, word)),
							)
						: exact(e),
				)
				.map((e) => ({ e: e.entry, s: score(e, q) || 50 }))
				.filter((h) => h.s > 0)
				.sort((a, b) => b.s - a.s)
				.map((h) => h.e);
			return list.length
				? [
						{
							heading: section.heading,
							entries: expanded ? list : list.slice(0, section.limit),
							total: list.length,
							loose,
						},
					]
				: [];
		});
	};
}
