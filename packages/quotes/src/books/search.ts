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
import { authorKey, type BookRef, findBooks, getPassagePages } from "./lookup.js";
import { cleanPassageText } from "./pages.js";

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
	/** Filter by several book IDs (see findBooks) */
	bookIds?: number[];
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
	/** Filter by several book IDs (see findBooks) */
	bookIds?: number[];
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
	const { limit = 10, minScore = 0.3, bookId, bookIds, language } = options;
	if (bookIds && bookIds.length === 0) return [];

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

	if (bookIds !== undefined) {
		conditions.push(`p.book_id IN (${bookIds.map(() => "?").join(", ")})`);
		params.push(...bookIds);
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
		.filter(
			(row) =>
				row.score >= minScore &&
				row.text.length >= 80 && // Skip chapter headings, bismillah, etc.
				!row.text.includes("#META#") &&
				!row.text.includes("DownloadSource"),
		)
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
		bookIds,
		language,
		passageWeight = 0.7,
	} = options;

	// Run both searches in parallel
	const [passages, allConcepts] = await Promise.all([
		searchPassages(query, {
			limit: passageLimit * 2, // Get extra for re-ranking
			minScore,
			bookId,
			bookIds,
			language,
		}),
		searchConcepts(query, {
			limit: conceptLimit,
			minScore,
			bookId,
			language,
		}),
	]);
	const concepts = bookIds ? allConcepts.filter((c) => bookIds.includes(c.bookId)) : allConcepts;

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

