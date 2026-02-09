/**
 * Book search functionality with multiple modes.
 *
 * All searches use local embeddings = FREE (no API cost).
 *
 * Three search modes:
 * 1. searchPassages() - exact text matches via passage embeddings
 * 2. searchConcepts() - thematic search via summary embeddings
 * 3. searchBooks() - hybrid combining both
 */

import { generateLocalEmbedding } from "../embeddings/local.js";
import { initBookDatabase, type PassageWithContext, type PassageWithScore } from "./database.js";

// ============================================================================
// Types
// ============================================================================

export interface PassageSearchOptions {
	/** Maximum number of results (default: 10) */
	limit?: number;
	/** Minimum similarity score 0-1 (default: 0.3) */
	minScore?: number;
	/** Filter by book ID */
	bookId?: number;
	/** Filter by language */
	language?: "sv" | "ar" | "en";
}

export interface ConceptSearchOptions {
	/** Maximum number of results (default: 10) */
	limit?: number;
	/** Minimum similarity score 0-1 (default: 0.3) */
	minScore?: number;
	/** Filter by book ID */
	bookId?: number;
	/** Filter by language */
	language?: "sv" | "ar" | "en";
	/** Include book-level summaries (default: true) */
	includeBookSummaries?: boolean;
	/** Include chapter-level summaries (default: true) */
	includeChapterSummaries?: boolean;
}

export interface HybridSearchOptions {
	/** Maximum passages to return (default: 10) */
	passageLimit?: number;
	/** Maximum concepts to return (default: 5) */
	conceptLimit?: number;
	/** Minimum similarity score 0-1 (default: 0.3) */
	minScore?: number;
	/** Filter by book ID */
	bookId?: number;
	/** Filter by language */
	language?: "sv" | "ar" | "en";
	/** Weight for passage results vs concept results (default: 0.7) */
	passageWeight?: number;
}

export interface HybridSearchResult {
	passages: PassageWithScore[];
	concepts: ConceptMatch[];
	combined: PassageWithScore[]; // Passages re-ranked with concept relevance
}

