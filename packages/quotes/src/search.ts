import type Database from "better-sqlite3";
import { initDatabase, parseQuoteRow, type QuoteWithScore, type RawQuoteRow } from "./database.js";
import { generateEmbedding, generateLocalEmbedding } from "./embeddings/index.js";

// ============================================================================
// Inventory
// ============================================================================

export interface Inventory {
	total: number;
	categories: { name: string; count: number; quality: number }[];
	tones: { name: string; count: number }[];
	authors: { name: string; count: number }[];
	languages: { sv: number; ar: number; en: number };
	quality: { standalone4Plus: number; standalone5: number };
}

/**
 * Returns an inventory of the quote database.
 * Helps LLMs understand the "palette" before searching.
 */
export function getInventory(db?: Database.Database): Inventory {
	const database = db ?? initDatabase();

	// Total quotes
	const total = (
		database.prepare("SELECT COUNT(*) as count FROM quotes").get() as { count: number }
	).count;

	// Categories with quality count (standalone >= 4)
	const categories = database
		.prepare(`
		SELECT
			category as name,
			COUNT(*) as count,
			SUM(CASE WHEN standalone >= 4 THEN 1 ELSE 0 END) as quality
		FROM quotes
		WHERE category IS NOT NULL AND category != ''
		GROUP BY category
		ORDER BY count DESC
	`)
		.all() as { name: string; count: number; quality: number }[];

	// Tones
	const tones = database
		.prepare(`
		SELECT tone as name, COUNT(*) as count
		FROM quotes
		WHERE tone IS NOT NULL AND tone != ''
		GROUP BY tone
		ORDER BY count DESC
	`)
		.all() as { name: string; count: number }[];

	// Authors (top 50)
	const authors = database
		.prepare(`
		SELECT author as name, COUNT(*) as count
		FROM quotes
		GROUP BY author
		ORDER BY count DESC
		LIMIT 50
	`)
		.all() as { name: string; count: number }[];

	// Language counts
	const svCount = (
		database.prepare("SELECT COUNT(*) as count FROM quotes WHERE language = 'sv'").get() as {
			count: number;
		}
	).count;
	const arCount = (
		database.prepare("SELECT COUNT(*) as count FROM quotes WHERE language = 'ar'").get() as {
			count: number;
		}
	).count;
	const enCount = (
		database.prepare("SELECT COUNT(*) as count FROM quotes WHERE language = 'en'").get() as {
			count: number;
		}
	).count;

	// Quality counts
	const standalone4Plus = (
		database.prepare("SELECT COUNT(*) as count FROM quotes WHERE standalone >= 4").get() as {
			count: number;
		}
	).count;
	const standalone5 = (
		database.prepare("SELECT COUNT(*) as count FROM quotes WHERE standalone = 5").get() as {
			count: number;
		}
	).count;

	return {
		total,
		categories,
		tones,
		authors,
		languages: { sv: svCount, ar: arCount, en: enCount },
		quality: { standalone4Plus, standalone5 },
	};
}

export interface SearchOptions {
	limit?: number;
	language?: "sv" | "ar" | "en";
}

/**
 * Performs semantic search on quotes using vector similarity
 */
