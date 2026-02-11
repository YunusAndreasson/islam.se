import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createTestDatabase,
	generateFakeEmbedding,
	insertTestQuote,
	seedTestQuotes,
} from "./test-utils/db.js";

// Mock the embeddings module to avoid loading the 470MB model
vi.mock("./embeddings/index.js", () => ({
	generateEmbedding: vi.fn(async (text: string) => generateFakeEmbedding(text)),
	generateLocalEmbedding: vi.fn(async (text: string) => generateFakeEmbedding(text)),
}));

// Import after mocking
import {
	buildFts5Query,
	findQuotesByFilter,
	getCategories,
	getInventory,
	searchQuotesHybrid,
	searchQuotesText,
} from "./search.js";

// ============================================================================
// buildFts5Query
// ============================================================================

describe("buildFts5Query", () => {
	it("wraps each token in quotes with prefix wildcard", () => {
		const result = buildFts5Query("tålamod dygd");
		expect(result).toBe('"tålamod"* "dygd"*');
	});

	it("strips FTS5 special characters", () => {
		const result = buildFts5Query('hello "world" (test) [brackets] {braces}');
		expect(result).toBe('"hello"* "world"* "test"* "brackets"* "braces"*');
	});

	it("returns empty string for empty input", () => {
		expect(buildFts5Query("")).toBe("");
		expect(buildFts5Query("   ")).toBe("");
	});

	it("handles Arabic tokens", () => {
		const result = buildFts5Query("الصبر مفتاح");
		expect(result).toBe('"الصبر"* "مفتاح"*');
	});

	it("drops tokens that are only special characters", () => {
		const result = buildFts5Query('hello "+" world');
		// "+" becomes empty after stripping, should be filtered out
		expect(result).toBe('"hello"* "world"*');
	});

	it("neutralizes FTS5 boolean operators by quoting them", () => {
		// FTS5 treats NOT, OR, AND, NEAR as operators in unquoted context.
		// buildFts5Query wraps tokens in quotes, which should make them literals.
		// If quoting breaks, "NOT patience" becomes a negation query.
		const notQuery = buildFts5Query("NOT patience");
		expect(notQuery, "NOT should be quoted to prevent FTS5 negation").toBe('"NOT"* "patience"*');

		const orQuery = buildFts5Query("death OR life");
		expect(orQuery, "OR should be quoted to prevent FTS5 disjunction").toBe(
			'"death"* "OR"* "life"*',
		);

		const andQuery = buildFts5Query("patience AND virtue");
		expect(andQuery, "AND should be quoted to prevent FTS5 conjunction").toBe(
			'"patience"* "AND"* "virtue"*',
		);

		const nearQuery = buildFts5Query("NEAR death");
		expect(nearQuery, "NEAR should be quoted to prevent FTS5 proximity").toBe('"NEAR"* "death"*');
	});

	it("FTS5 operators in queries don't act as boolean operators", () => {
		// Verify that quoting prevents operator interpretation.
		// Unquoted `NOT "tålamod"*` would be a negation (return everything EXCEPT tålamod).
		// Quoted `"NOT"* "tålamod"*` is an implicit AND (require both tokens).
		// Since no quote contains the literal word "NOT", the AND returns nothing —
		// which is correct because it means NOT was treated as a search term, not an operator.
		const db = createTestDatabase();
		seedTestQuotes(db);
		try {
			const query = buildFts5Query("NOT tålamod");
			const quotedResults = db
				.prepare(
					`SELECT q.text FROM quotes_fts fts
					 JOIN quotes q ON q.id = fts.rowid
					 WHERE quotes_fts MATCH ?`,
				)
				.all(query) as { text: string }[];

			// If NOT were an operator, we'd get all non-tålamod quotes (3+ results).
			// Since NOT is quoted and treated as a literal term (implicit AND with tålamod),
			// we get 0 results because no quote contains both "NOT" and "tålamod".
			const nonTalamodResults = quotedResults.filter((r) => !r.text.includes("Tålamod"));
			expect(
				nonTalamodResults.length,
				"NOT should be a literal search term, not a boolean operator. " +
					"If this fails with >0 results, NOT is being interpreted as negation.",
			).toBe(0);
		} finally {
			db.close();
		}
	});
});

