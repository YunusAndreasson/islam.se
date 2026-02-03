import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const DB_PATH = join(PROJECT_ROOT, "data", "books.db");
const EMBEDDING_DIMENSIONS = 384; // Local multilingual-e5-small model

// ============================================================================
// Types
// ============================================================================

export interface Book {
	id: number;
	title: string;
	author: string;
	language: "sv" | "ar" | "en";
	sourceUrl: string;
	summary: string | null;
	keyConcepts: string[];
	totalChapters: number;
	totalPassages: number;
	importedAt: string;
}

export interface Chapter {
	id: number;
	bookId: number;
	chapterNumber: number;
	title: string | null;
	summary: string | null;
	keyConcepts: string[];
	startPosition: number;
	endPosition: number;
}

export interface Passage {
	id: number;
	bookId: number;
	chapterId: number | null;
	passageNumber: number;
	text: string;
	startPosition: number;
	endPosition: number;
}

export interface PassageWithContext extends Passage {
	bookTitle: string;
	bookAuthor: string;
	chapterTitle: string | null;
	chapterNumber: number | null;
}

export interface PassageWithScore extends PassageWithContext {
	score: number;
}

export interface ChapterWithScore extends Chapter {
	bookTitle: string;
	bookAuthor: string;
	score: number;
}

export interface BookWithScore extends Book {
	score: number;
}

// ============================================================================
// Database Singleton
// ============================================================================

let db: Database.Database | null = null;

