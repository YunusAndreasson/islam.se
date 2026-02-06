#!/usr/bin/env node

/**
 * MCP Server for Quote Database
 *
 * Exposes quote search tools so Claude can search intelligently
 * based on the specific angle it's developing.
 */

import {
	type FormattedQuoteWithId,
	findQuotesByFilter,
	findQuotesLocal,
	generateLocalEmbedding,
	getCategories,
	getInventory,
	initBookDatabase,
	initQuranDatabase,
	preloadLocalModel,
	// Book search
	searchPassages,
	searchQuotesText,
	// Quran search
	searchVersesSemantic,
} from "@islam-se/quotes";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

// Preload embedding model at startup (don't block server start)
preloadLocalModel().catch(console.error);

// Initialize book and quran databases (synchronous)
try {
	initBookDatabase();
	initQuranDatabase();
} catch (e) {
	console.error("Failed to initialize databases:", e);
}

const server = new McpServer({
	name: "quote-database",
	version: "1.0.0",
});

// Helper to format quotes for output
function formatQuotes(quotes: FormattedQuoteWithId[]): string {
	if (quotes.length === 0) {
		return "No quotes found matching your criteria.";
	}

	return quotes
		.map((q, i) => {
			return `[${i + 1}] ID: ${q.id}
"${q.text}"
${q.attribution}
Category: ${q.category}`;
		})
		.join("\n\n");
}

// Tool 1: Semantic search - finds quotes by meaning
server.registerTool(
	"search_quotes",
	{
		title: "Semantic Quote Search",
		description: `Search quotes by meaning using AI embeddings. Best for finding quotes about concepts, themes, or ideas.

Examples:
- "patience in adversity" → finds quotes about sabr, endurance, trials
- "death and mortality" → finds quotes about death, afterlife, impermanence
- "knowledge and wisdom" → finds quotes about ilm, learning, understanding

Tips:
- Use descriptive phrases, not single words
- Combine concepts for more specific results
- Works across all languages (Swedish, Arabic, English)`,
		inputSchema: {
			query: z
				.string()
				.describe(
					'Descriptive search query (e.g., "patience during hardship", "the nature of the soul")',
				),
			language: z
				.enum(["sv", "ar", "en"])
				.optional()
				.describe("Filter by language: sv=Swedish, ar=Arabic, en=English/Norse"),
			limit: z
				.number()
				.min(1)
				.max(20)
				.optional()
				.describe("Number of results (default: 5, max: 20)"),
		},
	},
	async ({ query, language, limit }) => {
		const quotes = await findQuotesLocal(query, {
			limit: limit ?? 15,
			language,
			minStandalone: 3,
			diverse: true,
		});

		const output = formatQuotes(quotes);
		return {
			content: [{ type: "text", text: output }],
		};
	},
);

// Tool 2: Filter search - finds quotes by author, category, etc.
server.registerTool(
	"search_by_filter",
	{
		title: "Filter Quote Search",
		description: `Search quotes by specific criteria like author, category, or language.

Available categories (top ones):
- زهد (asceticism), صبر (patience), توبة (repentance), تقوى (God-consciousness)
- علم (knowledge), أخلاق (ethics), قلب (heart), نفس (soul)
- Swedish categories vary by work

Top authors by quote count:
- Arabic: Ibn al-Jawzi, Ibn Qayyim, al-Suyuti, Ibn Taymiyyah, al-Nawawi, al-Ghazali
- Swedish: Strindberg, Ellen Key, Viktor Rydberg, Selma Lagerlöf, Fredrika Bremer
- Norse: Sæmundur fróði, Snorri Sturluson, Hávamál`,
		inputSchema: {
			author: z.string().optional().describe("Author name (partial match works)"),
			category: z.string().optional().describe('Category/theme (e.g., "صبر", "توبة")'),
			language: z.enum(["sv", "ar", "en"]).optional().describe("Filter by language"),
			limit: z.number().min(1).max(20).optional().describe("Number of results (default: 10)"),
		},
	},
	async ({ author, category, language, limit }) => {
		const quotes = findQuotesByFilter({
			author,
			category,
			language,
			limit: limit ?? 10,
			minStandalone: 3,
		});

		const output = formatQuotes(quotes);
		return {
			content: [{ type: "text", text: output }],
		};
	},
);

// Tool 3: Text search - finds quotes containing specific words
server.registerTool(
	"search_text",
	{
		title: "Text Search",
		description: `Search for quotes containing specific words or phrases. Use this when you need exact term matches.

Examples:
- "tålamod" → Swedish quotes containing the word patience
- "الصبر" → Arabic quotes with the word patience
- "Strindberg" → quotes by or mentioning Strindberg

Note: This is literal text matching, not semantic. For meaning-based search, use search_quotes instead.`,
		inputSchema: {
			query: z
				.string()
				.describe("Text to search for (matches in quote text, author, work title, keywords)"),
			language: z.enum(["sv", "ar", "en"]).optional().describe("Filter by language"),
			limit: z.number().min(1).max(20).optional().describe("Number of results (default: 10)"),
		},
	},
	async ({ query, language, limit }) => {
		const quotes = searchQuotesText(query, {
			language,
			limit: limit ?? 10,
			minStandalone: 3,
		});

		const output = formatQuotes(quotes);
		return {
			content: [{ type: "text", text: output }],
		};
	},
);