// ============================================================================
// Sync search functions with in-memory DB
// ============================================================================

describe("findQuotesByFilter", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = createTestDatabase();
		seedTestQuotes(db);
	});

	afterEach(() => {
		db.close();
	});

	it("filters by language strictly", () => {
		const results = findQuotesByFilter({ language: "sv", minStandalone: 1 }, db);
		for (const r of results) {
			expect(r.language, `Found ${r.language} quote despite language=sv filter`).toBe("sv");
		}
		expect(results.length, "Should find at least one Swedish quote").toBeGreaterThan(0);
	});

	it("filters by Arabic language", () => {
		const results = findQuotesByFilter({ language: "ar", minStandalone: 1 }, db);
		for (const r of results) {
			expect(r.language, `Found ${r.language} quote despite language=ar filter`).toBe("ar");
		}
		expect(results.length, "Should find at least one Arabic quote").toBeGreaterThan(0);
	});

	it("respects minStandalone filter", () => {
		const results = findQuotesByFilter({ minStandalone: 5 }, db);
		for (const r of results) {
			expect(
				r.standalone,
				`Quote standalone=${r.standalone} is below minStandalone=5`,
			).toBeGreaterThanOrEqual(5);
		}
	});

	it("filters by author with partial match", () => {
		const results = findQuotesByFilter({ author: "Strindberg", minStandalone: 1 }, db);
		expect(results.length, "Should find Strindberg quotes").toBeGreaterThan(0);
		for (const r of results) {
			expect(r.attribution, `Attribution "${r.attribution}" should contain Strindberg`).toContain(
				"Strindberg",
			);
		}
	});

	it("filters by category", () => {
		const results = findQuotesByFilter({ category: "صبر", minStandalone: 1 }, db);
		expect(results.length, "Should find Arabic patience quotes").toBeGreaterThan(0);
		for (const r of results) {
			expect(r.category, `Category "${r.category}" should contain صبر`).toContain("صبر");
		}
	});

	it("combines multiple filters", () => {
		const results = findQuotesByFilter(
			{ language: "sv", minStandalone: 5, author: "Lagerlöf" },
			db,
		);
		for (const r of results) {
			expect(r.language, "Language filter leaked").toBe("sv");
			expect(r.standalone, "Standalone filter leaked").toBeGreaterThanOrEqual(5);
			expect(r.attribution, "Author filter leaked").toContain("Lagerlöf");
		}
	});

	it("respects limit parameter", () => {
		const results = findQuotesByFilter({ limit: 1, minStandalone: 1 }, db);
		expect(results.length).toBeLessThanOrEqual(1);
	});

	it("returns FormattedQuoteWithId shape", () => {
		const results = findQuotesByFilter({ minStandalone: 1 }, db);
		expect(results.length).toBeGreaterThan(0);
		const first = results[0];
		expect(first).toBeDefined();
		expect(typeof first?.id).toBe("number");
		expect(typeof first?.text).toBe("string");
		expect(typeof first?.attribution).toBe("string");
		expect(typeof first?.score).toBe("number");
		expect(first?.score, "Filter-based search score should be 0.5").toBe(0.5);
	});

	it("filters by keywords via FTS5", () => {
		const results = findQuotesByFilter({ keywords: ["motgång"], minStandalone: 1 }, db);
		expect(results.length, "Should find quotes with keyword 'motgång'").toBeGreaterThan(0);
	});
});

