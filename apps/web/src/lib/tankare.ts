import { getCollection } from "astro:content";
import { type Article, getArticles } from "./articles";

// Tänkare — the recurring interlocutors. Membership is DERIVED from the corpus:
// each thinker's `match` terms (the distinctive spelling of the name, diacritics
// included) are searched, case-insensitively, against every essay body. An essay
// that contains one is engaging that thinker. Framing prose is authored in
// tankare.json (§13.7); nothing about who-appears-where is hand-maintained, so
// the lists track the corpus automatically as essays come and go.

export type Tradition = "sunni" | "western";

export interface Tankare {
	name: string;
	slug: string;
	tradition: Tradition;
	framing: string;
	/** Authoritative external identities (Wikipedia/Wikidata) → schema.org sameAs. */
	sameAs?: string[];
	/** Essays engaging this thinker, in the feed's date order (newest first). */
	essays: Article[];
}

let cache: Promise<Tankare[]> | null = null;

async function build(): Promise<Tankare[]> {
	const [entries, articles] = await Promise.all([getCollection("tankare"), getArticles()]);

	// Lowercase each body once; getArticles already returns newest-first, so the
	// filtered slices inherit that order.
	const bodies = articles.map((a) => ({
		article: a,
		body: ((a.entry as { body?: string }).body ?? "").toLowerCase(),
	}));

	return entries.map((entry) => {
		const terms = entry.data.match.map((m) => m.toLowerCase());
		const essays = bodies
			.filter(({ body }) => terms.some((t) => body.includes(t)))
			.map(({ article }) => article);

		// A thinker that matches nothing means the spelling drifted (an essay was
		// renamed, or the term has a typo) — fail loudly rather than ship an empty
		// directory page and a dead homepage row.
		if (essays.length === 0) {
			throw new Error(
				`Tänkare "${entry.data.slug}" matches no essay — check the \`match\` terms [${entry.data.match.join(", ")}] in tankare.json.`,
			);
		}

		return {
			name: entry.data.name,
			slug: entry.data.slug,
			tradition: entry.data.tradition,
			framing: entry.data.framing,
			sameAs: entry.data.sameAs,
			essays,
		};
	});
}

/** All tänkare with their derived essay lists. Memoized for the build. */
export function getTankare(): Promise<Tankare[]> {
	if (!cache) cache = build();
	return cache;
}

/** The thinkers a given essay engages, in directory order. */
export async function tankareForEssay(slug: string): Promise<Tankare[]> {
	return (await getTankare()).filter((t) => t.essays.some((e) => e.slug === slug));
}
