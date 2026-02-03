import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { Quote } from "./extraction/index.js";

// Find the project root (where this package is installed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..");
const DB_PATH = join(PROJECT_ROOT, "data", "quotes.db");
const EMBEDDING_DIMENSIONS = 384; // Local multilingual-e5-small model

export interface StoredQuote {
	id: number;
	text: string;
	author: string;
	workTitle: string;
	category: string;
	keywords: string[];
	tone: string;
	standalone: number;
	length: "short" | "medium" | "long";
	language: "sv" | "ar" | "en";
	sourceType: string | null;
	createdAt: string;
}

export interface QuoteWithScore extends StoredQuote {
	score: number;
}

let db: Database.Database | null = null;

/**
 * Initializes the database with required tables and extensions
 */
export function initDatabase(): Database.Database {
	if (db) {
		return db;
	}

	// Ensure data directory exists
	const dbDir = dirname(DB_PATH);
	if (!existsSync(dbDir)) {
		mkdirSync(dbDir, { recursive: true });
	}

	db = new Database(DB_PATH);

	// Enable WAL mode for better concurrent performance (modern best practice)
	db.pragma("journal_mode = WAL");

	// Load sqlite-vec extension
	sqliteVec.load(db);

	// Create quotes table
	db.exec(`
		CREATE TABLE IF NOT EXISTS quotes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			text TEXT NOT NULL UNIQUE,
			author TEXT NOT NULL,
			work_title TEXT NOT NULL,
			category TEXT,
			keywords TEXT,
			tone TEXT,
			standalone INTEGER,
			length TEXT,
			source_url TEXT,
			language TEXT NOT NULL DEFAULT 'sv',
			source_type TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		)
	`);

	// Migration: Add language column if it doesn't exist (for existing databases)
	try {
		db.exec(`ALTER TABLE quotes ADD COLUMN language TEXT NOT NULL DEFAULT 'sv'`);
	} catch (error) {
		// Only ignore "duplicate column" errors
		if (!(error instanceof Error && error.message.includes("duplicate column"))) {
			throw error;
		}
	}
	try {
		db.exec("ALTER TABLE quotes ADD COLUMN source_type TEXT");
	} catch (error) {
		// Only ignore "duplicate column" errors
		if (!(error instanceof Error && error.message.includes("duplicate column"))) {
			throw error;
		}
	}

	// Create virtual table for vector search
	// vec0 uses rowid implicitly as primary key
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS quote_embeddings USING vec0(
			embedding float[${EMBEDDING_DIMENSIONS}]
		)
	`);

	return db;
}

/**
 * Computes length category based on character count
 */
function computeLength(text: string): "short" | "medium" | "long" {
	const len = text.length;
	if (len < 50) return "short";
	if (len < 150) return "medium";
	return "long";
}

export interface InsertQuoteOptions {
	sourceUrl?: string;
	language?: "sv" | "ar" | "en";
	sourceType?: "gutenberg" | "openiti" | string;
}

/**
 * Inserts a quote into the database
 * Returns the quote ID, or null if the quote already exists
 */
export function insertQuote(quote: Quote, options?: InsertQuoteOptions | string): number | null {
	const database = initDatabase();

	// Handle backward compatibility: if options is a string, treat it as sourceUrl
	const opts: InsertQuoteOptions =
		typeof options === "string" ? { sourceUrl: options } : (options ?? {});

	try {
		const stmt = database.prepare(`
			INSERT INTO quotes (text, author, work_title, category, keywords, tone, standalone, length, source_url, language, source_type)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const result = stmt.run(
			quote.text,
			quote.author,
			quote.workTitle,
			quote.category ?? null,
			JSON.stringify(quote.keywords ?? []),
			quote.tone ?? null,
			quote.standalone ?? null,
			computeLength(quote.text),
			opts.sourceUrl ?? null,
			opts.language ?? "sv",
			opts.sourceType ?? null,
		);

		return result.lastInsertRowid as number;
	} catch (error) {
		// Handle unique constraint violation (quote already exists)
		if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
			return null;
		}
		throw error;
	}
}

/**
 * Stores an embedding for a quote
 */
export function insertEmbedding(quoteId: number, embedding: Float32Array): void {
	const database = initDatabase();

	// Note: sqlite-vec doesn't accept rowid as a parameter, must be in SQL string
	const stmt = database.prepare(`
		INSERT INTO quote_embeddings (rowid, embedding)
		VALUES (${quoteId}, ?)
	`);

	// Convert Float32Array to Buffer via Uint8Array for better-sqlite3
	const buffer = Buffer.from(new Uint8Array(embedding.buffer));
	stmt.run(buffer);
}

export interface RawQuoteRow {
	id: number;
	text: string;
	author: string;
	workTitle: string;
	category: string;
	keywords: string;
	tone: string;
	standalone: number;
	length: "short" | "medium" | "long";
	language: "sv" | "ar" | "en";
	sourceType: string | null;
	createdAt: string;
}

export function parseQuoteRow(row: RawQuoteRow): StoredQuote {
	return {
		...row,
		keywords: JSON.parse(row.keywords || "[]") as string[],
	};
}

/**
 * Gets a quote by ID
 */
