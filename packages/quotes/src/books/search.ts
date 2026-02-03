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

	sql += ` ORDER BY distance ASC LIMIT ?`;
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
 */
export async function searchConcepts(
	query: string,
	options: ConceptSearchOptions = {},
): Promise<ConceptMatch[]> {
	const {
		limit = 10,
		minScore = 0.3,
		bookId,
		includeBookSummaries = true,
		includeChapterSummaries = true,
	} = options;

	const database = initBookDatabase();

	// Generate query embedding locally (FREE)
	const queryEmbedding = await generateLocalEmbedding(query, "query");
	const queryBuffer = Buffer.from(new Uint8Array(queryEmbedding.buffer));

	const results: ConceptMatch[] = [];

	// Search summary embeddings
	const sql = `
		SELECT
			m.entity_type as entityType,
			m.entity_id as entityId,
			vec_distance_cosine(e.embedding, ?) as distance
		FROM summary_embeddings e
		JOIN summary_embedding_meta m ON e.rowid = m.id
		ORDER BY distance ASC
		LIMIT ?
	`;

	const rows = database.prepare(sql).all(queryBuffer, limit * 3) as {
		entityType: "book" | "chapter";
		entityId: number;
		distance: number;
	}[];

	for (const row of rows) {
		const score = 1 - row.distance;
		if (score < minScore) continue;

		if (row.entityType === "book" && includeBookSummaries) {
			const book = database
				.prepare(
					`SELECT id, title, author, summary, key_concepts as keyConcepts
					 FROM books WHERE id = ?`,
				)
				.get(row.entityId) as
				| {
						id: number;
						title: string;
						author: string;
						summary: string;
						keyConcepts: string;
				  }
				| undefined;

			if (book && (!bookId || book.id === bookId)) {
				results.push({
					type: "book",
					entityId: book.id,
					bookId: book.id,
					bookTitle: book.title,
					bookAuthor: book.author,
					summary: book.summary ?? "",
					keyConcepts: JSON.parse(book.keyConcepts || "[]"),
					score,
				});
			}
		} else if (row.entityType === "chapter" && includeChapterSummaries) {
			const chapter = database
				.prepare(
					`SELECT c.id, c.book_id as bookId, c.chapter_number as chapterNumber,
							c.title, c.summary, c.key_concepts as keyConcepts,
							b.title as bookTitle, b.author as bookAuthor
					 FROM chapters c
					 JOIN books b ON c.book_id = b.id
					 WHERE c.id = ?`,
				)
				.get(row.entityId) as
				| {
						id: number;
						bookId: number;
						chapterNumber: number;
						title: string | null;
						summary: string;
						keyConcepts: string;
						bookTitle: string;
						bookAuthor: string;
				  }
				| undefined;

			if (chapter && (!bookId || chapter.bookId === bookId)) {
				results.push({
					type: "chapter",
					entityId: chapter.id,
					bookId: chapter.bookId,
					bookTitle: chapter.bookTitle,
					bookAuthor: chapter.bookAuthor,
					chapterNumber: chapter.chapterNumber,
					chapterTitle: chapter.title ?? undefined,
					summary: chapter.summary ?? "",
					keyConcepts: JSON.parse(chapter.keyConcepts || "[]"),
					score,
				});
			}
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
	const combined = passages.map((passage) => {
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
		.prepare(`SELECT language, COUNT(*) as count FROM books GROUP BY language`)
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
 * Text-based search (for exact phrase matching).
 * No embeddings needed (FREE).
 */
export function searchPassagesText(
	query: string,
	options: { limit?: number; bookId?: number } = {},
): PassageWithContext[] {
	const { limit = 10, bookId } = options;
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
		WHERE p.text LIKE ?
	`;

	const params: (string | number)[] = [`%${query}%`];

	if (bookId !== undefined) {
		sql += ` AND p.book_id = ?`;
		params.push(bookId);
	}

	sql += ` LIMIT ?`;
	params.push(limit);

	return database.prepare(sql).all(...params) as PassageWithContext[];
}