export function initBookDatabase(): Database.Database {
	if (db) {
		return db;
	}

	const dbDir = dirname(DB_PATH);
	if (!existsSync(dbDir)) {
		mkdirSync(dbDir, { recursive: true });
	}

	db = new Database(DB_PATH);
	db.pragma("journal_mode = WAL");
	sqliteVec.load(db);

	// Books table
	db.exec(`
		CREATE TABLE IF NOT EXISTS books (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL,
			author TEXT NOT NULL,
			language TEXT NOT NULL DEFAULT 'sv',
			source_url TEXT NOT NULL UNIQUE,
			summary TEXT,
			key_concepts TEXT DEFAULT '[]',
			total_chapters INTEGER DEFAULT 0,
			total_passages INTEGER DEFAULT 0,
			imported_at TEXT DEFAULT (datetime('now'))
		)
	`);

	// Chapters table
	db.exec(`
		CREATE TABLE IF NOT EXISTS chapters (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			book_id INTEGER NOT NULL,
			chapter_number INTEGER NOT NULL,
			title TEXT,
			summary TEXT,
			key_concepts TEXT DEFAULT '[]',
			start_position INTEGER NOT NULL,
			end_position INTEGER NOT NULL,
			FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
			UNIQUE(book_id, chapter_number)
		)
	`);

	// Passages table
	db.exec(`
		CREATE TABLE IF NOT EXISTS passages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			book_id INTEGER NOT NULL,
			chapter_id INTEGER,
			passage_number INTEGER NOT NULL,
			text TEXT NOT NULL,
			start_position INTEGER NOT NULL,
			end_position INTEGER NOT NULL,
			FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
			FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
		)
	`);

	// Passage embeddings (for exact text search)
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS passage_embeddings USING vec0(
			embedding float[${EMBEDDING_DIMENSIONS}]
		)
	`);

	// Summary embeddings (for concept/thematic search)
	// Stores embeddings for both chapter summaries and book summaries
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS summary_embeddings USING vec0(
			embedding float[${EMBEDDING_DIMENSIONS}]
		)
	`);

	// Summary embedding metadata (links rowid to chapter/book)
	db.exec(`
		CREATE TABLE IF NOT EXISTS summary_embedding_meta (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			entity_type TEXT NOT NULL,
			entity_id INTEGER NOT NULL,
			UNIQUE(entity_type, entity_id)
		)
	`);

	// Create indexes for performance
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
		CREATE INDEX IF NOT EXISTS idx_passages_book_id ON passages(book_id);
		CREATE INDEX IF NOT EXISTS idx_passages_chapter_id ON passages(chapter_id);
		CREATE INDEX IF NOT EXISTS idx_summary_meta_entity ON summary_embedding_meta(entity_type, entity_id);
	`);

	return db;
}

// ============================================================================
// Book Operations
// ============================================================================

export function insertBook(book: Omit<Book, "id" | "importedAt">): number {
	const database = initBookDatabase();

	const stmt = database.prepare(`
		INSERT INTO books (title, author, language, source_url, summary, key_concepts, total_chapters, total_passages)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`);

	const result = stmt.run(
		book.title,
		book.author,
		book.language,
		book.sourceUrl,
		book.summary ?? null,
		JSON.stringify(book.keyConcepts ?? []),
		book.totalChapters,
		book.totalPassages,
	);

	return result.lastInsertRowid as number;
}

export function updateBook(
	bookId: number,
	updates: Partial<Pick<Book, "summary" | "keyConcepts" | "totalChapters" | "totalPassages">>,
): void {
	const database = initBookDatabase();

	const fields: string[] = [];
	const values: (string | number | null)[] = [];

	if (updates.summary !== undefined) {
		fields.push("summary = ?");
		values.push(updates.summary);
	}
	if (updates.keyConcepts !== undefined) {
		fields.push("key_concepts = ?");
		values.push(JSON.stringify(updates.keyConcepts));
	}
	if (updates.totalChapters !== undefined) {
		fields.push("total_chapters = ?");
		values.push(updates.totalChapters);
	}
	if (updates.totalPassages !== undefined) {
		fields.push("total_passages = ?");
		values.push(updates.totalPassages);
	}

	if (fields.length === 0) return;

	values.push(bookId);
	const stmt = database.prepare(`UPDATE books SET ${fields.join(", ")} WHERE id = ?`);
	stmt.run(...values);
}

export function getBook(id: number): Book | null {
	const database = initBookDatabase();
	const stmt = database.prepare(`
		SELECT id, title, author, language, source_url as sourceUrl, summary,
			   key_concepts as keyConcepts, total_chapters as totalChapters,
			   total_passages as totalPassages, imported_at as importedAt
		FROM books WHERE id = ?
	`);
	const row = stmt.get(id) as (Omit<Book, "keyConcepts"> & { keyConcepts: string }) | undefined;
	if (!row) return null;
	return { ...row, keyConcepts: JSON.parse(row.keyConcepts) };
}

export function getBookByUrl(sourceUrl: string): Book | null {
	const database = initBookDatabase();
	const stmt = database.prepare(`
		SELECT id, title, author, language, source_url as sourceUrl, summary,
			   key_concepts as keyConcepts, total_chapters as totalChapters,
			   total_passages as totalPassages, imported_at as importedAt
		FROM books WHERE source_url = ?
	`);
	const row = stmt.get(sourceUrl) as
		| (Omit<Book, "keyConcepts"> & { keyConcepts: string })
		| undefined;
	if (!row) return null;
	return { ...row, keyConcepts: JSON.parse(row.keyConcepts) };
}

export function getAllBooks(): Book[] {
	const database = initBookDatabase();
	const stmt = database.prepare(`
		SELECT id, title, author, language, source_url as sourceUrl, summary,
			   key_concepts as keyConcepts, total_chapters as totalChapters,
			   total_passages as totalPassages, imported_at as importedAt
		FROM books ORDER BY imported_at DESC
	`);
	const rows = stmt.all() as (Omit<Book, "keyConcepts"> & { keyConcepts: string })[];
	return rows.map((row) => ({ ...row, keyConcepts: JSON.parse(row.keyConcepts) }));
}

export function deleteBook(id: number): void {
	const database = initBookDatabase();

	// Delete associated embeddings first
	const passages = database.prepare("SELECT id FROM passages WHERE book_id = ?").all(id) as {
		id: number;
	}[];
	for (const passage of passages) {
		database.prepare("DELETE FROM passage_embeddings WHERE rowid = ?").run(passage.id);
	}

	// Delete summary embeddings
	const chapterMetas = database
		.prepare(
			"SELECT id FROM summary_embedding_meta WHERE entity_type = 'chapter' AND entity_id IN (SELECT id FROM chapters WHERE book_id = ?)",
		)
		.all(id) as { id: number }[];
	for (const meta of chapterMetas) {
		database.prepare("DELETE FROM summary_embeddings WHERE rowid = ?").run(meta.id);
	}
	database
		.prepare(
			"DELETE FROM summary_embedding_meta WHERE entity_type = 'chapter' AND entity_id IN (SELECT id FROM chapters WHERE book_id = ?)",
		)
		.run(id);

	const bookMeta = database
		.prepare("SELECT id FROM summary_embedding_meta WHERE entity_type = 'book' AND entity_id = ?")
		.get(id) as { id: number } | undefined;
	if (bookMeta) {
		database.prepare("DELETE FROM summary_embeddings WHERE rowid = ?").run(bookMeta.id);
		database
			.prepare("DELETE FROM summary_embedding_meta WHERE entity_type = 'book' AND entity_id = ?")
			.run(id);
	}

	// Delete book (cascades to chapters and passages)
	database.prepare("DELETE FROM books WHERE id = ?").run(id);
}

// ============================================================================
// Chapter Operations
// ============================================================================

export function insertChapter(chapter: Omit<Chapter, "id">): number {
	const database = initBookDatabase();

	const stmt = database.prepare(`
		INSERT INTO chapters (book_id, chapter_number, title, summary, key_concepts, start_position, end_position)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);

	const result = stmt.run(
		chapter.bookId,
		chapter.chapterNumber,
		chapter.title ?? null,
		chapter.summary ?? null,
		JSON.stringify(chapter.keyConcepts ?? []),
		chapter.startPosition,
		chapter.endPosition,
	);

	return result.lastInsertRowid as number;
}

