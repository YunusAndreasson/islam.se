import { getCollection } from "astro:content";

// The corpus cites the Quran in a uniform footnote form — "Koranen, <surah> N:N"
// (a few use "sura <surah> N:N"). This parser derives an essay→verse index from
// the footnote definitions alone: pure derivation from content already in the
// essays, no authored link data (plan §11, citation index).
const QURAN_FOOTNOTE = /\[\^[^\]]+\]:\s*(?:Koranen,\s*|sura\s+)[^0-9\n]*?(\d{1,3}):(\d{1,3})/g;

export interface VerseCitation {
	ayahKey: string;
	slug: string;
	publishedAt: string;
}

let indexPromise: Promise<Map<string, VerseCitation[]>> | null = null;

async function build(): Promise<Map<string, VerseCitation[]>> {
	const entries = await getCollection("articles");
	const map = new Map<string, VerseCitation[]>();

	for (const entry of entries) {
		const body = (entry as { body?: string }).body ?? "";
		const seen = new Set<string>(); // count each verse at most once per essay
		for (const m of body.matchAll(QURAN_FOOTNOTE)) {
			const key = `${m[1]}:${m[2]}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const arr = map.get(key) ?? [];
			arr.push({ ayahKey: key, slug: entry.id, publishedAt: entry.data.publishedAt });
			map.set(key, arr);
		}
	}

	// Order citers most-recent-first so derivation points the daily verse at the
	// freshest essay that engages it.
	for (const arr of map.values()) {
		arr.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
	}

	return map;
}

export function getCitationIndex(): Promise<Map<string, VerseCitation[]>> {
	if (!indexPromise) indexPromise = build();
	return indexPromise;
}

/** Essays that cite the given ayah, most-recent first. */
export async function essaysCiting(ayahKey: string): Promise<VerseCitation[]> {
	return (await getCitationIndex()).get(ayahKey) ?? [];
}

/**
 * Inverse of the citation index: each essay slug → the set of ayah keys it cites
 * in its footnotes. Lets the related-essay scorer treat a shared Quran citation
 * as a thematic link, derived purely from the essays' own footnotes.
 */
export async function getVersesByEssay(): Promise<Map<string, Set<string>>> {
	const index = await getCitationIndex();
	const byEssay = new Map<string, Set<string>>();
	for (const [ayahKey, citers] of index) {
		for (const { slug } of citers) {
			const set = byEssay.get(slug) ?? new Set<string>();
			set.add(ayahKey);
			byEssay.set(slug, set);
		}
	}
	return byEssay;
}
