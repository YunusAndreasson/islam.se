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

	// Performance pragmas
	db.pragma("journal_mode = WAL");
	db.pragma("synchronous = NORMAL");
	db.pragma("cache_size = -64000");
	db.pragma("foreign_keys = ON");

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

	// FTS5 full-text search (external content, synced via triggers)
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS quotes_fts USING fts5(
			text, author, work_title, keywords,
			content='quotes', content_rowid='id',
			tokenize='unicode61'
		)
	`);

	// Triggers to keep FTS5 in sync with quotes table
	db.exec(`
		CREATE TRIGGER IF NOT EXISTS quotes_fts_ai AFTER INSERT ON quotes BEGIN
			INSERT INTO quotes_fts(rowid, text, author, work_title, keywords)
			VALUES (new.id, new.text, new.author, new.work_title, new.keywords);
		END;

		CREATE TRIGGER IF NOT EXISTS quotes_fts_au AFTER UPDATE ON quotes BEGIN
			INSERT INTO quotes_fts(quotes_fts, rowid, text, author, work_title, keywords)
			VALUES ('delete', old.id, old.text, old.author, old.work_title, old.keywords);
			INSERT INTO quotes_fts(rowid, text, author, work_title, keywords)
			VALUES (new.id, new.text, new.author, new.work_title, new.keywords);
		END;

		CREATE TRIGGER IF NOT EXISTS quotes_fts_ad AFTER DELETE ON quotes BEGIN
			INSERT INTO quotes_fts(quotes_fts, rowid, text, author, work_title, keywords)
			VALUES ('delete', old.id, old.text, old.author, old.work_title, old.keywords);
		END;
	`);

	// Indexes for common query patterns (filter, text, and vector search WHERE clauses)
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_quotes_language_standalone ON quotes(language, standalone);
		CREATE INDEX IF NOT EXISTS idx_quotes_author ON quotes(author);
		CREATE INDEX IF NOT EXISTS idx_quotes_category ON quotes(category);
		CREATE INDEX IF NOT EXISTS idx_quotes_standalone ON quotes(standalone);
	`);

	// One-time migration: normalize Swedish categories to English
	// Check if migration is needed (presence of Swedish category "karaktär")
	const needsCategoryMigration = (
		db.prepare("SELECT COUNT(*) as c FROM quotes WHERE category = 'karaktär'").get() as {
			c: number;
		}
	).c;
	if (needsCategoryMigration > 0) {
		normalizeCategoryLanguages(db);
	}

	// One-time migration: fix Norse quotes misclassified as Swedish
	const needsNorseFix = (
		db
			.prepare(
				"SELECT COUNT(*) as c FROM quotes WHERE language = 'sv' AND author = 'Sæmundur fróði'",
			)
			.get() as { c: number }
	).c;
	if (needsNorseFix > 0) {
		reclassifyNorseQuotes(db);
	}

	// One-time migration: fix romanized Arabic work titles
	const needsTitleFix = (
		db
			.prepare(
				"SELECT COUNT(*) as c FROM quotes WHERE language = 'ar' AND work_title = 'MadarijSalikin'",
			)
			.get() as { c: number }
	).c;
	if (needsTitleFix > 0) {
		fixRomanizedArabicTitles(db);
	}

	return db;
}

/**
 * Normalizes all categories to English. Swedish categories are mapped to English equivalents.
 * Misspelled variants (especially of "självrannsakan") are also normalized.
 */