// Tool 4: Get database inventory/stats
server.registerTool(
	"get_inventory",
	{
		title: "Database Inventory",
		description:
			"Get an overview of what quotes are available in the database. Shows total counts, top categories, top authors, and language distribution. Use this first to understand what you can search for.",
		inputSchema: {},
	},
	async () => {
		const inventory = getInventory();
		const categories = getCategories();

		const output = `# Quote Database Inventory

## Overview
- Total quotes: ${inventory.total.toLocaleString()}
- High quality (standalone ≥4): ${inventory.quality.standalone4Plus.toLocaleString()}

## Languages
- Swedish: ${inventory.languages.sv.toLocaleString()}
- Arabic: ${inventory.languages.ar.toLocaleString()}
- English/Norse: ${inventory.languages.en.toLocaleString()}

## Top Categories (${categories.length} total)
${categories
	.slice(0, 15)
	.map((c) => `- ${c.category}: ${c.count}`)
	.join("\n")}

## Top Authors
${inventory.authors
	.slice(0, 20)
	.map((a) => `- ${a.name}: ${a.count}`)
	.join("\n")}

## Tips
- Use search_quotes for semantic/meaning-based search
- Use search_by_filter for author/category filtering
- Use search_text for exact word matching`;

		return {
			content: [{ type: "text", text: output }],
		};
	},
);

// Tool 5: Bulk search - multiple queries in parallel
server.registerTool(
	"bulk_search",
	{
		title: "Bulk Semantic Search",
		description: `Run multiple semantic searches in parallel. Much faster than calling search_quotes multiple times.

Example: bulk_search(["patience adversity", "death mortality", "knowledge wisdom"])

Returns results grouped by query. Use this when you need quotes from multiple themes.`,
		inputSchema: {
			queries: z.array(z.string()).min(1).max(5).describe("Array of search queries (1-5 queries)"),
			limit_per_query: z
				.number()
				.min(1)
				.max(15)
				.optional()
				.describe("Results per query (default: 10)"),
		},
	},
	async ({ queries, limit_per_query }) => {
		const limit = limit_per_query ?? 10;

		// Run all searches in parallel
		const results = await Promise.all(
			queries.map(async (query) => {
				const quotes = await findQuotesLocal(query, {
					limit,
					minStandalone: 3,
					diverse: true,
				});
				return { query, quotes };
			}),
		);

		// Format output grouped by query
		const output = results
			.map(({ query, quotes }) => {
				return `## "${query}" (${quotes.length} results)\n\n${formatQuotes(quotes)}`;
			})
			.join("\n\n---\n\n");

		return {
			content: [{ type: "text", text: output }],
		};
	},
);

// Tool 6: Book passage search - finds relevant passages from full books
server.registerTool(
	"search_books",
	{
		title: "Book Passage Search",
		description: `Search for relevant passages from the book database (107k+ passages from 136 books).

The book database contains full texts from:
- Swedish literature (Strindberg, Lagerlöf, Key, Bremer, etc.)
- Arabic Islamic classics (Ibn Qayyim, al-Ghazali, Ibn Taymiyyah, etc.)

Use this for:
- Finding extended context around a theme
- Discovering passages that support your article's argument
- Getting richer material than short quotes

Examples:
- "the nature of the soul and its purification" → finds relevant passages from Islamic psychology texts
- "death and meaning in Swedish literature" → finds passages from Swedish authors on mortality`,
		inputSchema: {
			query: z
				.string()
				.describe('Descriptive search query (e.g., "spiritual struggle against the ego")'),
			language: z
				.enum(["sv", "ar"])
				.optional()
				.describe("Filter by language: sv=Swedish, ar=Arabic"),
			limit: z
				.number()
				.min(1)
				.max(10)
				.optional()
				.describe("Number of results (default: 5, max: 10)"),
		},
	},
	async ({ query, language, limit }) => {
		const passages = await searchPassages(query, {
			limit: limit ?? 5,
			language,
		});

		if (passages.length === 0) {
			return {
				content: [{ type: "text", text: "No book passages found matching your query." }],
			};
		}

		const output = passages
			.map((p, i) => {
				return `[${i + 1}] ID: ${p.id}
Book: ${p.bookTitle} by ${p.bookAuthor}
Chapter: ${p.chapterTitle || "N/A"}

"${p.text.slice(0, 500)}${p.text.length > 500 ? "..." : ""}"

Score: ${p.score.toFixed(3)}`;
			})
			.join("\n\n---\n\n");

		return {
			content: [{ type: "text", text: output }],
		};
	},
);