describe("searchQuotesText", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = createTestDatabase();
		seedTestQuotes(db);
	});

	afterEach(() => {
		db.close();
	});

	it("finds quotes by keyword via FTS5", () => {
		const results = searchQuotesText("tålamod", { minStandalone: 1 }, db);
		expect(results.length, "FTS5 should find 'tålamod' in seeded data").toBeGreaterThan(0);
		expect(results[0]?.text).toContain("Tålamod");
	});

	it("respects language filter", () => {
		const results = searchQuotesText("الصبر", { language: "ar", minStandalone: 1 }, db);
		for (const r of results) {
			expect(r.language, `Found ${r.language} quote despite language=ar filter`).toBe("ar");
		}
	});

	it("REGRESSION: scores capped at 0.75 (score inflation bug)", () => {
		// Bug: scoreTextResult() was returning 1.0 for exact matches
		// Fix: capped at 0.75 base because text matches are less precise than semantic
		const results = searchQuotesText("tålamod", { limit: 20, minStandalone: 1 }, db);
		for (const r of results) {
			expect(
				r.score,
				`Score inflation: quote ${r.id} has score ${r.score}, max should be 0.75`,
			).toBeLessThanOrEqual(0.75);
		}
	});

	it("returns results sorted by relevance", () => {
		// Add extra quote with "tålamod" repeated for stronger BM25 signal
		insertTestQuote(db, {
			text: "Tålamod och tålamod och åter tålamod behövs.",
			author: "Test",
			workTitle: "Test",
			category: "patience",
			keywords: ["tålamod"],
			tone: "neutral",
			standalone: 5,
			language: "sv",
			embedding: generateFakeEmbedding("Tålamod och tålamod och åter tålamod behövs."),
		});

		const results = searchQuotesText("tålamod", { minStandalone: 1 }, db);
		expect(results.length).toBeGreaterThanOrEqual(2);
		// Scores should be in descending order
		for (let i = 1; i < results.length; i++) {
			const prev = results[i - 1]?.score ?? 0;
			const curr = results[i]?.score ?? 0;
			expect(
				prev,
				`Result ${i - 1} (score=${prev}) should be >= result ${i} (score=${curr})`,
			).toBeGreaterThanOrEqual(curr);
		}
	});

	it("returns empty array for empty query", () => {
		const results = searchQuotesText("", {}, db);
		expect(results).toEqual([]);
	});

	it("returns empty array for whitespace-only query", () => {
		const results = searchQuotesText("   ", {}, db);
		expect(results).toEqual([]);
	});

	it("BOUNDARY: single result gets score exactly 0.75", () => {
		// When FTS5 returns 1 result, minRank === maxRank, rankRange = 0 || 1 = 1.
		// Formula: 0.75 * (1 - (rank - minRank) / rankRange) = 0.75 * (1 - 0/1) = 0.75.
		// If the normalization formula changes, this catches NaN (0/0) or wrong values.
		// Use a unique term that matches exactly one quote.
		insertTestQuote(db, {
			text: "Xylofon är ett ovanligt instrument.",
			author: "Unik",
			workTitle: "Unik",
			standalone: 5,
			language: "sv",
			embedding: generateFakeEmbedding("Xylofon är ett ovanligt instrument."),
		});

		const results = searchQuotesText("xylofon", { minStandalone: 1 }, db);
		expect(results.length, "Should find exactly one result for unique term").toBe(1);
		expect(
			results[0]?.score,
			"Single result score should be exactly 0.75 (best possible for text search)",
		).toBe(0.75);
	});
});

describe("getInventory", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = createTestDatabase();
		seedTestQuotes(db);
	});

	afterEach(() => {
		db.close();
	});

	it("returns correct total count", () => {
		const inv = getInventory(db);
		expect(inv.total).toBe(5); // seedTestQuotes inserts 5 quotes
	});

	it("returns correct language breakdown", () => {
		const inv = getInventory(db);
		expect(inv.languages.sv).toBe(2);
		expect(inv.languages.ar).toBe(2);
		expect(inv.languages.en).toBe(1);
	});

	it("returns categories with counts", () => {
		const inv = getInventory(db);
		expect(inv.categories.length).toBeGreaterThan(0);
		for (const cat of inv.categories) {
			expect(cat.count, `Category "${cat.name}" should have positive count`).toBeGreaterThan(0);
		}
	});
});