export function updateChapter(
	chapterId: number,
	updates: Partial<Pick<Chapter, "summary" | "keyConcepts">>,
): void {
	const database = initBookDatabase();

	const fields: string[] = [];
	const values: (string | null)[] = [];

	if (updates.summary !== undefined) {
		fields.push("summary = ?");
		values.push(updates.summary);
	}
	if (updates.keyConcepts !== undefined) {
		fields.push("key_concepts = ?");
		values.push(JSON.stringify(updates.keyConcepts));
	}

	if (fields.length === 0) return;

	values.push(String(chapterId));
	const stmt = database.prepare(`UPDATE chapters SET ${fields.join(", ")} WHERE id = ?`);
	stmt.run(...values);
}

export function getChaptersByBook(bookId: number): Chapter[] {
	const database = initBookDatabase();
	const stmt = database.prepare(`
		SELECT id, book_id as bookId, chapter_number as chapterNumber, title, summary,
			   key_concepts as keyConcepts, start_position as startPosition, end_position as endPosition
		FROM chapters WHERE book_id = ? ORDER BY chapter_number
	`);
	const rows = stmt.all(bookId) as (Omit<Chapter, "keyConcepts"> & { keyConcepts: string })[];
	return rows.map((row) => ({ ...row, keyConcepts: JSON.parse(row.keyConcepts) }));
}

// ============================================================================
// Passage Operations
// ============================================================================

export function insertPassage(passage: Omit<Passage, "id">): number {
	const database = initBookDatabase();

	const stmt = database.prepare(`
		INSERT INTO passages (book_id, chapter_id, passage_number, text, start_position, end_position)
		VALUES (?, ?, ?, ?, ?, ?)
	`);

	const result = stmt.run(
		passage.bookId,
		passage.chapterId ?? null,
		passage.passageNumber,
		passage.text,
		passage.startPosition,
		passage.endPosition,
	);

	return result.lastInsertRowid as number;
}

export function getPassage(id: number): PassageWithContext | null {
	const database = initBookDatabase();
	const stmt = database.prepare(`
		SELECT p.id, p.book_id as bookId, p.chapter_id as chapterId, p.passage_number as passageNumber,
			   p.text, p.start_position as startPosition, p.end_position as endPosition,
			   b.title as bookTitle, b.author as bookAuthor,
			   c.title as chapterTitle, c.chapter_number as chapterNumber
		FROM passages p
		JOIN books b ON p.book_id = b.id
		LEFT JOIN chapters c ON p.chapter_id = c.id
		WHERE p.id = ?
	`);
	return stmt.get(id) as PassageWithContext | null;
}

export function getPassagesByBook(bookId: number): Passage[] {
	const database = initBookDatabase();
	const stmt = database.prepare(`
		SELECT id, book_id as bookId, chapter_id as chapterId, passage_number as passageNumber,
			   text, start_position as startPosition, end_position as endPosition
		FROM passages WHERE book_id = ? ORDER BY passage_number
	`);
	return stmt.all(bookId) as Passage[];
}

