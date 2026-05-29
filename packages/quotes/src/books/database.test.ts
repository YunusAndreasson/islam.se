import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it } from "vitest";
import {
	cleanOrphanEmbeddings,
	getPassagesWithoutEmbedding,
	insertSummaryEmbedding,
} from "./database.js";

const DIM = 384;

/**
 * Minimal in-memory books DB with only the tables the embedding-maintenance
 * functions touch. vec0 virtual tables can't carry a foreign key, so orphaned
 * embeddings are a real possibility the production schema can't prevent — these
 * tests lock in that the sweep removes exactly the orphans and nothing else.
 */
function createTestBooksDb(): Database.Database {
	const db = new Database(":memory:");
	sqliteVec.load(db);
	db.pragma("foreign_keys = ON");
	db.exec(`
		CREATE TABLE books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, author TEXT);
		CREATE TABLE chapters (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER);
		CREATE TABLE passages (id INTEGER PRIMARY KEY AUTOINCREMENT, book_id INTEGER, text TEXT);
		CREATE VIRTUAL TABLE passage_embeddings USING vec0(embedding float[${DIM}]);
		CREATE VIRTUAL TABLE summary_embeddings USING vec0(embedding float[${DIM}]);
		CREATE TABLE summary_embedding_meta (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			entity_type TEXT NOT NULL,
			entity_id INTEGER NOT NULL
		);
	`);
	return db;
}

const zeroVec = (): Buffer => Buffer.from(new Uint8Array(new Float32Array(DIM).buffer));

function insertEmbedding(db: Database.Database, table: string, rowid: number): void {
	// vec0 requires the rowid as a SQL literal, not a bound parameter (matches
	// insertPassageEmbedding / insertSummaryEmbedding in database.ts).
	db.prepare(`INSERT INTO ${table} (rowid, embedding) VALUES (${rowid}, ?)`).run(zeroVec());
}

describe("cleanOrphanEmbeddings", () => {
	let db: Database.Database;
	beforeEach(() => {
		db = createTestBooksDb();
	});

	it("removes passage embeddings with no matching passage, keeps the rest", () => {
		db.prepare("INSERT INTO passages (id, book_id, text) VALUES (1, 1, 'a'), (2, 1, 'b')").run();
		insertEmbedding(db, "passage_embeddings", 1); // valid
		insertEmbedding(db, "passage_embeddings", 2); // valid
		insertEmbedding(db, "passage_embeddings", 999); // orphan — passage 999 was deleted

		const result = cleanOrphanEmbeddings(db);

		expect(result.passageEmbeddings).toBe(1);
		const remaining = db
			.prepare("SELECT rowid FROM passage_embeddings ORDER BY rowid")
			.all()
			.map((r) => (r as { rowid: number }).rowid);
		expect(remaining).toEqual([1, 2]);
	});

	it("removes summary embeddings whose chapter or book is gone", () => {
		db.prepare("INSERT INTO books (id) VALUES (1)").run();
		db.prepare("INSERT INTO chapters (id, book_id) VALUES (10, 1)").run();

		// meta rowid 1 -> live chapter 10, rowid 2 -> deleted chapter 99,
		// rowid 3 -> live book 1, rowid 4 -> deleted book 88
		db.prepare(
			`INSERT INTO summary_embedding_meta (id, entity_type, entity_id)
			 VALUES (1, 'chapter', 10), (2, 'chapter', 99), (3, 'book', 1), (4, 'book', 88)`,
		).run();
		for (const rowid of [1, 2, 3, 4]) insertEmbedding(db, "summary_embeddings", rowid);

		const result = cleanOrphanEmbeddings(db);

		expect(result.summaryEmbeddings).toBe(2); // chapter 99 + book 88
		const liveMeta = db
			.prepare("SELECT id FROM summary_embedding_meta ORDER BY id")
			.all()
			.map((r) => (r as { id: number }).id);
		expect(liveMeta).toEqual([1, 3]);
		const liveEmb = db
			.prepare("SELECT rowid FROM summary_embeddings ORDER BY rowid")
			.all()
			.map((r) => (r as { rowid: number }).rowid);
		expect(liveEmb).toEqual([1, 3]);
	});

	it("is idempotent — a second run finds nothing to clean", () => {
		db.prepare("INSERT INTO passages (id, book_id, text) VALUES (1, 1, 'a')").run();
		insertEmbedding(db, "passage_embeddings", 1);
		insertEmbedding(db, "passage_embeddings", 999);

		cleanOrphanEmbeddings(db);
		const second = cleanOrphanEmbeddings(db);
		expect(second).toEqual({ passageEmbeddings: 0, summaryEmbeddings: 0 });
	});
});

describe("insertSummaryEmbedding", () => {
	it("is idempotent — re-inserting for the same entity replaces, not duplicates", () => {
		const db = createTestBooksDb();
		const emb = new Float32Array(DIM);

		insertSummaryEmbedding("chapter", 10, emb, db);
		insertSummaryEmbedding("chapter", 10, emb, db); // resume re-summarizes the same chapter
		insertSummaryEmbedding("book", 1, emb, db);

		// Exactly one row per entity, and meta rowids line up 1:1 with embeddings.
		const metaCount = (
			db.prepare("SELECT COUNT(*) AS n FROM summary_embedding_meta").get() as { n: number }
		).n;
		const embCount = (
			db.prepare("SELECT COUNT(*) AS n FROM summary_embeddings").get() as { n: number }
		).n;
		expect(metaCount).toBe(2);
		expect(embCount).toBe(2);
	});
});

describe("getPassagesWithoutEmbedding", () => {
	it("returns only passages that lack an embedding", () => {
		const db = createTestBooksDb();
		db.prepare(
			"INSERT INTO passages (id, book_id, text) VALUES (1, 1, 'embedded'), (2, 1, 'missing'), (3, 1, 'also missing')",
		).run();
		insertEmbedding(db, "passage_embeddings", 1);

		const missing = getPassagesWithoutEmbedding(db);

		expect(missing.map((p) => p.id)).toEqual([2, 3]);
		expect(missing.map((p) => p.text)).toEqual(["missing", "also missing"]);
	});
});