/** Query words for FTS5: quote characters and FTS5 syntax stripped, empties dropped. */
function ftsTokens(query: string): string[] {
	return query
		.split(/\s+/)
		.map((token) => token.replace(/["""(){}[\]:^~+\-!*]/g, "").trim())
		.filter((token) => token.length > 0);
}

/**
 * Builds an FTS5 query from user input with prefix matching (every word, any order).
 */
function buildBooksFts5Query(query: string): string {
	return ftsTokens(query)
		.map((token) => `"${token}"*`)
		.join(" ");
}

/**
 * Builds an FTS5 PHRASE query: the words consecutively, in order, no prefix matching.
 * unicode61 splits on punctuation, so OpenITI's `~~` line joins between two words do not
 * break a phrase; a page marker (PageV01P016) or milestone (ms002) between them does.
 */
function buildBooksFts5Phrase(query: string): string {
	const tokens = ftsTokens(query);
	return tokens.length > 0 ? `"${tokens.join(" ")}"` : "";
}

export interface TextSearchOptions {
	limit?: number;
	bookId?: number;
	/** Filter by several book IDs (see findBooks) */
	bookIds?: number[];
	language?: "sv" | "ar" | "en";
	/** Match the words as one consecutive phrase instead of all words anywhere (default: false) */
	phrase?: boolean;
}

/**
 * Text-based search using FTS5 with BM25 ranking.
 * No embeddings needed (FREE).
 */
export function searchPassagesText(
	query: string,
	options: TextSearchOptions = {},
): PassageWithContext[] {
	const { limit = 10, bookId, bookIds, language, phrase = false } = options;
	if (bookIds && bookIds.length === 0) return [];
	const database = initBookDatabase();

	const ftsQuery = phrase ? buildBooksFts5Phrase(query) : buildBooksFts5Query(query);
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

	if (bookIds !== undefined) {
		sql += ` AND p.book_id IN (${bookIds.map(() => "?").join(", ")})`;
		params.push(...bookIds);
	}

	if (language !== undefined) {
		sql += " AND b.language = ?";
		params.push(language);
	}

	sql += " ORDER BY rank LIMIT ?";
	params.push(limit);

	return database.prepare(sql).all(...params) as PassageWithContext[];
}

// ============================================================================
// Filtered search with page references (the `search_books` MCP tool)
// ============================================================================

export interface BookPassageSearchOptions {
	/** "semantic" (default): embedding similarity. "text": FTS5, exact words. */
	mode?: "semantic" | "text";
	/** Case-insensitive substring of the book title (or OpenITI title URI) */
	book?: string;
	/** Case-insensitive substring of the author name (romanized or Arabic script) */
	author?: string;
	languages?: ("sv" | "ar" | "en")[];
	/** Number of passages to return (default: 5) */
	limit?: number;
	/** Cap on passages per author. Default 3 without a book/author filter, none with one. */
	maxPerAuthor?: number;
}

export interface BookPassageHit {
	id: number;
	bookId: number;
	bookTitle: string;
	bookAuthor: string;
	passageNumber: number;
	/** OpenITI markup stripped (the database keeps the raw text). */
	text: string;
	/** Printed page where the passage begins, "volume:page" ("28:390"); null if the edition has none. */
	page: string | null;
	/** Pages the passage spans: "1:16", "1:16–17", "27:412–28:1". */
	pages: string | null;
	/** Text mode: page of the first matched word. */
	matchPage?: string | null;
	/** Semantic similarity (0–1); null in text mode. */
	score: number | null;
}

export interface BookPassageSearchResult {
	mode: "semantic" | "text";
	hits: BookPassageHit[];
	/** The books a book/author filter resolved to (null when no filter was given). */
	books: BookRef[] | null;
	/** Text mode: whether the hits contain the exact phrase or only all of its words. */
	textMatch?: "phrase" | "all-words";
	/** Semantic mode without filters: thematically matching books/chapters (summaries). */
	concepts: ConceptMatch[];
	/**
	 * Semantic mode: whether any passage in the searched books contains all the query's
	 * words. `false` means the hits are nearest by meaning only. Similarity scores cannot
	 * tell a real match from noise in this corpus (every vector sits within a narrow band
	 * of every other), so this is the one signal that a topic may simply be absent.
	 */
	lexicalSupport?: boolean;
}

/**
 * Offset of the matched phrase in a raw passage (for the text-mode page). The words may
 * be separated by OpenITI markup — a `~~` line join, a page marker, a milestone — so the
 * gap between them is matched as any run of those. Falls back to the first word.
 */
function firstMatchOffset(text: string, query: string): number | undefined {
	const tokens = ftsTokens(query);
	const first = tokens[0];
	if (!first) return undefined;
	const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const gap = String.raw`(?:[\s~#|]|PageV\d+P\d+|ms\d+)+`;
	const phrase = new RegExp(String.raw`(?<!\p{L})` + tokens.map(escapeRe).join(gap), "u");
	const m = phrase.exec(text);
	if (m) return m.index;
	const i = text.indexOf(first);
	return i === -1 ? undefined : i;
}

type Candidate = PassageWithContext & { score: number | null };
type Language = "sv" | "ar" | "en" | undefined;

/** Text mode: the exact phrase first; if it occurs nowhere, all of its words anywhere. */
function textCandidates(
	query: string,
	langs: Language[],
	limit: number,
	bookIds: number[] | undefined,
): { candidates: Candidate[]; textMatch: "phrase" | "all-words" } {
	const run = (phrase: boolean): Candidate[] =>
		langs.flatMap((language) =>
			searchPassagesText(query, { limit: limit * 4, bookIds, language, phrase }).map((p) => ({
				...p,
				score: null,
			})),
		);
	const phrase = run(true);
	if (phrase.length > 0 || ftsTokens(query).length < 2) {
		return { candidates: phrase, textMatch: "phrase" };
	}
	return { candidates: run(false), textMatch: "all-words" };
}

/**
 * Reciprocal-rank fusion: a passage scores 1/(60 + rank) in every list it appears in, and
 * the sums decide the order. Ranks are comparable across lists where scores are not (a
 * cosine from one query or language says nothing about a cosine from another, and a text
 * hit has no score at all), so one function merges languages and merges meaning with wording.
 */
export function fuseByRank<T extends { id: number; score: number | null }>(lists: T[][]): T[] {
	const fused = new Map<number, { item: T; weight: number }>();
	for (const list of lists) {
		list.forEach((item, rank) => {
			const weight = 1 / (60 + rank + 1);
			const entry = fused.get(item.id);
			if (!entry) {
				fused.set(item.id, { item, weight });
				return;
			}
			entry.weight += weight;
			// Keep the copy that carries a similarity score, for display.
			if (entry.item.score === null && item.score !== null) entry.item = item;
		});
	}
	return [...fused.values()].sort((a, b) => b.weight - a.weight).map((e) => e.item);
}

/**
 * Semantic mode: passages nearest by meaning, fused with passages that contain the
 * query's words.
 *
 * ⚠️ The ranking used to add a concept boost: 0.3 × the similarity of the book's summary.
 * Only books with a summary can receive it, and 29 Arabic books holding 210 000 of the
 * 230 000 Arabic passages have none (Majmūʿ al-fatāwā, al-Mughnī, both tafsirs, al-Bukhārī,
 * Muslim, the Musnad). Measured 2026-10-04, a boosted passage scored about 0.80 and every
 * other about 0.57, so the large works could not outrank a small summarised book whatever
 * they said. The summaries are still returned as themes; they no longer rank passages.
 */
async function semanticCandidates(
	query: string,
	langs: Language[],
	limit: number,
	bookIds: number[] | undefined,
): Promise<{ candidates: Candidate[]; concepts: ConceptMatch[]; lexicalSupport: boolean }> {
	const results = await Promise.all(
		langs.map((language) =>
			searchBooks(query, { passageLimit: limit * 3, conceptLimit: 3, language, bookIds }),
		),
	);
	const byMeaning: Candidate[][] = results.map((r) => r.passages);
	const byWording: Candidate[][] = langs.map((language) =>
		searchPassagesText(query, { limit: limit * 3, bookIds, language }).map((p) => ({
			...p,
			score: null,
		})),
	);
	const candidates = fuseByRank([...byMeaning, ...byWording]);
	const lexicalSupport = byWording.some((list) => list.length > 0);
	const seen = new Set<string>();
	const concepts = results
		.flatMap((r) => r.concepts)
		.filter((c) => {
			const key = `${c.type}:${c.entityId}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 5);
	return { candidates, concepts, lexicalSupport };
}

/**
 * The first `limit` usable candidates: no metadata, no overlapping neighbour of a passage
 * already taken (consecutive passages share 200 characters — the same locus), at most
 * `maxPerAuthor` per author.
 */
function pickCandidates(candidates: Candidate[], limit: number, maxPerAuthor: number): Candidate[] {
	const taken = new Set<number>();
	const perAuthor = new Map<string, number>();
	const picked: Candidate[] = [];
	for (const p of candidates) {
		if (picked.length >= limit) break;
		if (p.text.includes("#META#") || p.text.includes("DownloadSource")) continue;
		if (taken.has(p.id) || taken.has(p.id - 1) || taken.has(p.id + 1)) continue;
		const author = authorKey(p.bookAuthor);
		const count = perAuthor.get(author) ?? 0;
		if (count >= maxPerAuthor) continue;
		perAuthor.set(author, count + 1);
		taken.add(p.id);
		picked.push(p);
	}
	return picked;
}

/**
 * Passage search with optional book/author filter, semantic or exact-text mode, printed
 * page references and cleaned text. Overlapping neighbours (passages share 200
 * characters) are collapsed so one locus is not returned twice.
 */
export async function searchBookPassages(
	query: string,
	options: BookPassageSearchOptions = {},
): Promise<BookPassageSearchResult> {
	const { mode = "semantic", book, author, languages, limit = 5 } = options;
	const filtered = Boolean(book || author);
	const books = filtered ? findBooks({ book, author }) : null;
	if (books && books.length === 0) {
		return { mode, hits: [], books, concepts: [] };
	}
	const bookIds = books?.map((b) => b.id);
	const maxPerAuthor = options.maxPerAuthor ?? (filtered ? Number.POSITIVE_INFINITY : 3);
	const langs: Language[] = languages && languages.length > 0 ? languages : [undefined];

	const found =
		mode === "text"
			? { ...textCandidates(query, langs, limit, bookIds), concepts: [], lexicalSupport: undefined }
			: { ...(await semanticCandidates(query, langs, limit, bookIds)), textMatch: undefined };

	const hits: BookPassageHit[] = pickCandidates(found.candidates, limit, maxPerAuthor).map((p) => {
		const pages = getPassagePages(p, mode === "text" ? firstMatchOffset(p.text, query) : undefined);
		return {
			id: p.id,
			bookId: p.bookId,
			bookTitle: p.bookTitle,
			bookAuthor: p.bookAuthor,
			passageNumber: p.passageNumber,
			text: cleanPassageText(p.text),
			page: pages.page,
			pages: pages.pages,
			...(mode === "text" ? { matchPage: pages.matchPage ?? null } : {}),
			score: p.score,
		};
	});

	return {
		mode,
		hits,
		books,
		textMatch: found.textMatch,
		concepts: filtered ? [] : found.concepts,
		...(found.lexicalSupport === undefined ? {} : { lexicalSupport: found.lexicalSupport }),
	};
}
