/**
 * Quote Service - Integrates the quote database with the orchestrator.
 * Pre-fetches quotes for research stage and provides them to Claude.
 */

import {
	type FormattedQuoteWithId,
	findQuotesByFilter,
	findQuotesLocal,
	findQuotesPaired,
	getCategories,
	getInventory,
	type Inventory,
	searchQuotesText,
} from "@islam-se/quotes";

export interface QuoteSearchResult {
	inventory: Inventory;
	semanticMatches: FormattedQuoteWithId[];
	pairedQuotes: { swedish: FormattedQuoteWithId[]; arabic: FormattedQuoteWithId[] };
	categoryMatches: FormattedQuoteWithId[];
	textMatches: FormattedQuoteWithId[];
}

export interface QuoteSearchOptions {
	topic: string;
	includeArabic?: boolean;
	semanticLimit?: number;
	pairedLimit?: number;
	categoryLimit?: number;
	textLimit?: number;
	minStandalone?: number;
}

/**
 * Performs comprehensive quote search using multiple strategies.
 * Returns quotes ready to be included in Claude prompts.
 */
export async function searchQuotesComprehensive(
	options: QuoteSearchOptions,
): Promise<QuoteSearchResult> {
	const {
		topic,
		includeArabic = true,
		semanticLimit = 15,
		pairedLimit = 5,
		categoryLimit = 10,
		textLimit = 5,
		minStandalone = 4,
	} = options;

	// 1. Get inventory to understand what's available
	const inventory = getInventory();

	// 2. Run semantic search and paired quotes in parallel (both are async)
	const [semanticMatches, pairedQuotes] = await Promise.all([
		findQuotesLocal(topic, {
			limit: semanticLimit,
			minStandalone,
			diverse: true,
		}),
		includeArabic
			? findQuotesPaired(topic, {
					limitPerLanguage: pairedLimit,
					minStandalone,
				})
			: Promise.resolve({
					swedish: [] as FormattedQuoteWithId[],
					arabic: [] as FormattedQuoteWithId[],
				}),
	]);

	// 4. Find relevant categories and get category-based quotes
	const categories = getCategories();
	const topicWords = topic.toLowerCase().split(/\s+/);

	// Find matching categories
	const matchingCategories = categories.filter((cat) =>
		topicWords.some(
			(word) =>
				cat.category.toLowerCase().includes(word) || word.includes(cat.category.toLowerCase()),
		),
	);

	// Get quotes from matching categories
	let categoryMatches: FormattedQuoteWithId[] = [];
	if (matchingCategories.length > 0) {
		const topCategory = matchingCategories[0];
		if (topCategory) {
			categoryMatches = findQuotesByFilter({
				category: topCategory.category,
				minStandalone,
				limit: categoryLimit,
			});
		}
	}

	// 5. Text search fallback
	const textMatches = searchQuotesText(topic, {
		minStandalone,
		limit: textLimit,
	});

	return {
		inventory,
		semanticMatches,
		pairedQuotes,
		categoryMatches,
		textMatches,
	};
}

/**
 * Formats quotes for inclusion in Claude prompts.
 * Creates a concise, readable format that Claude can easily parse.
 */
