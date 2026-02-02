/**
 * Book Service - Integrates the book RAG database with the orchestrator.
 * Pre-fetches book passages for research stage and provides them to Claude.
 *
 * All searches use local embeddings = FREE (no API cost).
 */

import {
	type BookInventory,
	type ConceptMatch,
	getBookInventory,
	type PassageWithScore,
	searchBooks,
} from "@islam-se/quotes";

export interface BookSearchResult {
	inventory: BookInventory;
	passages: PassageWithScore[];
	concepts: ConceptMatch[];
	combined: PassageWithScore[];
}

export interface BookSearchOptions {
	topic: string;
	/** Maximum passages to return (default: 15) */
	passageLimit?: number;
	/** Maximum concept matches (default: 5) */
	conceptLimit?: number;
	/** Minimum similarity score (default: 0.35) */
	minScore?: number;
	/** Filter by language */
	language?: "sv" | "ar" | "en";
}

/**
 * Performs comprehensive book search using hybrid approach.
 * Returns passages ready to be included in Claude prompts.
 *
 * All searches use local embeddings = FREE.
 */
export async function searchBooksComprehensive(
	options: BookSearchOptions,
): Promise<BookSearchResult> {
	const { topic, passageLimit = 15, conceptLimit = 5, minScore = 0.35, language } = options;

	// Get inventory first (fast, no embedding needed)
	const inventory = getBookInventory();

	// Skip search if no books imported
	if (inventory.totalBooks === 0) {
		return {
			inventory,
			passages: [],
			concepts: [],
			combined: [],
		};
	}

	// Run hybrid search (all local embeddings = free)
	const hybridResult = await searchBooks(topic, {
		passageLimit,
		conceptLimit,
		minScore,
		language,
	});

	return {
		inventory,
		passages: hybridResult.passages,
		concepts: hybridResult.concepts,
		combined: hybridResult.combined,
	};
}

/**
 * Formats book passages for inclusion in Claude prompts.
 */
export function formatBooksForPrompt(result: BookSearchResult): string {
	const sections: string[] = [];

	// Inventory summary
	sections.push(`## Book Database Inventory
Total books: ${result.inventory.totalBooks}
Total passages: ${result.inventory.totalPassages}
Languages: ${Object.entries(result.inventory.byLanguage)
		.map(([lang, count]) => `${lang} (${count})`)
		.join(", ")}

Available books:
${result.inventory.books
	.slice(0, 10)
	.map((b) => `- "${b.title}" by ${b.author} (${b.passageCount} passages)`)
	.join("\n")}
`);

	// Concept matches (thematic relevance)
	if (result.concepts.length > 0) {
		sections.push(`## Relevant Themes from Books

${result.concepts
	.map(
		(c, i) =>
			`### Theme ${i + 1}: ${c.type === "book" ? c.bookTitle : `${c.bookTitle}, Chapter ${c.chapterNumber}`}
**Source:** ${c.bookAuthor}${c.chapterTitle ? `, "${c.chapterTitle}"` : ""}
**Summary:** ${c.summary}
**Key concepts:** ${c.keyConcepts.join(", ")}
**Relevance:** ${(c.score * 100).toFixed(0)}%
`,
	)
	.join("")}
`);
	}

	// Passage matches
	if (result.combined.length > 0) {
		sections.push(`## Relevant Passages (${result.combined.length} matches)

${result.combined
	.map(
		(p, i) =>
			`### Passage ${i + 1} [Book: ${p.bookTitle}]
**Source:** ${p.bookAuthor}${p.chapterTitle ? `, "${p.chapterTitle}"` : ""}${p.chapterNumber ? ` (Ch. ${p.chapterNumber})` : ""}
**Text:** "${p.text}"
**Relevance:** ${(p.score * 100).toFixed(0)}%
`,
	)
	.join("")}
`);
	}

	return sections.join("\n");
}

/**
 * Converts book search results to JSON format for the research output.
 */
export function passagesToResearchFormat(result: BookSearchResult): Array<{
	id: string;
	text: string;
	bookTitle: string;
	author: string;
	chapter?: string;
	pageRef?: string;
	relevanceScore: number;
}> {
	return result.combined.map((p) => ({
		id: `book-passage-${p.id}`,
		text: p.text,
		bookTitle: p.bookTitle,
		author: p.bookAuthor,
		chapter: p.chapterTitle ?? (p.chapterNumber ? `Chapter ${p.chapterNumber}` : undefined),
		pageRef: undefined, // Position-based refs could be added later
		relevanceScore: p.score,
	}));
}

/**
 * Check if the book database has any content.
 */
export function hasBookContent(): boolean {
	try {
		const inventory = getBookInventory();
		return inventory.totalBooks > 0;
	} catch {
		return false;
	}
}