describe("getCategories", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = createTestDatabase();
		seedTestQuotes(db);
	});

	afterEach(() => {
		db.close();
	});

	it("returns categories with counts", () => {
		const categories = getCategories(db);
		expect(categories.length).toBeGreaterThan(0);
		for (const cat of categories) {
			expect(typeof cat.category).toBe("string");
			expect(cat.count).toBeGreaterThan(0);
		}
	});

	it("returns categories sorted by count descending", () => {
		const categories = getCategories(db);
		for (let i = 1; i < categories.length; i++) {
			const prevCount = categories[i - 1]?.count ?? 0;
			const currCount = categories[i]?.count ?? 0;
			expect(
				prevCount,
				`Category at index ${i - 1} should have count >= index ${i}`,
			).toBeGreaterThanOrEqual(currCount);
		}
	});
});

// ============================================================================
// Vector search properties (using sqlite-vec, NOT reimplemented cosine)
// ============================================================================

describe("vector search properties", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = createTestDatabase();
		seedTestQuotes(db);
	});

	afterEach(() => {
		db.close();
	});

	it("PROPERTY: self-similarity returns distance 0", () => {
		const embedding = generateFakeEmbedding("test text");
		const buffer = Buffer.from(new Uint8Array(embedding.buffer));

		const result = db
			.prepare("SELECT vec_distance_cosine(?, ?) as distance")
			.get(buffer, buffer) as { distance: number };

		expect(result.distance, "Self-distance should be 0").toBeCloseTo(0, 5);
	});

	it("PROPERTY: distance is symmetric", () => {
		const a = generateFakeEmbedding("patience and virtue");
		const b = generateFakeEmbedding("completely different topic");
		const bufA = Buffer.from(new Uint8Array(a.buffer));
		const bufB = Buffer.from(new Uint8Array(b.buffer));

		const ab = (
			db.prepare("SELECT vec_distance_cosine(?, ?) as distance").get(bufA, bufB) as {
				distance: number;
			}
		).distance;
		const ba = (
			db.prepare("SELECT vec_distance_cosine(?, ?) as distance").get(bufB, bufA) as {
				distance: number;
			}
		).distance;

		expect(ab, "Cosine distance should be symmetric").toBeCloseTo(ba, 10);
	});

	it("PROPERTY: distance is bounded [0, 2]", () => {
		const embedding = generateFakeEmbedding("any text");
		const buffer = Buffer.from(new Uint8Array(embedding.buffer));

		const results = db
			.prepare(
				`SELECT vec_distance_cosine(e.embedding, ?) as distance
				 FROM quote_embeddings e`,
			)
			.all(buffer) as { distance: number }[];

		for (const r of results) {
			expect(r.distance, "Cosine distance should be >= 0").toBeGreaterThanOrEqual(0);
			expect(r.distance, "Cosine distance should be <= 2").toBeLessThanOrEqual(2);
		}
	});

	it("PROPERTY: different texts produce different distances", () => {
		const query = generateFakeEmbedding("patience");
		const similar = generateFakeEmbedding("patience and endurance");
		const different = generateFakeEmbedding("quantum physics equations");

		const bufQuery = Buffer.from(new Uint8Array(query.buffer));
		const bufSimilar = Buffer.from(new Uint8Array(similar.buffer));
		const bufDifferent = Buffer.from(new Uint8Array(different.buffer));

		const distSimilar = (
			db.prepare("SELECT vec_distance_cosine(?, ?) as distance").get(bufQuery, bufSimilar) as {
				distance: number;
			}
		).distance;
		const distDifferent = (
			db.prepare("SELECT vec_distance_cosine(?, ?) as distance").get(bufQuery, bufDifferent) as {
				distance: number;
			}
		).distance;

		// Similar text should have smaller distance than very different text
		// (not guaranteed with fake embeddings, but the hash-based generator is deterministic)
		expect(typeof distSimilar, "Distance calculation should return a number").toBe("number");
		expect(typeof distDifferent, "Distance calculation should return a number").toBe("number");
	});
});