function normalizeCategoryLanguages(database: Database.Database): void {
	const mapping: Record<string, string> = {
		// Main Swedish → English
		karaktär: "character",
		kunskap: "knowledge",
		tro: "faith",
		döden: "death",
		prövningar: "trials",
		rättvisa: "justice",
		kärlek: "love",
		mening: "meaning",
		ödmjukhet: "humility",
		gemenskap: "community",
		visdom: "wisdom",
		övrigt: "other",
		hopp: "hope",
		barmhärtighet: "mercy",
		högmod: "pride",
		naturen: "nature",
		tålamod: "patience",
		självrannsakan: "self-accountability",
		girighet: "greed",
		tacksamhet: "gratitude",
		frihet: "freedom",
		ensamhet: "solitude",
		varning: "warning",
		samvete: "conscience",
		skam: "shame",
		sorg: "grief",
		lidande: "suffering",
		hopplöshet: "despair",
		fruktan: "fear",
		ungdom: "youth",
		längtan: "longing",
		ironi: "irony",
		öde: "fate",
		minne: "memory",
		resignation: "resignation",
		manipulation: "manipulation",
		mod: "courage",
		sanning: "truth",
		moderskap: "motherhood",
		förändring: "change",
		förtvivlan: "despair",
		försoning: "reconciliation",
		tröst: "solace",
		makt: "power",
		förfall: "decay",
		skuld: "guilt",
		lycka: "happiness",
		glädje: "joy",
		förnyelse: "renewal",
		desperation: "despair",
		arv: "legacy",
		äktenskap: "marriage",
		styrka: "strength",
		skönhet: "beauty",
		skapande: "creation",
		moral: "morality",
		förlåtelse: "forgiveness",
		fred: "peace",
		dygd: "virtue",
		ansvar: "responsibility",
		andlighet: "spirituality",
		bön: "supplication",
		etik: "ethics",
		fattigdom: "poverty",
		frestelse: "temptation",
		insikt: "insight",
		medkänsla: "compassion",
		plikt: "duty",
		respekt: "respect",
		ångest: "anguish",
		stolthet: "pride",
		tvivel: "doubt",
		rädsla: "fear",
		smärta: "pain",
		ärlighet: "honesty",
		integritet: "integrity",
		omsorg: "care",
		falskhet: "hypocrisy",
		befrielse: "liberation",
	};

	const stmt = database.prepare("UPDATE quotes SET category = ? WHERE category = ?");
	const updateLike = database.prepare("UPDATE quotes SET category = ? WHERE category LIKE ?");

	const transaction = database.transaction(() => {
		for (const [sv, en] of Object.entries(mapping)) {
			stmt.run(en, sv);
		}
		// Normalize all misspelled variants of självrannsakan
		updateLike.run("self-accountability", "själ%ranns%");
		updateLike.run("self-accountability", "sel%ranns%");
		updateLike.run("self-accountability", "samvetsranns%");
		// Normalize minor typos
		updateLike.run("patience", "tålmod%");
		updateLike.run("knowledge", "kuskap%");
		updateLike.run("knowledge", "kunskapen");
		updateLike.run("character", "karaktern");
		updateLike.run("death", "död");
		updateLike.run("fate", "ödet");
		updateLike.run("grief", "sorgen");
		updateLike.run("grief", "sorger");
		updateLike.run("grief", "sorgsamt");
		updateLike.run("grief", "sorgsamhet");
		updateLike.run("nature", "naturens");
		updateLike.run("love", "kärleken");
		updateLike.run("hope", "hopplighet");
		updateLike.run("humility", "öd mjukhet");
		updateLike.run("pride", "höglighet");
		updateLike.run("pride", "högtidlighet");
		updateLike.run("decay", "förfäll");
		updateLike.run("solitude", "ensomhet");
	});
	transaction();
}

/**
 * Reclassifies Norse/Eddic quotes from language='sv' to language='en'.
 * These are Old Norse texts in English translation, not Swedish literature.
 */
function reclassifyNorseQuotes(database: Database.Database): void {
	database.exec(`
		UPDATE quotes SET language = 'en'
		WHERE language = 'sv' AND (
			author IN ('Snorri Sturluson', 'Sæmundur fróði', 'Rasmus B. Anderson', 'Sigrdrifa', 'Manikka-vasagar')
			OR author LIKE 'Henry Adams Bellows%'
			OR work_title LIKE '%Volsunga Saga%'
			OR (work_title LIKE '%Edda%' AND author NOT LIKE '%Tegnér%' AND author NOT LIKE '%Geijer%')
		)
	`);
}

/**
 * Fixes romanized OpenITI work titles in Arabic quotes to proper Arabic script.
 */
function fixRomanizedArabicTitles(database: Database.Database): void {
	const titleMap: Record<string, string> = {
		MadarijSalikin: "مدارج السالكين",
		JamicCulumWaHikam: "جامع العلوم والحكم",
		LataifMacarif: "لطائف المعارف",
		"Lataif al-Macarif": "لطائف المعارف",
		TaqribLiHaddMantiq: "التقريب لحد المنطق",
		RawdatMuhibbin: "روضة المحبين ونزهة المشتاقين",
		CuddatSabirin: "عدة الصابرين وذخيرة الشاكرين",
		TakhwifMinNar: "التخويف من النار",
		WabilSayyib: "الوابل الصيب من الكلم الطيب",
		AdabDunyaWaDin: "أدب الدنيا والدين",
		RawdatCuqala: "روضة العقلاء ونزهة الفضلاء",
	};

	const stmt = database.prepare("UPDATE quotes SET work_title = ? WHERE work_title = ?");
	const transaction = database.transaction(() => {
		for (const [romanized, arabic] of Object.entries(titleMap)) {
			stmt.run(arabic, romanized);
		}
	});
	transaction();
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
		SELECT id, text, author, work_title as workTitle, category, keywords, tone, standalone, length, language, source_type as sourceType, created_at as createdAt
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
 * Rebuilds the FTS5 index from existing quote data.
 * Call this once after adding FTS5 to a database with existing quotes.
 */
export function rebuildFts(): void {
	const database = initDatabase();
	database.exec("INSERT INTO quotes_fts(quotes_fts) VALUES('rebuild')");
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
