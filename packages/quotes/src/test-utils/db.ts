/**
 * Test utilities for creating isolated in-memory databases.
 */
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const EMBEDDING_DIMENSIONS = 384;

export interface TestQuote {
	id?: number;
	text: string;
	author: string;
	workTitle: string;
	category?: string;
	keywords?: string[];
	tone?: string;
	standalone?: number;
	length?: "short" | "medium" | "long";
	language?: "sv" | "ar" | "en";
	sourceType?: string;
	embedding?: Float32Array;
}

/**
 * Creates an in-memory SQLite database with the quote schema.
 * Use this for isolated testing without touching production data.
 */
export function createTestDatabase(): Database.Database {
	const db = new Database(":memory:");

	// Enable WAL mode (doesn't matter for in-memory but matches prod)
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

	// Create virtual table for vector search
	db.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS quote_embeddings USING vec0(
			embedding float[${EMBEDDING_DIMENSIONS}]
		)
	`);

	return db;
}

/**
 * Computes length category based on character count (matches production logic)
 */
function computeLength(text: string): "short" | "medium" | "long" {
	const len = text.length;
	if (len < 50) return "short";
	if (len < 150) return "medium";
	return "long";
}

/**
 * Inserts a test quote into the database.
 * Returns the inserted ID.
 */
export function insertTestQuote(db: Database.Database, quote: TestQuote): number {
	const stmt = db.prepare(`
		INSERT INTO quotes (text, author, work_title, category, keywords, tone, standalone, length, language, source_type)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	const result = stmt.run(
		quote.text,
		quote.author,
		quote.workTitle,
		quote.category ?? null,
		JSON.stringify(quote.keywords ?? []),
		quote.tone ?? null,
		quote.standalone ?? 3,
		quote.length ?? computeLength(quote.text),
		quote.language ?? "sv",
		quote.sourceType ?? null,
	);

	const quoteId = result.lastInsertRowid as number;

	// Insert embedding if provided
	if (quote.embedding) {
		const embeddingStmt = db.prepare(`
			INSERT INTO quote_embeddings (rowid, embedding)
			VALUES (${quoteId}, ?)
		`);
		const buffer = Buffer.from(new Uint8Array(quote.embedding.buffer));
		embeddingStmt.run(buffer);
	}

	return quoteId;
}

/**
 * Generates a deterministic fake embedding based on text content.
 * Use this for tests to avoid downloading the 470MB model.
 */
export function generateFakeEmbedding(text: string): Float32Array {
	const hash = simpleHash(text);
	const embedding = new Float32Array(EMBEDDING_DIMENSIONS);
	for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
		embedding[i] = Math.sin(hash * (i + 1) * 0.1) * 0.5;
	}
	return embedding;
}

function simpleHash(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0; // Convert to 32-bit integer
	}
	return hash;
}

/**
 * Seeds the database with sample quotes for testing.
 */
export function seedTestQuotes(db: Database.Database): void {
	const quotes: TestQuote[] = [
		{
			text: "Det är inte hur långt du faller, utan hur högt du studsar.",
			author: "August Strindberg",
			workTitle: "Röda rummet",
			category: "visdom",
			keywords: ["motgång", "återhämtning"],
			tone: "uppmuntrande",
			standalone: 5,
			language: "sv",
		},
		{
			text: "Tålamod är alla dyders moder.",
			author: "Selma Lagerlöf",
			workTitle: "Gösta Berlings saga",
			category: "tålamod",
			keywords: ["tålamod", "dygd"],
			tone: "reflekterande",
			standalone: 5,
			language: "sv",
		},
		{
			text: "إن مع العسر يسرا",
			author: "القرآن الكريم",
			workTitle: "سورة الشرح",
			category: "صبر",
			keywords: ["صبر", "أمل"],
			tone: "uppmuntrande",
			standalone: 5,
			language: "ar",
		},
		{
			text: "الصبر مفتاح الفرج",
			author: "علي بن أبي طالب",
			workTitle: "نهج البلاغة",
			category: "صبر",
			keywords: ["صبر", "حكمة"],
			tone: "reflekterande",
			standalone: 4,
			language: "ar",
		},
		{
			text: "Short text here.",
			author: "Test Author",
			workTitle: "Test Work",
			category: "test",
			keywords: ["test"],
			tone: "neutral",
			standalone: 3,
			language: "en",
		},
	];

	for (const quote of quotes) {
		quote.embedding = generateFakeEmbedding(quote.text);
		insertTestQuote(db, quote);
	}
}
