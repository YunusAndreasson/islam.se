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
	generateLocalEmbedding,
	getBookStats,
	getCategories,
	getInventory,
	getQuote,
	initBookDatabase,
	initQuranDatabase,
	preloadLocalModel,
	searchBookPassages,
	searchQuotesHybrid,
	searchQuotesText,
	searchVersesSemantic,
} from "@islam-se/quotes";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod";

// Preload embedding model at startup (don't block server start)
preloadLocalModel().catch(console.error);

// Initialize book and quran databases (synchronous)
let bookCounts = "";
try {
	initBookDatabase();
	initQuranDatabase();
	// Counted, not written into the description: it said "107k+ passages from 136 books"
	// long after the corpus had passed 290k passages and 182 books.
	const stats = getBookStats();
	bookCounts = ` (${stats.totalPassages.toLocaleString("en-US")} passages from ${stats.totalBooks} books)`;
} catch (e) {
	console.error("Failed to initialize databases:", e);
}

const server = new McpServer({
	name: "quote-database",
	version: "1.0.0",
});

// Helper to format quotes for output
function formatQuotes(
	quotes: FormattedQuoteWithId[],
	options?: { includeCategory?: boolean },
): string {
	if (quotes.length === 0) {
		return "No quotes found matching your criteria.";
	}

	const showCategory = options?.includeCategory ?? true;
	return quotes
		.map((q, i) => {
			let line = `[${i + 1}] ID: ${q.id} | Score: ${q.score.toFixed(2)} | Lang: ${q.language}\n"${q.text}"\n${q.attribution}`;
			if (showCategory) line += `\nCategory: ${q.category}`;
			return line;
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
- ALWAYS set the language filter — results are biased toward the query language without it
- For cross-language coverage, make separate calls with language: "sv", "ar", "en"`,
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
		const quotes = await searchQuotesHybrid(query, {
			limit: limit ?? 5,
			language,
			minStandalone: 4,
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

Available categories (all in English):
- character, knowledge, faith, death, trials, justice, love, meaning
- humility, community, wisdom, hope, mercy, pride, nature, patience
- self-accountability, greed, gratitude, honor, fear, soul, heart
- asceticism, repentance, relationships, remembrance, warning, courage

Top authors by quote count:
- Arabic: Ibn al-Jawzi, Ibn Qayyim, al-Suyuti, Ibn Taymiyyah, al-Nawawi, al-Ghazali
- Swedish: Strindberg, Ellen Key, Söderberg, Runeberg, Bergman, Rydberg, Lagerlöf
- Norse: Hávamál, Poetic Edda, Njáls saga`,
		inputSchema: {
			author: z.string().optional().describe("Author name (partial match works)"),
			category: z
				.string()
				.optional()
				.describe('Category/theme in English (e.g., "patience", "faith", "character")'),
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
			minStandalone: 4,
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
			minStandalone: 4,
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

// Tool 5: Get quote by ID - direct lookup for verification
server.registerTool(
	"get_quote_by_id",
	{
		title: "Get Quote by ID",
		description: `Look up one or more quotes by their database IDs. Use this to verify that a quote exists and check its exact text, author, and source.

This is the most reliable way to verify quotes referenced in research — faster and more accurate than text search.

Accepts any number of IDs for batch verification.`,
		inputSchema: {
			ids: z
				.array(z.number().int().positive())
				.min(1)
				.describe("Array of quote IDs to look up (e.g., [25079, 25080])"),
		},
	},
	async ({ ids }) => {
		const results = ids.map((id) => {
			const quote = getQuote(id);
			if (!quote) {
				return `ID ${id}: NOT FOUND`;
			}
			return `ID ${id} | Lang: ${quote.language} | Author: ${quote.author} | Work: ${quote.workTitle}
"${quote.text}"
Category: ${quote.category} | Keywords: ${quote.keywords.join(", ")}`;
		});

		return {
			content: [{ type: "text", text: results.join("\n\n") }],
		};
	},
);

// Tool 6: Bulk search - multiple queries in parallel
server.registerTool(
	"bulk_search",
	{
		title: "Bulk Semantic Search",
		description: `Run multiple semantic searches in parallel. Much faster than calling search_quotes multiple times.

Example: bulk_search(["patience adversity", "death mortality", "knowledge wisdom"])

Returns results grouped by query. Use this when you need quotes from multiple themes.

IMPORTANT: Semantic search is biased toward the query language. Always set the language filter, or run separate bulk_search calls per language (sv, ar, en) for cross-language coverage.`,
		inputSchema: {
			queries: z.array(z.string()).min(1).max(5).describe("Array of search queries (1-5 queries)"),
			language: z
				.enum(["sv", "ar", "en"])
				.optional()
				.describe("Filter by language: sv=Swedish, ar=Arabic, en=English/Norse"),
			limit_per_query: z
				.number()
				.min(1)
				.max(15)
				.optional()
				.describe("Results per query (default: 10)"),
		},
	},
	async ({ queries, language, limit_per_query }) => {
		const limit = limit_per_query ?? 10;

		// Run all searches in parallel
		const results = await Promise.all(
			queries.map(async (query) => {
				const quotes = await searchQuotesHybrid(query, {
					limit,
					language,
					minStandalone: 4,
				});
				return { query, quotes };
			}),
		);

		// Format output grouped by query — skip category (redundant when query implies theme)
		const output = results
			.map(({ query, quotes }) => {
				return `## "${query}" (${quotes.length} results)\n\n${formatQuotes(quotes, { includeCategory: false })}`;
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
		description: `Search passages in the full-text book database${bookCounts}.

The book database contains full texts from:
- Swedish literature (Strindberg, Lagerlöf, Key, Bremer, etc.)
- Arabic Islamic classics from OpenITI: the hadith collections (Bukhārī, Muslim, the four Sunan, Mālik, Aḥmad's Musnad), an-Nawawī's commentary on Ṣaḥīḥ Muslim (al-Minhāj), fiqh of all four schools, tafsīr (Ibn Kathīr, al-Qurṭubī), Ibn Taymiyya (incl. Majmūʿ al-fatāwā), Ibn al-Qayyim (incl. al-Ṭuruq al-ḥukmiyya), al-Māwardī's al-Aḥkām al-sulṭāniyya, history and biography.

Each passage comes with its printed PAGE as "volume:page" (e.g. "28:390" = volume 28, page 390 of the edition OpenITI digitised) — cite it as such (»Majmūʿ al-fatāwā 28:390«). "Pages" gives the span when a passage crosses a page break. Page is "–" when the edition has no page numbers there (most of the Musnad: cite its hadith number, which stands in the text, e.g. »16 - حدثنا …«). Text is returned with OpenITI markup removed.

Modes:
- "semantic" (default): by meaning. Best for themes; weak on exact classical Arabic wording.
- "text": exact words via the full-text index — use it for a known Arabic phrase or term (e.g. أهل الاختيار). Matches the phrase in order; if the phrase occurs nowhere, falls back to passages containing all the words (and says so). "Match page" is the page of the first matched word. Spelling variants (أ/ا, ة/ه) are NOT folded — try both.

Filters: "book" and "author" (case-, diacritic- and article-insensitive substrings; "author" also matches the Arabic-script name of a romanized one, e.g. "Mawardi" → الماوردي). With a filter, there is no cap on passages per author.

Examples:
- query "أهل الاختيار", mode "text", book "Ahkam Sultaniyya" → al-Māwardī on the electors, with pages
- query "the qualifications of those who choose the caliph", author "Mawardi"
- "the nature of the soul and its purification" → Islamic psychology texts
- "death and meaning in Swedish literature" → Swedish authors on mortality`,
		inputSchema: {
			query: z
				.string()
				.describe(
					'Search query: a description ("spiritual struggle against the ego") or, in text mode, the exact words',
				),
			mode: z
				.enum(["semantic", "text"])
				.optional()
				.describe('"semantic" (default, by meaning) or "text" (exact words, FTS5)'),
			book: z
				.string()
				.optional()
				.describe(
					'Only books whose title contains this, e.g. "Majmu al-fatawa", "Minhaj sharh Sahih Muslim", "AhkamSultaniyya"',
				),
			author: z
				.string()
				.optional()
				.describe('Only books whose author contains this, e.g. "Ibn Taymiyya", "Nawawi"'),
			languages: z
				.array(z.enum(["sv", "ar", "en"]))
				.optional()
				.describe(
					'Filter by languages (e.g. ["sv", "ar"] for both Swedish and Arabic). Omit for all languages.',
				),
			limit: z
				.number()
				.min(1)
				.max(20)
				.optional()
				.describe("Number of results (default: 5, max: 20)"),
		},
	},
	async ({ query, mode, book, author, languages, limit }) => {
		const result = await searchBookPassages(query, {
			mode: mode ?? "semantic",
			book,
			author,
			languages,
			limit: limit ?? 5,
		});

		if (result.books && result.books.length === 0) {
			const filter = [book && `book "${book}"`, author && `author "${author}"`]
				.filter(Boolean)
				.join(" and ");
			return {
				content: [{ type: "text", text: `No book matches ${filter}.` }],
			};
		}

		if (result.hits.length === 0) {
			return {
				content: [{ type: "text", text: "No book passages found matching your query." }],
			};
		}

		let output = "";
		if (result.books) {
			const listed = result.books
				.slice(0, 8)
				.map((b) => `${b.title} (${b.author})`)
				.join("; ");
			const more = result.books.length > 8 ? ` … and ${result.books.length - 8} more` : "";
			output += `## Searched: ${listed}${more}\n\n`;
		}
		if (result.mode === "text" && result.textMatch === "all-words") {
			output += "⚠️ The exact phrase occurs nowhere; these passages contain all of the words.\n\n";
		}
		if (result.concepts.length > 0) {
			const conceptLines = result.concepts
				.map((c) => `- ${c.bookTitle} by ${c.bookAuthor} (${c.type}, score: ${c.score.toFixed(3)})`)
				.join("\n");
			output += `## Thematically relevant books/chapters:\n${conceptLines}\n\n## Passages (ranked by hybrid relevance):\n\n`;
		}

		output += result.hits
			.map((p, i) => {
				const lines = [
					`[${i + 1}] ID: ${p.id}`,
					`Book: ${p.bookTitle} by ${p.bookAuthor}`,
					`Page: ${p.page ?? "–"}${p.pages && p.pages !== p.page ? ` (pages ${p.pages})` : ""}`,
				];
				if (result.mode === "text") lines.push(`Match page: ${p.matchPage ?? "–"}`);
				if (p.score !== null) lines.push(`Score: ${p.score.toFixed(3)}`);
				return `${lines.join("\n")}\n\n"${p.text}"`;
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

Use this to find Quranic support for themes in your article. Each verse is returned with:
- "Bernström": Knut Bernström's Swedish translation — the HOUSE TRANSLATION. This is the text to QUOTE, verbatim (the site's quote check compares every quoted verse against it).
- "Wennerström": Kent Asante Wennerström's translation, which is what the search runs on. It comes from a scan and is NOT for quoting; translator's notes follow it as "Notes".
- "Arabic": the Uthmani text.

IMPORTANT: The search runs on Swedish text. Always search in Swedish for best results.

Examples:
- "tålamod och uthållighet" → finds verses about sabr
- "kunskap och visdom" → finds verses about ilm
- "döden och uppståndelsen" → finds verses about akhira`,
		inputSchema: {
			query: z
				.string()
				.describe('Theme to search for IN SWEDISH (e.g., "tacksamhet och ödmjukhet")'),
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
				const lines = [`[${i + 1}] ${v.surahNameSwedish} ${v.surahNumber}:${v.verseNumber}`, ""];
				if (v.textArabic) lines.push(`Arabic: ${v.textArabic}`);
				lines.push(`Bernström (house translation — quote this): ${v.textBernstrom ?? "–"}`);
				lines.push(`Wennerström (search text, do not quote): ${v.textSwedish}`);
				if (v.commentary) lines.push(`Notes (Wennerström): ${v.commentary}`);
				lines.push("", `Score: ${v.score.toFixed(3)}`);
				return lines.join("\n");
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