export function formatQuotesForPrompt(result: QuoteSearchResult): string {
	const sections: string[] = [];

	// Inventory summary
	sections.push(`## Quote Database Inventory
Total quotes: ${result.inventory.total}
Languages: Swedish (${result.inventory.languages.sv}), Arabic (${result.inventory.languages.ar}), English (${result.inventory.languages.en})
High quality (standalone ≥4): ${result.inventory.quality.standalone4Plus}

Top categories: ${result.inventory.categories
		.slice(0, 10)
		.map((c) => `${c.name} (${c.count})`)
		.join(", ")}
`);

	// Semantic matches
	if (result.semanticMatches.length > 0) {
		sections.push(`## Semantic Matches (${result.semanticMatches.length} quotes)
${formatQuoteList(result.semanticMatches)}
`);
	}

	// Paired quotes
	if (result.pairedQuotes.swedish.length > 0 || result.pairedQuotes.arabic.length > 0) {
		sections.push(`## Swedish + Arabic Pairs

### Swedish Quotes (${result.pairedQuotes.swedish.length})
${formatQuoteList(result.pairedQuotes.swedish)}

### Arabic Quotes (${result.pairedQuotes.arabic.length})
${formatQuoteList(result.pairedQuotes.arabic)}
`);
	}

	// Category matches (only if different from semantic)
	const uniqueCategoryMatches = result.categoryMatches.filter(
		(cq) => !result.semanticMatches.some((sq) => sq.id === cq.id),
	);
	if (uniqueCategoryMatches.length > 0) {
		sections.push(`## Category-Based Matches (${uniqueCategoryMatches.length} additional quotes)
${formatQuoteList(uniqueCategoryMatches)}
`);
	}

	// Text matches (only if unique)
	const allIds = new Set([
		...result.semanticMatches.map((q) => q.id),
		...result.pairedQuotes.swedish.map((q) => q.id),
		...result.pairedQuotes.arabic.map((q) => q.id),
		...result.categoryMatches.map((q) => q.id),
	]);
	const uniqueTextMatches = result.textMatches.filter((q) => !allIds.has(q.id));
	if (uniqueTextMatches.length > 0) {
		sections.push(`## Text Search Matches (${uniqueTextMatches.length} additional quotes)
${formatQuoteList(uniqueTextMatches)}
`);
	}

	return sections.join("\n");
}

/**
 * Formats a list of quotes for prompt inclusion.
 */
function formatQuoteList(quotes: FormattedQuoteWithId[]): string {
	return quotes
		.map(
			(q, i) => `
### Quote ${i + 1} [ID: ${q.id}]
**Text:** "${q.text}"
**Attribution:** ${q.attribution}
**Language:** ${q.language} | **Category:** ${q.category} | **Tone:** ${q.tone}
**Quality:** ${q.standalone}/5 | **Relevance:** ${(q.score * 100).toFixed(0)}%
**Keywords:** ${q.keywords.join(", ") || "none"}
`,
		)
		.join("");
}

/**
 * Converts quote search results to JSON format for the research output.
 */
export function quotesToResearchFormat(result: QuoteSearchResult): Array<{
	id: string;
	text: string;
	author: string;
	source?: string;
	language: "swedish" | "arabic" | "norse" | "english";
	relevance: string;
	standaloneScore?: number;
}> {
	// Combine all unique quotes
	const allQuotes = new Map<number, FormattedQuoteWithId>();

	// Add in order of priority (semantic first, then paired, then category, then text)
	for (const q of result.semanticMatches) {
		allQuotes.set(q.id, q);
	}
	for (const q of result.pairedQuotes.swedish) {
		if (!allQuotes.has(q.id)) allQuotes.set(q.id, q);
	}
	for (const q of result.pairedQuotes.arabic) {
		if (!allQuotes.has(q.id)) allQuotes.set(q.id, q);
	}
	for (const q of result.categoryMatches) {
		if (!allQuotes.has(q.id)) allQuotes.set(q.id, q);
	}
	for (const q of result.textMatches) {
		if (!allQuotes.has(q.id)) allQuotes.set(q.id, q);
	}

	// Convert to research format
	return Array.from(allQuotes.values()).map((q) => {
		// Extract author and work from attribution
		const parts = q.attribution.replace(/^—\s*/, "").split(/[,،]/);
		const author = parts[0]?.trim() || "Unknown";
		const work = parts[1]?.trim();

		// Map language codes
		const languageMap: Record<string, "swedish" | "arabic" | "norse" | "english"> = {
			sv: "swedish",
			ar: "arabic",
			en: "english",
		};

		return {
			id: `quote-${q.id}`,
			text: q.text,
			author,
			source: work,
			language: languageMap[q.language] || "swedish",
			relevance: `Score: ${(q.score * 100).toFixed(0)}%, Category: ${q.category}, Tone: ${q.tone}`,
			standaloneScore: q.standalone,
		};
	});
}