export async function searchQuotes(
	query: string,
	options?: SearchOptions | number,
): Promise<QuoteWithScore[]> {
	// Input validation
	if (!query?.trim()) {
		throw new Error("Search query cannot be empty");
	}
	if (query.length > 10000) {
		throw new Error("Search query too long (max 10000 characters)");
	}

	const database = initDatabase();

	// Handle backward compatibility: if options is a number, treat it as limit
	const opts: SearchOptions = typeof options === "number" ? { limit: options } : (options ?? {});
	const limit = opts.limit ?? 10;

	// Generate embedding for the query
	const queryEmbedding = await generateEmbedding(query);
	const queryBuffer = Buffer.from(new Uint8Array(queryEmbedding.buffer));

	// Build query with optional language filter using parameterized query
	const params: (Buffer | string | number)[] = [queryBuffer];
	const languageFilter = opts.language ? "AND q.language = ?" : "";
	if (opts.language) params.push(opts.language);
	params.push(limit);

	const stmt = database.prepare(`
		SELECT
			q.id,
			q.text,
			q.author,
			q.work_title as workTitle,
			q.category,
			q.keywords,
			q.tone,
			q.standalone,
			q.length,
			q.language,
			q.source_type as sourceType,
			q.created_at as createdAt,
			vec_distance_cosine(e.embedding, ?) as distance
		FROM quote_embeddings e
		JOIN quotes q ON e.rowid = q.id
		WHERE 1=1 ${languageFilter}
		ORDER BY distance ASC
		LIMIT ?
	`);

	const rows = stmt.all(...params) as (RawQuoteRow & { distance: number })[];

	// Convert distance to similarity score (1 - distance for cosine)
	return rows.map((row) => ({
		...parseQuoteRow(row),
		score: 1 - row.distance,
	}));
}

/**
 * Gets all available categories with counts
 */
export function getCategories(db?: Database.Database): { category: string; count: number }[] {
	const database = db ?? initDatabase();

	const stmt = database.prepare(`
		SELECT category, COUNT(*) as count
		FROM quotes
		WHERE category IS NOT NULL
		GROUP BY category
		ORDER BY count DESC
	`);

	return stmt.all() as { category: string; count: number }[];
}

/**
 * Formatted quote for use in text by author agent
 */
export interface FormattedQuote {
	text: string;
	attribution: string;
	category: string;
	keywords: string[];
	tone: string;
	standalone: number;
	length: "short" | "medium" | "long";
	language: "sv" | "ar" | "en";
	score: number;
}

// ============================================================================
// LLM-Optimized Functions (No API Required)
// ============================================================================

export interface FormattedQuoteWithId extends FormattedQuote {
	id: number;
}

/**
 * Filter-based quote search - NO embedding API required.
 * Searches by category, keywords, tone, author without needing embeddings.
 * Use this when you want to browse/filter without semantic search.
 */
export function findQuotesByFilter(
	options: {
		category?: string;
		tone?: string;
		author?: string;
		keywords?: string[];
		language?: "sv" | "ar" | "en";
		length?: "short" | "medium" | "long";
		minStandalone?: number;
		limit?: number;
	},
	db?: Database.Database,
): FormattedQuoteWithId[] {
	const database = db ?? initDatabase();
	const limit = options.limit ?? 10;
	const minStandalone = options.minStandalone ?? 4;

	// Build WHERE clauses
	const conditions: string[] = ["standalone >= ?"];
	const params: (string | number)[] = [minStandalone];

	if (options.category) {
		conditions.push("(category = ? OR category LIKE ?)");
		params.push(options.category, `%${options.category}%`);
	}
	if (options.tone) {
		conditions.push("tone = ?");
		params.push(options.tone);
	}
	if (options.author) {
		conditions.push("(author = ? OR author LIKE ?)");
		params.push(options.author, `%${options.author}%`);
	}
	if (options.language) {
		conditions.push("language = ?");
		params.push(options.language);
	}
	if (options.length) {
		conditions.push("length = ?");
		params.push(options.length);
	}
	if (options.keywords && options.keywords.length > 0) {
		// Use FTS5 column-scoped search for keywords
		const ftsTerms = options.keywords
			.map((kw) => `keywords : "${kw.replace(/"/g, '""')}"`)
			.join(" OR ");
		conditions.push("id IN (SELECT rowid FROM quotes_fts WHERE quotes_fts MATCH ?)");
		params.push(ftsTerms);
	}

	const whereClause = conditions.join(" AND ");
	params.push(limit);

	const stmt = database.prepare(`
		SELECT
			id, text, author, work_title as workTitle, category, keywords,
			tone, standalone, length, language, created_at as createdAt
		FROM quotes
		WHERE ${whereClause}
		ORDER BY standalone DESC, RANDOM()
		LIMIT ?
	`);

	const rows = stmt.all(...params) as RawQuoteRow[];

	return rows.map((row) => {
		const q = parseQuoteRow(row);
		return {
			id: q.id,
			text: q.text,
			attribution:
				q.language === "ar" ? `— ${q.author}، ${q.workTitle}` : `— ${q.author}, ${q.workTitle}`,
			category: q.category ?? (q.language === "ar" ? "غير مصنف" : "okategoriserad"),
			keywords: q.keywords ?? [],
			tone: q.tone ?? "neutral",
			standalone: q.standalone ?? 3,
			length: q.length ?? "medium",
			language: q.language ?? "sv",
			score: 0.5, // No semantic ranking for filter-based search
		};
	});
}