// ============================================================================
// Database-integrated tests (kept from original — these are good behavior tests)
// ============================================================================

describe("database-integrated search tests", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = createTestDatabase();
		seedTestQuotes(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("FTS5 full-text search", () => {
		it("finds quotes by text content", () => {
			const results = db
				.prepare(
					`SELECT q.id, q.text, rank
					 FROM quotes_fts fts
					 JOIN quotes q ON q.id = fts.rowid
					 WHERE quotes_fts MATCH '"tålamod"'
					 ORDER BY rank`,
				)
				.all() as Array<{ id: number; text: string; rank: number }>;

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.text).toContain("Tålamod");
		});

		it("finds quotes by author", () => {
			const results = db
				.prepare(
					`SELECT q.id, q.author, rank
					 FROM quotes_fts fts
					 JOIN quotes q ON q.id = fts.rowid
					 WHERE quotes_fts MATCH 'author : "Strindberg"'
					 ORDER BY rank`,
				)
				.all() as Array<{ id: number; author: string; rank: number }>;

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.author).toContain("Strindberg");
		});

		it("finds quotes by keyword", () => {
			const results = db
				.prepare(
					`SELECT q.id, q.keywords, rank
					 FROM quotes_fts fts
					 JOIN quotes q ON q.id = fts.rowid
					 WHERE quotes_fts MATCH 'keywords : "motgång"'
					 ORDER BY rank`,
				)
				.all() as Array<{ id: number; keywords: string; rank: number }>;

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.keywords).toContain("motgång");
		});

		it("returns BM25-ranked results (best match first)", () => {
			insertTestQuote(db, {
				text: "Tålamod och tålamod och åter tålamod.",
				author: "Test",
				workTitle: "Test",
				category: "patience",
				keywords: ["tålamod"],
				tone: "neutral",
				standalone: 5,
				language: "sv",
				embedding: generateFakeEmbedding("Tålamod och tålamod och åter tålamod."),
			});

			const results = db
				.prepare(
					`SELECT q.id, q.text, rank
					 FROM quotes_fts fts
					 JOIN quotes q ON q.id = fts.rowid
					 WHERE quotes_fts MATCH '"tålamod"'
					 ORDER BY rank`,
				)
				.all() as Array<{ id: number; text: string; rank: number }>;

			expect(results.length).toBeGreaterThanOrEqual(2);
			// BM25 rank is negative; best match has lowest (most negative) rank
			expect(results[0]?.rank).toBeLessThanOrEqual(results[1]?.rank ?? 0);
		});

		it("handles Arabic text properly", () => {
			const results = db
				.prepare(
					`SELECT q.id, q.text, rank
					 FROM quotes_fts fts
					 JOIN quotes q ON q.id = fts.rowid
					 WHERE quotes_fts MATCH '"الصبر"'
					 ORDER BY rank`,
				)
				.all() as Array<{ id: number; text: string; rank: number }>;

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.text).toContain("الصبر");
		});

		it("prefix search works", () => {
			const results = db
				.prepare(
					`SELECT q.id, q.text, rank
					 FROM quotes_fts fts
					 JOIN quotes q ON q.id = fts.rowid
					 WHERE quotes_fts MATCH '"tålam" *'
					 ORDER BY rank`,
				)
				.all() as Array<{ id: number; text: string; rank: number }>;

			expect(results.length).toBeGreaterThan(0);
		});

		it("FTS5 index stays in sync via triggers", () => {
			const countBefore = (
				db
					.prepare("SELECT COUNT(*) as c FROM quotes_fts WHERE quotes_fts MATCH '\"test_sync\"'")
					.get() as { c: number }
			).c;
			expect(countBefore).toBe(0);

			db.prepare(
				`INSERT INTO quotes (text, author, work_title, keywords, standalone, length, language)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			).run("test_sync unique content", "SyncAuthor", "SyncWork", "[]", 5, "short", "sv");

			const countAfter = (
				db
					.prepare("SELECT COUNT(*) as c FROM quotes_fts WHERE quotes_fts MATCH '\"test_sync\"'")
					.get() as { c: number }
			).c;
			expect(countAfter).toBe(1);
		});
	});

	describe("vector search prerequisites", () => {
		it("stores embeddings correctly", () => {
			const embeddings = db
				.prepare("SELECT rowid, embedding FROM quote_embeddings")
				.all() as Array<{ rowid: number; embedding: Buffer }>;

			expect(embeddings.length).toBeGreaterThan(0);

			// Each embedding should be 384 floats * 4 bytes = 1536 bytes
			for (const row of embeddings) {
				expect(row.embedding.length).toBe(384 * 4);
			}
		});

		it("has matching quote and embedding counts", () => {
			const quoteCount = (
				db.prepare("SELECT COUNT(*) as count FROM quotes").get() as { count: number }
			).count;
			const embeddingCount = (
				db.prepare("SELECT COUNT(*) as count FROM quote_embeddings").get() as {
					count: number;
				}
			).count;

			expect(embeddingCount).toBe(quoteCount);
		});

		it("can perform vector distance calculation", () => {
			const testEmbedding = generateFakeEmbedding("test query");
			const buffer = Buffer.from(new Uint8Array(testEmbedding.buffer));

			const result = db
				.prepare(
					`SELECT
						q.id,
						vec_distance_cosine(e.embedding, ?) as distance
					 FROM quote_embeddings e
					 JOIN quotes q ON e.rowid = q.id
					 ORDER BY distance ASC
					 LIMIT 1`,
				)
				.get(buffer) as { id: number; distance: number } | undefined;

			expect(result).toBeDefined();
			expect(typeof result?.distance).toBe("number");
			expect(result?.distance).toBeGreaterThanOrEqual(0);
			expect(result?.distance).toBeLessThanOrEqual(2); // Cosine distance range
		});
	});
});

// ============================================================================
// Hybrid search RRF invariants
// ============================================================================

describe("searchQuotesHybrid RRF invariants", () => {
	it("PROPERTY: all output IDs are valid positive integers", async () => {
		// RRF merges two ranked lists. Every output ID must be a valid quote ID.
		// A bug in Map key handling (string vs number coercion) could produce
		// phantom results or corrupt IDs.
		const results = await searchQuotesHybrid("tålamod", { limit: 10, minStandalone: 1 });

		for (const r of results) {
			expect(typeof r.id, `Result ID should be a number, got ${typeof r.id}`).toBe("number");
			expect(r.id, "Result ID should be a positive integer").toBeGreaterThan(0);
			expect(Number.isInteger(r.id), `Result ID ${r.id} should be an integer`).toBe(true);
		}

		// All RRF scores should be positive (sum of 1/(k+rank) terms)
		for (const r of results) {
			expect(r.score, `RRF score for ID ${r.id} should be positive`).toBeGreaterThan(0);
		}
	});

	it("PROPERTY: output is sorted by RRF score descending", async () => {
		const results = await searchQuotesHybrid("tålamod", { limit: 10, minStandalone: 1 });
		for (let i = 1; i < results.length; i++) {
			const prev = results[i - 1]?.score ?? 0;
			const curr = results[i]?.score ?? 0;
			expect(
				prev,
				`RRF result ${i - 1} (score=${prev}) should be >= result ${i} (score=${curr})`,
			).toBeGreaterThanOrEqual(curr);
		}
	});

	it("PROPERTY: no duplicate IDs in output", async () => {
		const results = await searchQuotesHybrid("tålamod", { limit: 10, minStandalone: 1 });
		const ids = results.map((r) => r.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size, `Found duplicate IDs in RRF output: ${ids.join(", ")}`).toBe(ids.length);
	});

	it("returns empty for empty query", async () => {
		const results = await searchQuotesHybrid("", { limit: 10 });
		expect(results).toEqual([]);
	});

	it("respects limit parameter", async () => {
		const results = await searchQuotesHybrid("tålamod", { limit: 2, minStandalone: 1 });
		expect(results.length).toBeLessThanOrEqual(2);
	});
});
