import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

// Find the project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const DB_PATH = join(PROJECT_ROOT, "data", "quran.db");
const EMBEDDING_DIMENSIONS = 384; // Local multilingual-e5-small model

export interface QuranVerse {
	surahNumber: number;
	surahNameArabic: string;
	surahNameSwedish: string;
	verseNumber: number;
	textSwedish: string;
	textArabic?: string;
	commentary?: string;
	translator: string;
}

export interface StoredVerse extends QuranVerse {
	id: number;
	createdAt: string;
}

export interface VerseWithScore extends StoredVerse {
	score: number;
}

let db: Database.Database | null = null;

/**
 * Initializes the Quran database with required tables and extensions
 */
export function initQuranDatabase(): Database.Database {
	if (db) {
		return db;
	}

	// Ensure data directory exists
	const dbDir = dirname(DB_PATH);
	if (!existsSync(dbDir)) {
		mkdirSync(dbDir, { recursive: true });
	}

	db = new Database(DB_PATH);

	// Enable WAL mode for better concurrent performance
	db.pragma("journal_mode = WAL");

	// Load sqlite-vec extension
	sqliteVec.load(db);

	// Create verses table
	db.exec(`
		CREATE TABLE IF NOT EXISTS verses (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			surah_number INTEGER NOT NULL,
			surah_name_arabic TEXT NOT NULL,
			surah_name_swedish TEXT NOT NULL,
			verse_number INTEGER NOT NULL,
			text_swedish TEXT NOT NULL,
			text_arabic TEXT,
			commentary TEXT,
			translator TEXT NOT NULL,
			created_at TEXT DEFAULT (datetime('now')),
			UNIQUE(surah_number, verse_number, translator)
		)
	`);

	// Create indexes for efficient querying
	db.exec(`
		CREATE INDEX IF NOT EXISTS idx_verses_surah ON verses(surah_number);
		CREATE INDEX IF NOT EXISTS idx_verses_surah_verse ON verses(surah_number, verse_number);
	`);

	// Create virtual table for vector search
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS verse_embeddings USING vec0(
			embedding float[${EMBEDDING_DIMENSIONS}]
		)
	`);

	return db;
}

/**
 * Inserts a verse into the database
 * Returns the verse ID, or null if the verse already exists
 */
export function insertVerse(verse: QuranVerse): number | null {
	const database = initQuranDatabase();

	try {
		const stmt = database.prepare(`
			INSERT INTO verses (
				surah_number, surah_name_arabic, surah_name_swedish,
				verse_number, text_swedish, text_arabic, commentary, translator
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);

		const result = stmt.run(
			verse.surahNumber,
			verse.surahNameArabic,
			verse.surahNameSwedish,
			verse.verseNumber,
			verse.textSwedish,
			verse.textArabic ?? null,
			verse.commentary ?? null,
			verse.translator,
		);

		return result.lastInsertRowid as number;
	} catch (error) {
		// Handle unique constraint violation (verse already exists)
		if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
			return null;
		}
		throw error;
	}
}

/**
 * Stores an embedding for a verse
 */
export function insertVerseEmbedding(verseId: number, embedding: Float32Array): void {
	const database = initQuranDatabase();

	const stmt = database.prepare(`
		INSERT INTO verse_embeddings (rowid, embedding)
		VALUES (${verseId}, ?)
	`);

	const buffer = Buffer.from(new Uint8Array(embedding.buffer));
	stmt.run(buffer);
}

/**
 * Gets a verse by surah and verse number
 */
export function getVerse(surahNumber: number, verseNumber: number): StoredVerse | null {
	const database = initQuranDatabase();

	const stmt = database.prepare(`
		SELECT
			id, surah_number as surahNumber, surah_name_arabic as surahNameArabic,
			surah_name_swedish as surahNameSwedish, verse_number as verseNumber,
			text_swedish as textSwedish, text_arabic as textArabic,
			commentary, translator, created_at as createdAt
		FROM verses
		WHERE surah_number = ? AND verse_number = ?
	`);

	return stmt.get(surahNumber, verseNumber) as StoredVerse | null;
}

/**
 * Gets all verses from a surah
 */