export interface ConceptMatch {
	type: "book" | "chapter";
	entityId: number;
	bookId: number;
	bookTitle: string;
	bookAuthor: string;
	chapterNumber?: number;
	chapterTitle?: string;
	summary: string;
	keyConcepts: string[];
	score: number;
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search passages by semantic similarity.
 * Uses local embeddings (FREE).
 */
export async function searchPassages(
	query: string,
	options: PassageSearchOptions = {},
): Promise<PassageWithScore[]> {
	const { limit = 10, minScore = 0.3, bookId, language } = options;

	const database = initBookDatabase();

	// Generate query embedding locally (FREE)
	const queryEmbedding = await generateLocalEmbedding(query, "query");
	const queryBuffer = Buffer.from(new Uint8Array(queryEmbedding.buffer));

	// Build the query
	let sql = `
		SELECT
			p.id, p.book_id as bookId, p.chapter_id as chapterId,
			p.passage_number as passageNumber, p.text,
			p.start_position as startPosition, p.end_position as endPosition,
			b.title as bookTitle, b.author as bookAuthor,
			c.title as chapterTitle, c.chapter_number as chapterNumber,
			vec_distance_cosine(e.embedding, ?) as distance
		FROM passage_embeddings e
		JOIN passages p ON e.rowid = p.id
		JOIN books b ON p.book_id = b.id
		LEFT JOIN chapters c ON p.chapter_id = c.id
	`;

	const params: (Buffer | number | string)[] = [queryBuffer];
	const conditions: string[] = [];

	if (bookId !== undefined) {
		conditions.push("p.book_id = ?");
		params.push(bookId);
	}

	if (language !== undefined) {
		conditions.push("b.language = ?");
		params.push(language);
	}

	if (conditions.length > 0) {
		sql += ` WHERE ${conditions.join(" AND ")}`;
	}

	sql += " ORDER BY distance ASC LIMIT ?";
	params.push(limit * 2); // Fetch extra for filtering

	const stmt = database.prepare(sql);
	const rows = stmt.all(...params) as (PassageWithContext & { distance: number })[];

	// Convert distance to similarity score and filter
	return rows
		.map((row) => ({
			...row,
			score: 1 - row.distance, // Cosine distance to similarity
		}))
		.filter((row) => row.score >= minScore)
		.slice(0, limit);
}

/**
 * Search by concepts/themes via summary embeddings.
 * Uses local embeddings (FREE).
 * Optimized with JOINs to avoid N+1 queries.
 */
export async function searchConcepts(
	query: string,
	options: ConceptSearchOptions = {},
): Promise<ConceptMatch[]> {
	const {
		limit = 10,
		minScore = 0.3,
		bookId,
		language,
		includeBookSummaries = true,
		includeChapterSummaries = true,
	} = options;

	const database = initBookDatabase();

	// Generate query embedding locally (FREE)
	const queryEmbedding = await generateLocalEmbedding(query, "query");
	const queryBuffer = Buffer.from(new Uint8Array(queryEmbedding.buffer));

	const results: ConceptMatch[] = [];

	// Build type filter
	const typeConditions: string[] = [];
	if (includeBookSummaries) typeConditions.push("'book'");
	if (includeChapterSummaries) typeConditions.push("'chapter'");
	if (typeConditions.length === 0) return [];

	const typeFilter = `m.entity_type IN (${typeConditions.join(", ")})`;
	const langFilter = language ? " AND b.language = ?" : "";

	// Single query with JOINs to fetch all data at once
	const sql = `
		SELECT
			m.entity_type as entityType,
			m.entity_id as entityId,
			vec_distance_cosine(e.embedding, ?) as distance,
			-- Book fields (for both book and chapter results)
			b.id as bookId,
			b.title as bookTitle,
			b.author as bookAuthor,
			b.summary as bookSummary,
			b.key_concepts as bookKeyConcepts,
			-- Chapter fields (NULL for book results)
			c.id as chapterId,
			c.chapter_number as chapterNumber,
			c.title as chapterTitle,
			c.summary as chapterSummary,
			c.key_concepts as chapterKeyConcepts
		FROM summary_embeddings e
		JOIN summary_embedding_meta m ON e.rowid = m.id
		LEFT JOIN books b ON (m.entity_type = 'book' AND m.entity_id = b.id)
			OR (m.entity_type = 'chapter' AND b.id = (SELECT book_id FROM chapters WHERE id = m.entity_id))
		LEFT JOIN chapters c ON m.entity_type = 'chapter' AND m.entity_id = c.id
		WHERE ${typeFilter}${langFilter}
		ORDER BY distance ASC
		LIMIT ?
	`;

	const params: (Buffer | number | string)[] = [queryBuffer];
	if (language) params.push(language);
	params.push(limit * 3);

	const rows = database.prepare(sql).all(...params) as {
		entityType: "book" | "chapter";
		entityId: number;
		distance: number;
		bookId: number;
		bookTitle: string;
		bookAuthor: string;
		bookSummary: string | null;
		bookKeyConcepts: string | null;
		chapterId: number | null;
		chapterNumber: number | null;
		chapterTitle: string | null;
		chapterSummary: string | null;
		chapterKeyConcepts: string | null;
	}[];

	for (const row of rows) {
		const score = 1 - row.distance;
		if (score < minScore) continue;
		if (bookId && row.bookId !== bookId) continue;

		if (row.entityType === "book") {
			results.push({
				type: "book",
				entityId: row.entityId,
				bookId: row.bookId,
				bookTitle: row.bookTitle,
				bookAuthor: row.bookAuthor,
				summary: row.bookSummary ?? "",
				keyConcepts: JSON.parse(row.bookKeyConcepts || "[]"),
				score,
			});
		} else if (row.entityType === "chapter" && row.chapterId !== null) {
			results.push({
				type: "chapter",
				entityId: row.chapterId,
				bookId: row.bookId,
				bookTitle: row.bookTitle,
				bookAuthor: row.bookAuthor,
				chapterNumber: row.chapterNumber ?? undefined,
				chapterTitle: row.chapterTitle ?? undefined,
				summary: row.chapterSummary ?? "",
				keyConcepts: JSON.parse(row.chapterKeyConcepts || "[]"),
				score,
			});
		}
	}

	return results.slice(0, limit);
}

/**
 * Hybrid search combining passage and concept search.
 * Returns both types of results plus a combined ranking.
 * Uses local embeddings (FREE).
 */
export async function searchBooks(
	query: string,
	options: HybridSearchOptions = {},
): Promise<HybridSearchResult> {
	const {
		passageLimit = 10,
		conceptLimit = 5,
		minScore = 0.3,
		bookId,
		language,
		passageWeight = 0.7,
	} = options;

	// Run both searches in parallel
	const [passages, concepts] = await Promise.all([
		searchPassages(query, {
			limit: passageLimit * 2, // Get extra for re-ranking
			minScore,
			bookId,
			language,
		}),
		searchConcepts(query, {
			limit: conceptLimit,
			minScore,
			bookId,
			language,
		}),
	]);

	// Create a book relevance map from concepts
	const bookRelevance = new Map<number, number>();
	for (const concept of concepts) {
		const existing = bookRelevance.get(concept.bookId) ?? 0;
		const contribution = concept.type === "book" ? concept.score : concept.score * 0.7;
		bookRelevance.set(concept.bookId, Math.max(existing, contribution));
	}

	// Re-rank passages using concept relevance
	// If no concepts found, use raw passage scores (don't penalize)
	const hasConcepts = bookRelevance.size > 0;
	const combined = passages.map((passage) => {
		if (!hasConcepts) return { ...passage };
		const conceptBoost = bookRelevance.get(passage.bookId) ?? 0;
		const combinedScore = passageWeight * passage.score + (1 - passageWeight) * conceptBoost;
		return { ...passage, score: combinedScore };
	});

	// Sort by combined score and limit
	combined.sort((a, b) => b.score - a.score);

	return {
		passages: passages.slice(0, passageLimit),
		concepts,
		combined: combined.slice(0, passageLimit),
	};
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get all passages for a specific book.
 */
export function getBookPassages(bookId: number, limit?: number): PassageWithContext[] {
	const database = initBookDatabase();

	let sql = `
		SELECT
			p.id, p.book_id as bookId, p.chapter_id as chapterId,
			p.passage_number as passageNumber, p.text,
			p.start_position as startPosition, p.end_position as endPosition,
			b.title as bookTitle, b.author as bookAuthor,
			c.title as chapterTitle, c.chapter_number as chapterNumber
		FROM passages p
		JOIN books b ON p.book_id = b.id
		LEFT JOIN chapters c ON p.chapter_id = c.id
		WHERE p.book_id = ?
		ORDER BY p.passage_number
	`;

	if (limit) {
		sql += ` LIMIT ${limit}`;
	}

	return database.prepare(sql).all(bookId) as PassageWithContext[];
}

/**
 * Get book inventory for including in prompts.
 */
export interface BookInventory {
	totalBooks: number;
	totalPassages: number;
	byLanguage: Record<string, number>;
	books: {
		id: number;
		title: string;
		author: string;
		language: string;
		passageCount: number;
		summary?: string;
	}[];
}

export function getBookInventory(): BookInventory {
	const database = initBookDatabase();

	const totalBooks = (
		database.prepare("SELECT COUNT(*) as count FROM books").get() as { count: number }
	).count;

	const totalPassages = (
		database.prepare("SELECT COUNT(*) as count FROM passages").get() as { count: number }
	).count;

	const languageRows = database
		.prepare("SELECT language, COUNT(*) as count FROM books GROUP BY language")
		.all() as { language: string; count: number }[];

	const byLanguage: Record<string, number> = {};
	for (const row of languageRows) {
		byLanguage[row.language] = row.count;
	}

	const books = database
		.prepare(
			`SELECT id, title, author, language, total_passages as passageCount, summary
			 FROM books ORDER BY title`,
		)
		.all() as {
		id: number;
		title: string;
		author: string;
		language: string;
		passageCount: number;
		summary: string | null;
	}[];

	return {
		totalBooks,
		totalPassages,
		byLanguage,
		books: books.map((b) => ({
			...b,
			summary: b.summary ?? undefined,
		})),
	};
}

/**
 * Builds an FTS5 query from user input with prefix matching.
 */
function buildBooksFts5Query(query: string): string {
	const tokens = query
		.split(/\s+/)
		.filter((t) => t.length > 0);
	if (tokens.length === 0) return "";
	return tokens
		.map((token) => `"${token.replace(/"/g, '""')}"*`)
		.join(" ");
}

/**
 * Text-based search using FTS5 with BM25 ranking.
 * No embeddings needed (FREE).
 */
export function searchPassagesText(
	query: string,
	options: { limit?: number; bookId?: number } = {},
): PassageWithContext[] {
	const { limit = 10, bookId } = options;
	const database = initBookDatabase();

	const ftsQuery = buildBooksFts5Query(query);
	if (!ftsQuery) return [];

	let sql = `
		SELECT
			p.id, p.book_id as bookId, p.chapter_id as chapterId,
			p.passage_number as passageNumber, p.text,
			p.start_position as startPosition, p.end_position as endPosition,
			b.title as bookTitle, b.author as bookAuthor,
			c.title as chapterTitle, c.chapter_number as chapterNumber
		FROM passages_fts fts
		JOIN passages p ON p.id = fts.rowid
		JOIN books b ON p.book_id = b.id
		LEFT JOIN chapters c ON p.chapter_id = c.id
		WHERE passages_fts MATCH ?
	`;

	const params: (string | number)[] = [ftsQuery];

	if (bookId !== undefined) {
		sql += " AND p.book_id = ?";
		params.push(bookId);
	}

	sql += " ORDER BY rank LIMIT ?";
	params.push(limit);

	return database.prepare(sql).all(...params) as PassageWithContext[];
}
