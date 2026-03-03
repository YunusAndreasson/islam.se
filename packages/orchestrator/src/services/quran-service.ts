/**
 * Quran Service - Integrates the Quran database with the orchestrator.
 * Pre-fetches Quran verses for pipeline stages and provides them to Claude.
 *
 * All searches use local embeddings = FREE (no API cost).
 */

import {
	generateLocalEmbedding,
	getQuranStats,
	type QuranStats,
	searchVersesSemantic,
	type VerseWithScore,
} from "@islam-se/quotes";

interface QuranSearchResult {
	stats: QuranStats;
	verses: VerseWithScore[];
}

interface QuranSearchOptions {
	/** Multiple search queries to run in parallel */
	queries: string[];
	/** Maximum verses to return after deduplication (default: 10) */
	limit?: number;
	/** Minimum similarity score (default: 0.3) */
	minScore?: number;
}

/**
 * Performs comprehensive Quran search using multiple queries in parallel.
 * Generates local embeddings, runs semantic search, deduplicates by verse ID.
 *
 * All searches use local embeddings = FREE.
 */
export async function searchQuranComprehensive(
	options: QuranSearchOptions,
): Promise<QuranSearchResult> {
	const { queries, limit = 10, minScore = 0.3 } = options;

	const stats = getQuranStats();

	if (stats.totalVerses === 0) {
		return { stats, verses: [] };
	}

	// Generate embeddings for all queries in parallel
	const embeddings = await Promise.all(queries.map((q) => generateLocalEmbedding(q)));

	// Run semantic search for each embedding
	const allResults = embeddings.flatMap((embedding) =>
		searchVersesSemantic(embedding, limit, minScore),
	);

	// Deduplicate by verse ID, keeping highest score
	const bestByVerse = new Map<number, VerseWithScore>();
	for (const verse of allResults) {
		const existing = bestByVerse.get(verse.id);
		if (!existing || verse.score > existing.score) {
			bestByVerse.set(verse.id, verse);
		}
	}

	// Sort by score descending, take top N
	const verses = Array.from(bestByVerse.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);

	return { stats, verses };
}

/**
 * Formats Quran search results for inclusion in Claude prompts.
 */
export function formatQuranForPrompt(result: QuranSearchResult): string {
	const sections: string[] = [];

	sections.push(`## Quran Database
Total verses: ${result.stats.totalVerses}
Surahs: ${result.stats.surahs}
Translators: ${result.stats.translators.join(", ")}
`);

	if (result.verses.length > 0) {
		sections.push(`## Relevant Quran Verses (${result.verses.length} matches)

${result.verses
	.map(
		(v, i) =>
			`### Verse ${i + 1}: ${v.surahNameSwedish} ${v.surahNumber}:${v.verseNumber}
**Arabic:** ${v.textArabic || "—"}
**Swedish:** ${v.textSwedish}${v.commentary ? `\n**Commentary:** ${v.commentary}` : ""}
**Relevance:** ${(v.score * 100).toFixed(0)}%
`,
	)
	.join("")}
`);
	}

	return sections.join("\n");
}