export function getSurah(surahNumber: number): StoredVerse[] {
	const database = initQuranDatabase();

	const stmt = database.prepare(`
		SELECT
			id, surah_number as surahNumber, surah_name_arabic as surahNameArabic,
			surah_name_swedish as surahNameSwedish, verse_number as verseNumber,
			text_swedish as textSwedish, text_arabic as textArabic,
			commentary, translator, created_at as createdAt
		FROM verses
		WHERE surah_number = ?
		ORDER BY verse_number
	`);

	return stmt.all(surahNumber) as StoredVerse[];
}

/**
 * Gets all verses
 */
export function getAllVerses(): StoredVerse[] {
	const database = initQuranDatabase();

	const stmt = database.prepare(`
		SELECT
			id, surah_number as surahNumber, surah_name_arabic as surahNameArabic,
			surah_name_swedish as surahNameSwedish, verse_number as verseNumber,
			text_swedish as textSwedish, text_arabic as textArabic,
			commentary, translator, created_at as createdAt
		FROM verses
		ORDER BY surah_number, verse_number
	`);

	return stmt.all() as StoredVerse[];
}

export interface QuranStats {
	totalVerses: number;
	surahs: number;
	versesWithCommentary: number;
	versesWithArabic: number;
	translators: string[];
}

/**
 * Gets Quran database statistics
 */
export function getQuranStats(): QuranStats {
	const database = initQuranDatabase();

	const totalVerses = (
		database.prepare("SELECT COUNT(*) as count FROM verses").get() as { count: number }
	).count;

	const surahs = (
		database.prepare("SELECT COUNT(DISTINCT surah_number) as count FROM verses").get() as {
			count: number;
		}
	).count;

	const versesWithCommentary = (
		database
			.prepare(
				"SELECT COUNT(*) as count FROM verses WHERE commentary IS NOT NULL AND commentary != ''",
			)
			.get() as {
			count: number;
		}
	).count;

	const versesWithArabic = (
		database
			.prepare(
				"SELECT COUNT(*) as count FROM verses WHERE text_arabic IS NOT NULL AND text_arabic != ''",
			)
			.get() as {
			count: number;
		}
	).count;

	const translators = (
		database.prepare("SELECT DISTINCT translator FROM verses").all() as { translator: string }[]
	).map((row) => row.translator);

	return {
		totalVerses,
		surahs,
		versesWithCommentary,
		versesWithArabic,
		translators,
	};
}

/**
 * Searches verses by text (simple LIKE search)
 */
export function searchVerses(query: string, limit = 20): StoredVerse[] {
	const database = initQuranDatabase();

	const stmt = database.prepare(`
		SELECT
			id, surah_number as surahNumber, surah_name_arabic as surahNameArabic,
			surah_name_swedish as surahNameSwedish, verse_number as verseNumber,
			text_swedish as textSwedish, text_arabic as textArabic,
			commentary, translator, created_at as createdAt
		FROM verses
		WHERE text_swedish LIKE ? OR commentary LIKE ?
		ORDER BY surah_number, verse_number
		LIMIT ?
	`);

	const pattern = `%${query}%`;
	return stmt.all(pattern, pattern, limit) as StoredVerse[];
}

/**
 * Semantic search for verses using embeddings
 */
export function searchVersesSemantic(queryEmbedding: Float32Array, limit = 10, minScore = 0.3): VerseWithScore[] {
	const database = initQuranDatabase();

	// Convert Float32Array to Buffer for sqlite-vec
	const buffer = Buffer.from(new Uint8Array(queryEmbedding.buffer));

	const stmt = database.prepare(`
		SELECT
			v.id, v.surah_number as surahNumber, v.surah_name_arabic as surahNameArabic,
			v.surah_name_swedish as surahNameSwedish, v.verse_number as verseNumber,
			v.text_swedish as textSwedish, v.text_arabic as textArabic,
			v.commentary, v.translator, v.created_at as createdAt,
			vec_distance_cosine(e.embedding, ?) as distance
		FROM verse_embeddings e
		JOIN verses v ON e.rowid = v.id
		ORDER BY distance ASC
		LIMIT ?
	`);

	const rows = stmt.all(buffer, limit) as (StoredVerse & { distance: number })[];

	// Convert distance to similarity score (1 - distance for cosine)
	return rows
		.map((row) => ({
			...row,
			score: 1 - row.distance,
		}))
		.filter((row) => row.score >= minScore);
}

/**
 * Closes the database connection
 */
export function closeQuranDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
}