// Tool 7: Quran verse search - finds relevant Quran verses
server.registerTool(
	"search_quran",
	{
		title: "Quran Verse Search",
		description: `Search for relevant Quran verses by meaning.

Use this to find Quranic support for themes in your article. Returns verses with Swedish translation.

Examples:
- "patience and perseverance" → finds verses about sabr
- "knowledge and wisdom" → finds verses about ilm
- "death and resurrection" → finds verses about akhira`,
		inputSchema: {
			query: z.string().describe('Theme to search for (e.g., "gratitude and thankfulness")'),
			limit: z
				.number()
				.min(1)
				.max(10)
				.optional()
				.describe("Number of results (default: 5, max: 10)"),
		},
	},
	async ({ query, limit }) => {
		// Generate embedding for the query
		const embedding = await generateLocalEmbedding(query);
		const verses = searchVersesSemantic(embedding, limit ?? 5);

		if (verses.length === 0) {
			return {
				content: [{ type: "text", text: "No Quran verses found matching your query." }],
			};
		}

		const output = verses
			.map((v, i) => {
				return `[${i + 1}] ${v.surahNameSwedish} ${v.surahNumber}:${v.verseNumber}

Arabic: ${v.textArabic}
Swedish: ${v.textSwedish}

Score: ${(1 - v.score).toFixed(3)}`;
			})
			.join("\n\n---\n\n");

		return {
			content: [{ type: "text", text: output }],
		};
	},
);

// Tool 8: Fetch Wikipedia article content via API (bypasses bot blocking)
server.registerTool(
	"fetch_wikipedia",
	{
		title: "Fetch Wikipedia Article",
		description: `Fetch content from a Wikipedia article URL. Uses Wikipedia's REST API to bypass bot blocking.

Accepts any Wikipedia URL like:
- https://en.wikipedia.org/wiki/Ibn_Khaldun
- https://sv.wikipedia.org/wiki/Koranen
- https://ar.wikipedia.org/wiki/ابن_خلدون

Returns the article summary and optionally full content for fact-checking.`,
		inputSchema: {
			url: z.string().describe("Wikipedia article URL (any language)"),
			full: z
				.boolean()
				.optional()
				.describe("Get full article text instead of summary (default: false)"),
		},
	},
	async ({ url, full }) => {
		try {
			// Parse Wikipedia URL to extract language and title
			const match = url.match(/https?:\/\/([a-z]{2,3})\.wikipedia\.org\/wiki\/(.+?)(?:#.*)?$/);
			if (!match) {
				return {
					content: [
						{
							type: "text",
							text: `Invalid Wikipedia URL: ${url}\nExpected format: https://{lang}.wikipedia.org/wiki/{title}`,
						},
					],
				};
			}

			const [, lang, rawTitle] = match;
			const title = decodeURIComponent(rawTitle);

			if (full) {
				// Use MediaWiki API for full text
				const apiUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&format=json`;
				const response = await fetch(apiUrl, {
					headers: { "User-Agent": "IslamSE/1.0 (https://islam.se)" },
				});

				if (!response.ok) {
					return {
						content: [
							{
								type: "text",
								text: `Wikipedia API error: ${response.status} ${response.statusText}`,
							},
						],
					};
				}

				const data = (await response.json()) as {
					query: {
						pages: Record<string, { title: string; extract?: string }>;
					};
				};
				const pages = data.query.pages;
				const page = Object.values(pages)[0];

				if (!page?.extract) {
					return {
						content: [{ type: "text", text: `No content found for: ${title}` }],
					};
				}

				// Truncate to ~8000 chars to avoid overwhelming context
				const extract =
					page.extract.length > 8000
						? `${page.extract.slice(0, 8000)}\n\n[Truncated — full article is ${page.extract.length} chars]`
						: page.extract;

				return {
					content: [
						{
							type: "text",
							text: `# ${page.title}\nSource: ${url}\n\n${extract}`,
						},
					],
				};
			}

			// Default: summary endpoint (fast, concise)
			const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
			const response = await fetch(apiUrl, {
				headers: { "User-Agent": "IslamSE/1.0 (https://islam.se)" },
			});

			if (!response.ok) {
				return {
					content: [
						{
							type: "text",
							text: `Wikipedia API error: ${response.status} ${response.statusText}`,
						},
					],
				};
			}

			const data = (await response.json()) as {
				title: string;
				description?: string;
				extract: string;
			};

			const output = [
				`# ${data.title}`,
				`Source: ${url}`,
				data.description ? `Description: ${data.description}` : "",
				"",
				data.extract,
			]
				.filter(Boolean)
				.join("\n");

			return {
				content: [{ type: "text", text: output }],
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			return {
				content: [
					{
						type: "text",
						text: `Failed to fetch Wikipedia article: ${message}`,
					},
				],
			};
		}
	},
);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