/**
 * Builds an FTS5 query from user input.
 * Each token gets a prefix wildcard (*) so partial words match
 * (e.g. "tålam" matches "tålamod"). Prefix search implicitly covers exact matches.
 */
export function buildFts5Query(query: string): string {
	const tokens = query.split(/\s+/).filter((t) => t.length > 0);
	if (tokens.length === 0) return "";

	// Use prefix matching for each token — "word"* matches "word" and "wording"
	// Strip chars that can break FTS5 parsing even inside quotes
	return tokens
		.map((token) => {
			const cleaned = token.replace(/["""(){}[\]:^~+\-!]/g, "").trim();
			if (!cleaned) return null;
			return `"${cleaned}"*`;
		})
		.filter(Boolean)
		.join(" ");
}

/**
 * Text search across quote content using FTS5 - NO embedding API required.
 * Searches quote text, author, work title, and keywords with BM25 ranking.
 */
export function searchQuotesText(
	query: string,
	options?: {
		language?: "sv" | "ar" | "en";
		minStandalone?: number;
		limit?: number;
	},
	db?: Database.Database,
): FormattedQuoteWithId[] {
	const database = db ?? initDatabase();
	const limit = options?.limit ?? 10;
	const minStandalone = options?.minStandalone ?? 4;

	const ftsQuery = buildFts5Query(query);
	if (!ftsQuery) return [];

	const conditions: string[] = ["quotes_fts MATCH ?", "q.standalone >= ?"];
	const params: (string | number)[] = [ftsQuery, minStandalone];

	if (options?.language) {
		conditions.push("q.language = ?");
		params.push(options.language);
	}

	params.push(limit);

	const stmt = database.prepare(`
		SELECT
			q.id, q.text, q.author, q.work_title as workTitle, q.category, q.keywords,
			q.tone, q.standalone, q.length, q.language, q.created_at as createdAt,
			rank
		FROM quotes_fts fts
		JOIN quotes q ON q.id = fts.rowid
		WHERE ${conditions.join(" AND ")}
		ORDER BY rank
		LIMIT ?
	`);

	const rows = stmt.all(...params) as (RawQuoteRow & { rank: number })[];

	// Normalize BM25 rank to 0–1 score (rank is negative, lower = better match)
	const minRank = rows.length > 0 ? Math.min(...rows.map((r) => r.rank)) : 0;
	const maxRank = rows.length > 0 ? Math.max(...rows.map((r) => r.rank)) : 0;
	const rankRange = maxRank - minRank || 1;

	return rows.map((row) => {
		const q = parseQuoteRow(row);
		// Invert and normalize: best match (most negative rank) → score ~0.75
		// Capped at 0.75 because text matches are inherently less precise than semantic matches
		const score = 0.75 * (1 - (row.rank - minRank) / rankRange);
		return {
			id: q.id,
			text: q.text,
			attribution:
				q.language === "ar" ? `— ${q.author}، ${q.workTitle}` : `— ${q.author}, ${q.workTitle}`,
			category: q.category ?? (q.language === "ar" ? "غير مصنف" : "okategoriserad"),
			keywords: q.keywords ?? [],
			tone: q.tone ?? "neutral",
			standalone: q.standalone ?? 3,
			length: q.length ?? "medium",
			language: q.language ?? "sv",
			score,
		};
	});
}

/**
 * Hybrid search combining FTS5 text matching with semantic vector search.
 * Uses Reciprocal Rank Fusion (RRF) to merge results from both rankers.
 *
 * This finds quotes that match by keyword AND by meaning, producing
 * better results than either approach alone:
 * - FTS5 catches exact matches that semantic search might rank low
 * - Semantic catches conceptual matches without the exact keyword
 * - RRF merges by rank position, avoiding score calibration issues
 */
export async function searchQuotesHybrid(
	query: string,
	options?: {
		language?: "sv" | "ar" | "en";
		minStandalone?: number;
		limit?: number;
	},
): Promise<FormattedQuoteWithId[]> {
	if (!query?.trim()) return [];

	const limit = options?.limit ?? 10;
	// Fetch more candidates from each source for better fusion
	const fetchLimit = limit * 3;

	// Run FTS5 (may fail on unusual input) and semantic search
	let ftsResults: FormattedQuoteWithId[];
	try {
		ftsResults = searchQuotesText(query, { ...options, limit: fetchLimit });
	} catch {
		ftsResults = []; // Graceful fallback to semantic-only
	}

	const semanticResults = await findQuotesLocal(query, {
		limit: fetchLimit,
		language: options?.language,
		minStandalone: options?.minStandalone ?? 4,
		diverse: false, // RRF handles diversity; skip MMR
	});

	// Reciprocal Rank Fusion (k=60 is standard)
	const k = 60;
	const rrfScores = new Map<number, { score: number; quote: FormattedQuoteWithId }>();

	for (let i = 0; i < ftsResults.length; i++) {
		const quote = ftsResults[i];
		if (!quote) continue;
		const rrfScore = 1 / (k + i + 1);
		const existing = rrfScores.get(quote.id);
		if (existing) {
			existing.score += rrfScore;
		} else {
			rrfScores.set(quote.id, { score: rrfScore, quote });
		}
	}

	for (let i = 0; i < semanticResults.length; i++) {
		const quote = semanticResults[i];
		if (!quote) continue;
		const rrfScore = 1 / (k + i + 1);
		const existing = rrfScores.get(quote.id);
		if (existing) {
			existing.score += rrfScore;
		} else {
			rrfScores.set(quote.id, { score: rrfScore, quote });
		}
	}

	// Sort by combined RRF score (highest first) and take top N
	return [...rrfScores.values()]
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map(({ score, quote }) => ({ ...quote, score }));
}

/**
 * Computes cosine similarity between two embeddings
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		const aVal = a[i] ?? 0;
		const bVal = b[i] ?? 0;
		dot += aVal * bVal;
		normA += aVal * aVal;
		normB += bVal * bVal;
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Applies MMR (Maximal Marginal Relevance) to select diverse results.
 * Balances relevance with diversity from already-selected quotes.
 */
function applyMMR(
	candidates: (QuoteWithScore & { embedding: Float32Array })[],
	limit: number,
	lambda = 0.7,
): (QuoteWithScore & { embedding: Float32Array })[] {
	if (candidates.length === 0) return [];
	if (candidates.length <= limit) return candidates;

	const selected: (QuoteWithScore & { embedding: Float32Array })[] = [];
	const remaining = [...candidates];

	// Select first item (highest relevance)
	const first = remaining.shift();
	if (first) selected.push(first);

	// Select remaining items using MMR
	while (selected.length < limit && remaining.length > 0) {
		let bestIdx = 0;
		let bestScore = -Infinity;

		for (let i = 0; i < remaining.length; i++) {
			const candidate = remaining[i];
			if (!candidate) continue;
			const relevance = candidate.score;

			// Find max similarity to any selected quote
			let maxSim = 0;
			for (const sel of selected) {
				const sim = cosineSimilarity(candidate.embedding, sel.embedding);
				if (sim > maxSim) maxSim = sim;
			}

			// MMR score: balance relevance with diversity
			const mmrScore = lambda * relevance - (1 - lambda) * maxSim;

			if (mmrScore > bestScore) {
				bestScore = mmrScore;
				bestIdx = i;
			}
		}

		const spliced = remaining.splice(bestIdx, 1)[0];
		if (spliced) selected.push(spliced);
	}

	return selected;
}

/**
 * LLM-optimized quote search with quality defaults and diversity.
 * Defaults to minStandalone=4 and applies MMR for diverse results.
 */
export async function findQuotesForLLM(
	topic: string,
	options?: {
		limit?: number;
		language?: "sv" | "ar" | "en";
		category?: string;
		tone?: string;
		length?: "short" | "medium" | "long";
		minStandalone?: number;
		diverse?: boolean;
	},
): Promise<FormattedQuoteWithId[]> {
	// Input validation
	if (!topic?.trim()) {
		throw new Error("Search topic cannot be empty");
	}
	if (topic.length > 10000) {
		throw new Error("Search topic too long (max 10000 characters)");
	}

	const database = initDatabase();
	const limit = options?.limit ?? 5;
	const minStandalone = options?.minStandalone ?? 4;
	const diverse = options?.diverse ?? true;

	// Fetch more candidates for filtering and diversity
	const fetchLimit = diverse ? limit * 3 : limit * 2;

	// Generate embedding for the query
	const queryEmbedding = await generateEmbedding(topic);
	const queryBuffer = Buffer.from(new Uint8Array(queryEmbedding.buffer));

	// Build query with parameterized language filter
	const params: (Buffer | string | number)[] = [queryBuffer, minStandalone];
	const languageFilter = options?.language ? "AND q.language = ?" : "";
	if (options?.language) params.push(options.language);
	params.push(fetchLimit);

	const stmt = database.prepare(`
		SELECT
			q.id,
			q.text,
			q.author,
			q.work_title as workTitle,
			q.category,
			q.keywords,
			q.tone,
			q.standalone,
			q.length,
			q.language,
			q.source_type as sourceType,
			q.created_at as createdAt,
			e.embedding,
			vec_distance_cosine(e.embedding, ?) as distance
		FROM quote_embeddings e
		JOIN quotes q ON e.rowid = q.id
		WHERE q.standalone >= ? ${languageFilter}
		ORDER BY distance ASC
		LIMIT ?
	`);

	const rows = stmt.all(...params) as (RawQuoteRow & {
		distance: number;
		embedding: Buffer;
	})[];

	// Convert to QuoteWithScore with embeddings
	let candidates = rows.map((row) => {
		const embedding = new Float32Array(
			row.embedding.buffer,
			row.embedding.byteOffset,
			row.embedding.length / 4,
		);
		return {
			...parseQuoteRow(row),
			score: 1 - row.distance,
			embedding,
		};
	});

	// Apply additional filters
	if (options?.category) {
		const categoryFilter = options.category.toLowerCase();
		candidates = candidates.filter((r) => r.category?.toLowerCase().includes(categoryFilter));
	}
	if (options?.tone) {
		candidates = candidates.filter((r) => r.tone === options.tone);
	}
	if (options?.length) {
		candidates = candidates.filter((r) => r.length === options.length);
	}

	// Apply MMR for diversity if enabled
	const results = diverse ? applyMMR(candidates, limit) : candidates.slice(0, limit);

	// Format for LLM use
	return results.map((q) => ({
		id: q.id,
		text: q.text,
		attribution:
			q.language === "ar"
				? `— ${q.author}، ${q.workTitle}` // Arabic comma
				: `— ${q.author}, ${q.workTitle}`, // Swedish/Latin comma
		category: q.category ?? (q.language === "ar" ? "غير مصنف" : "okategoriserad"),
		keywords: q.keywords ?? [],
		tone: q.tone ?? "neutral",
		standalone: q.standalone ?? 3,
		length: q.length ?? "medium",
		language: q.language ?? "sv",
		score: q.score,
	}));
}

/**
 * LLM-optimized quote search using LOCAL embeddings - NO API key required.
 * Uses multilingual-e5-small model which supports Swedish and Arabic.
 *
 * Note: First call downloads ~470MB model. Subsequent calls are instant.
 * Note: Only works if quotes were indexed with local embeddings (384 dims).
 */
export async function findQuotesLocal(
	topic: string,
	options?: {
		limit?: number;
		language?: "sv" | "ar" | "en";
		category?: string;
		tone?: string;
		length?: "short" | "medium" | "long";
		minStandalone?: number;
		diverse?: boolean;
	},
): Promise<FormattedQuoteWithId[]> {
	// Input validation
	if (!topic?.trim()) {
		throw new Error("Search topic cannot be empty");
	}
	if (topic.length > 10000) {
		throw new Error("Search topic too long (max 10000 characters)");
	}

	const database = initDatabase();
	const limit = options?.limit ?? 5;
	const minStandalone = options?.minStandalone ?? 4;
	const diverse = options?.diverse ?? true;

	const fetchLimit = diverse ? limit * 3 : limit * 2;

	// Generate embedding using LOCAL model
	const queryEmbedding = await generateLocalEmbedding(topic, "query");
	const queryBuffer = Buffer.from(new Uint8Array(queryEmbedding.buffer));

	// Build query with parameterized language filter
	const params: (Buffer | string | number)[] = [queryBuffer, minStandalone];
	const languageFilter = options?.language ? "AND q.language = ?" : "";
	if (options?.language) params.push(options.language);
	params.push(fetchLimit);

	const stmt = database.prepare(`
		SELECT
			q.id,
			q.text,
			q.author,
			q.work_title as workTitle,
			q.category,
			q.keywords,
			q.tone,
			q.standalone,
			q.length,
			q.language,
			q.source_type as sourceType,
			q.created_at as createdAt,
			e.embedding,
			vec_distance_cosine(e.embedding, ?) as distance
		FROM quote_embeddings e
		JOIN quotes q ON e.rowid = q.id
		WHERE q.standalone >= ? ${languageFilter}
		ORDER BY distance ASC
		LIMIT ?
	`);

	const rows = stmt.all(...params) as (RawQuoteRow & {
		distance: number;
		embedding: Buffer;
	})[];

	let candidates = rows.map((row) => {
		const embedding = new Float32Array(
			row.embedding.buffer,
			row.embedding.byteOffset,
			row.embedding.length / 4,
		);
		return {
			...parseQuoteRow(row),
			score: 1 - row.distance,
			embedding,
		};
	});

	if (options?.category) {
		const categoryFilter = options.category.toLowerCase();
		candidates = candidates.filter((r) => r.category?.toLowerCase().includes(categoryFilter));
	}
	if (options?.tone) {
		candidates = candidates.filter((r) => r.tone === options.tone);
	}
	if (options?.length) {
		candidates = candidates.filter((r) => r.length === options.length);
	}

	const results = diverse ? applyMMR(candidates, limit) : candidates.slice(0, limit);

	return results.map((q) => ({
		id: q.id,
		text: q.text,
		attribution:
			q.language === "ar" ? `— ${q.author}، ${q.workTitle}` : `— ${q.author}, ${q.workTitle}`,
		category: q.category ?? (q.language === "ar" ? "غير مصنف" : "okategoriserad"),
		keywords: q.keywords ?? [],
		tone: q.tone ?? "neutral",
		standalone: q.standalone ?? 3,
		length: q.length ?? "medium",
		language: q.language ?? "sv",
		score: q.score,
	}));
}

/**
 * Finds quotes in both Swedish and Arabic for a topic.
 * Useful for universal concepts that benefit from both perspectives.
 */
export async function findQuotesPaired(
	topic: string,
	options?: {
		limitPerLanguage?: number;
		minStandalone?: number;
	},
): Promise<{ swedish: FormattedQuoteWithId[]; arabic: FormattedQuoteWithId[] }> {
	const limitPerLanguage = options?.limitPerLanguage ?? 3;
	const minStandalone = options?.minStandalone ?? 4;

	// Search both languages in parallel using LOCAL embeddings (no API required)
	const [swedish, arabic] = await Promise.all([
		findQuotesLocal(topic, {
			limit: limitPerLanguage,
			language: "sv",
			minStandalone,
		}),
		findQuotesLocal(topic, {
			limit: limitPerLanguage,
			language: "ar",
			minStandalone,
		}),
	]);

	return { swedish, arabic };
}