export function getPassagesByChapter(chapterId: number): Passage[] {
	const database = initBookDatabase();
	const stmt = database.prepare(`
		SELECT id, book_id as bookId, chapter_id as chapterId, passage_number as passageNumber,
			   text, start_position as startPosition, end_position as endPosition
		FROM passages WHERE chapter_id = ? ORDER BY passage_number
	`);
	return stmt.all(chapterId) as Passage[];
}

// ============================================================================
// Embedding Operations
// ============================================================================

export function insertPassageEmbedding(passageId: number, embedding: Float32Array): void {
	const database = initBookDatabase();
	const stmt = database.prepare(`
		INSERT INTO passage_embeddings (rowid, embedding)
		VALUES (${passageId}, ?)
	`);
	const buffer = Buffer.from(new Uint8Array(embedding.buffer));
	stmt.run(buffer);
}

export function insertSummaryEmbedding(
	entityType: "book" | "chapter",
	entityId: number,
	embedding: Float32Array,
): void {
	const database = initBookDatabase();

	// Insert metadata first to get the rowid
	const metaStmt = database.prepare(`
		INSERT INTO summary_embedding_meta (entity_type, entity_id)
		VALUES (?, ?)
	`);
	const metaResult = metaStmt.run(entityType, entityId);
	const rowid = metaResult.lastInsertRowid as number;

	// Insert embedding with matching rowid
	const embStmt = database.prepare(`
		INSERT INTO summary_embeddings (rowid, embedding)
		VALUES (${rowid}, ?)
	`);
	const buffer = Buffer.from(new Uint8Array(embedding.buffer));
	embStmt.run(buffer);
}

// ============================================================================
// Statistics
// ============================================================================

export interface BookDatabaseStats {
	totalBooks: number;
	totalChapters: number;
	totalPassages: number;
	byLanguage: {
		swedish: number;
		arabic: number;
		english: number;
	};
	totalCharsIndexed: number;
}

export function getBookStats(): BookDatabaseStats {
	const database = initBookDatabase();

	// Get all counts in a single query
	const totals = database
		.prepare(
			`SELECT
				(SELECT COUNT(*) FROM books) as totalBooks,
				(SELECT COUNT(*) FROM chapters) as totalChapters,
				(SELECT COUNT(*) FROM passages) as totalPassages,
				(SELECT COALESCE(SUM(LENGTH(text)), 0) FROM passages) as totalCharsIndexed`,
		)
		.get() as {
		totalBooks: number;
		totalChapters: number;
		totalPassages: number;
		totalCharsIndexed: number;
	};

	// Language breakdown with GROUP BY (single query instead of 3)
	const languageCounts = database
		.prepare("SELECT language, COUNT(*) as count FROM books GROUP BY language")
		.all() as { language: string; count: number }[];
	const byLanguageMap = new Map(languageCounts.map((r) => [r.language, r.count]));

	return {
		totalBooks: totals.totalBooks,
		totalChapters: totals.totalChapters,
		totalPassages: totals.totalPassages,
		byLanguage: {
			swedish: byLanguageMap.get("sv") ?? 0,
			arabic: byLanguageMap.get("ar") ?? 0,
			english: byLanguageMap.get("en") ?? 0,
		},
		totalCharsIndexed: totals.totalCharsIndexed,
	};
}

// ============================================================================
// Transaction Helpers
// ============================================================================

/**
 * Begins a database transaction for bulk operations.
 * Wrap multiple inserts in a transaction for 10-50x speedup.
 */
export function beginBookTransaction(): void {
	const database = initBookDatabase();
	database.exec("BEGIN TRANSACTION");
}

/**
 * Commits the current transaction.
 */
export function commitBookTransaction(): void {
	const database = initBookDatabase();
	database.exec("COMMIT");
}

/**
 * Rolls back the current transaction.
 */
export function rollbackBookTransaction(): void {
	const database = initBookDatabase();
	database.exec("ROLLBACK");
}

/**
 * Executes a function within a transaction.
 * Automatically commits on success or rolls back on error.
 */
export function runInBookTransaction<T>(fn: () => T): T {
	beginBookTransaction();
	try {
		const result = fn();
		commitBookTransaction();
		return result;
	} catch (error) {
		rollbackBookTransaction();
		throw error;
	}
}

// ============================================================================
// Cleanup
// ============================================================================

export function closeBookDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
}