export function getQuote(id: number): StoredQuote | null {
	const database = initDatabase();

	const stmt = database.prepare(`
		SELECT id, text, author, work_title as workTitle, category, keywords, tone, standalone, length, created_at as createdAt
		FROM quotes
		WHERE id = ?
	`);

	const row = stmt.get(id) as RawQuoteRow | undefined;
	return row ? parseQuoteRow(row) : null;
}

/**
 * Gets all quotes
 */
export function getAllQuotes(): StoredQuote[] {
	const database = initDatabase();

	const stmt = database.prepare(`
		SELECT id, text, author, work_title as workTitle, category, keywords, tone, standalone, length, created_at as createdAt
		FROM quotes
		ORDER BY created_at DESC
	`);

	return (stmt.all() as RawQuoteRow[]).map(parseQuoteRow);
}

export interface DatabaseStats {
	totalQuotes: number;
	authors: number;
	works: number;
	byLanguage: {
		swedish: number;
		arabic: number;
		norse: number;
	};
	bySourceType: {
		gutenberg: number;
		openiti: number;
		other: number;
	};
}

/**
 * Gets database statistics
 */
export function getStats(): DatabaseStats {
	const database = initDatabase();

	// Get totals, distinct authors, and distinct works in one query
	const totals = database
		.prepare(
			`SELECT
				COUNT(*) as totalQuotes,
				COUNT(DISTINCT author) as authors,
				COUNT(DISTINCT work_title) as works
			FROM quotes`,
		)
		.get() as { totalQuotes: number; authors: number; works: number };

	// Language breakdown with GROUP BY (single query instead of 3)
	const languageCounts = database
		.prepare("SELECT language, COUNT(*) as count FROM quotes GROUP BY language")
		.all() as { language: string; count: number }[];
	const byLanguageMap = new Map(languageCounts.map((r) => [r.language, r.count]));

	// Source type breakdown with GROUP BY (single query instead of 2)
	const sourceTypeCounts = database
		.prepare("SELECT source_type, COUNT(*) as count FROM quotes GROUP BY source_type")
		.all() as { source_type: string | null; count: number }[];
	const bySourceMap = new Map(sourceTypeCounts.map((r) => [r.source_type, r.count]));

	const gutenbergQuotes = bySourceMap.get("gutenberg") ?? 0;
	const openitiQuotes = bySourceMap.get("openiti") ?? 0;
	const otherQuotes = totals.totalQuotes - gutenbergQuotes - openitiQuotes;

	return {
		totalQuotes: totals.totalQuotes,
		authors: totals.authors,
		works: totals.works,
		byLanguage: {
			swedish: byLanguageMap.get("sv") ?? 0,
			arabic: byLanguageMap.get("ar") ?? 0,
			norse: byLanguageMap.get("en") ?? 0,
		},
		bySourceType: {
			gutenberg: gutenbergQuotes,
			openiti: openitiQuotes,
			other: otherQuotes,
		},
	};
}

/**
 * Gets unique source URLs for quotes with Unknown author
 */
export function getUnknownAuthorSourceUrls(): string[] {
	if (!db) {
		throw new Error("Database not initialized. Call initDatabase() first.");
	}

	const rows = db
		.prepare(
			`SELECT DISTINCT source_url FROM quotes
			 WHERE (author = 'Unknown' OR author IS NULL OR author = '')
			 AND source_url IS NOT NULL
			 AND source_url != ''`,
		)
		.all() as { source_url: string }[];

	return rows.map((r) => r.source_url);
}

/**
 * Updates author and work_title for all quotes from a given source URL
 */
export function updateQuoteMetadataBySource(
	sourceUrl: string,
	metadata: { author?: string; title?: string },
): number {
	if (!db) {
		throw new Error("Database not initialized. Call initDatabase() first.");
	}

	let updated = 0;

	if (metadata.author) {
		const result = db
			.prepare(
				`UPDATE quotes SET author = ?
				 WHERE source_url = ?
				 AND (author = 'Unknown' OR author IS NULL OR author = '')`,
			)
			.run(metadata.author, sourceUrl);
		updated = result.changes;
	}

	if (metadata.title) {
		db.prepare(
			`UPDATE quotes SET work_title = ?
			 WHERE source_url = ?
			 AND (work_title = 'Unknown' OR work_title IS NULL OR work_title = '')`,
		).run(metadata.title, sourceUrl);
	}

	return updated;
}

// ============================================================================
// Transaction Helpers
// ============================================================================

/**
 * Begins a database transaction for bulk operations.
 * Wrap multiple inserts in a transaction for 10-50x speedup.
 */
export function beginTransaction(): void {
	const database = initDatabase();
	database.exec("BEGIN TRANSACTION");
}

/**
 * Commits the current transaction.
 */
export function commitTransaction(): void {
	const database = initDatabase();
	database.exec("COMMIT");
}

/**
 * Rolls back the current transaction.
 */
export function rollbackTransaction(): void {
	const database = initDatabase();
	database.exec("ROLLBACK");
}

/**
 * Executes a function within a transaction.
 * Automatically commits on success or rolls back on error.
 */
export function runInTransaction<T>(fn: () => T): T {
	beginTransaction();
	try {
		const result = fn();
		commitTransaction();
		return result;
	} catch (error) {
		rollbackTransaction();
		throw error;
	}
}

/**
 * Closes the database connection
 */
export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
}
