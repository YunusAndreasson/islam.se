import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseQuoteRow, type RawQuoteRow } from "./database.js";
// We need to test the database module, but it uses a singleton pattern with
// a file-based database. We'll test the logic by creating isolated test databases.
import {
	createTestDatabase,
	generateFakeEmbedding,
	insertTestQuote,
	type TestQuote,
} from "./test-utils/db.js";

describe("database operations", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = createTestDatabase();
	});

	afterEach(() => {
		db.close();
	});

	describe("schema creation", () => {
		it("creates quotes table with correct columns", () => {
			const tableInfo = db.prepare("PRAGMA table_info(quotes)").all() as {
				name: string;
				type: string;
			}[];
			const columnNames = tableInfo.map((c) => c.name);

			expect(columnNames).toContain("id");
			expect(columnNames).toContain("text");
			expect(columnNames).toContain("author");
			expect(columnNames).toContain("work_title");
			expect(columnNames).toContain("category");
			expect(columnNames).toContain("keywords");
			expect(columnNames).toContain("tone");
			expect(columnNames).toContain("standalone");
			expect(columnNames).toContain("length");
			expect(columnNames).toContain("language");
		});

		it("creates quote_embeddings virtual table", () => {
			// Virtual tables don't show in sqlite_master as 'table'
			const tables = db
				.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='quote_embeddings'")
				.all() as { name: string }[];

			expect(tables.length).toBe(1);
		});
	});

	describe("insertTestQuote", () => {
		it("returns ID for new quote", () => {
			const quote: TestQuote = {
				text: "Test quote text",
				author: "Test Author",
				workTitle: "Test Work",
			};

			const id = insertTestQuote(db, quote);

			expect(id).toBe(1);
		});

		it("increments ID for subsequent quotes", () => {
			const id1 = insertTestQuote(db, {
				text: "First quote",
				author: "Author 1",
				workTitle: "Work 1",
			});
			const id2 = insertTestQuote(db, {
				text: "Second quote",
				author: "Author 2",
				workTitle: "Work 2",
			});

			expect(id1).toBe(1);
			expect(id2).toBe(2);
		});

		it("computes correct length category for short text", () => {
			insertTestQuote(db, {
				text: "Short", // 5 chars < 50
				author: "Author",
				workTitle: "Work",
			});

			const row = db.prepare("SELECT length FROM quotes WHERE id = 1").get() as {
				length: string;
			};
			expect(row.length).toBe("short");
		});

		it("computes correct length category for medium text", () => {
			insertTestQuote(db, {
				text: "A".repeat(100), // 100 chars, >= 50 and < 150
				author: "Author",
				workTitle: "Work",
			});

			const row = db.prepare("SELECT length FROM quotes WHERE id = 1").get() as {
				length: string;
			};
			expect(row.length).toBe("medium");
		});

		it("computes correct length category for long text", () => {
			insertTestQuote(db, {
				text: "A".repeat(200), // 200 chars >= 150
				author: "Author",
				workTitle: "Work",
			});

			const row = db.prepare("SELECT length FROM quotes WHERE id = 1").get() as {
				length: string;
			};
			expect(row.length).toBe("long");
		});

		it("stores keywords as JSON string", () => {
			insertTestQuote(db, {
				text: "Quote with keywords",
				author: "Author",
				workTitle: "Work",
				keywords: ["keyword1", "keyword2"],
			});

			const row = db.prepare("SELECT keywords FROM quotes WHERE id = 1").get() as {
				keywords: string;
			};
			expect(JSON.parse(row.keywords)).toEqual(["keyword1", "keyword2"]);
		});

		it("stores embedding when provided", () => {
			const embedding = generateFakeEmbedding("test text");
			insertTestQuote(db, {
				text: "Quote with embedding",
				author: "Author",
				workTitle: "Work",
				embedding,
			});

			const row = db.prepare("SELECT embedding FROM quote_embeddings WHERE rowid = 1").get() as {
				embedding: Buffer;
			};
			expect(row.embedding).toBeDefined();
			expect(row.embedding.length).toBe(384 * 4); // 384 floats * 4 bytes each
		});

		it("defaults language to sv", () => {
			insertTestQuote(db, {
				text: "Quote without language",
				author: "Author",
				workTitle: "Work",
			});

			const row = db.prepare("SELECT language FROM quotes WHERE id = 1").get() as {
				language: string;
			};
			expect(row.language).toBe("sv");
		});

		it("stores specified language correctly", () => {
			insertTestQuote(db, {
				text: "Arabic quote",
				author: "Author",
				workTitle: "Work",
				language: "ar",
			});

			const row = db.prepare("SELECT language FROM quotes WHERE id = 1").get() as {
				language: string;
			};
			expect(row.language).toBe("ar");
		});
	});

	describe("UNIQUE constraint on text", () => {
		it("prevents duplicate quote text", () => {
			insertTestQuote(db, {
				text: "Duplicate text",
				author: "Author 1",
				workTitle: "Work 1",
			});

			expect(() => {
				insertTestQuote(db, {
					text: "Duplicate text",
					author: "Author 2",
					workTitle: "Work 2",
				});
			}).toThrow(/UNIQUE constraint failed/);
		});

		it("allows different text with same author", () => {
			insertTestQuote(db, {
				text: "First text",
				author: "Same Author",
				workTitle: "Work",
			});

			expect(() => {
				insertTestQuote(db, {
					text: "Second text",
					author: "Same Author",
					workTitle: "Work",
				});
			}).not.toThrow();
		});
	});

	describe("getQuote equivalent", () => {
		it("retrieves quote by ID", () => {
			insertTestQuote(db, {
				text: "Test quote",
				author: "Test Author",
				workTitle: "Test Work",
				category: "test",
				keywords: ["kw1", "kw2"],
				tone: "neutral",
				standalone: 4,
			});

			const row = db
				.prepare(
					`SELECT id, text, author, work_title as workTitle, category, keywords, tone, standalone
				 FROM quotes WHERE id = 1`,
				)
				.get() as {
				id: number;
				text: string;
				author: string;
				workTitle: string;
				category: string;
				keywords: string;
				tone: string;
				standalone: number;
			};

			expect(row.id).toBe(1);
			expect(row.text).toBe("Test quote");
			expect(row.author).toBe("Test Author");
			expect(row.workTitle).toBe("Test Work");
			expect(row.category).toBe("test");
			expect(JSON.parse(row.keywords)).toEqual(["kw1", "kw2"]);
			expect(row.tone).toBe("neutral");
			expect(row.standalone).toBe(4);
		});

		it("returns undefined for non-existent ID", () => {
			const row = db.prepare("SELECT * FROM quotes WHERE id = 999").get();
			expect(row).toBeUndefined();
		});
	});

	describe("getStats equivalent", () => {
		it("returns accurate counts", () => {
			// Insert quotes in different languages
			insertTestQuote(db, { text: "Swedish 1", author: "A", workTitle: "W", language: "sv" });
			insertTestQuote(db, { text: "Swedish 2", author: "A", workTitle: "W", language: "sv" });
			insertTestQuote(db, { text: "Arabic 1", author: "A", workTitle: "W", language: "ar" });
			insertTestQuote(db, { text: "English 1", author: "A", workTitle: "W", language: "en" });

			const total = (db.prepare("SELECT COUNT(*) as count FROM quotes").get() as { count: number })
				.count;
			const swedish = (
				db.prepare("SELECT COUNT(*) as count FROM quotes WHERE language = 'sv'").get() as {
					count: number;
				}
			).count;
			const arabic = (
				db.prepare("SELECT COUNT(*) as count FROM quotes WHERE language = 'ar'").get() as {
					count: number;
				}
			).count;
			const english = (
				db.prepare("SELECT COUNT(*) as count FROM quotes WHERE language = 'en'").get() as {
					count: number;
				}
			).count;

			expect(total).toBe(4);
			expect(swedish).toBe(2);
			expect(arabic).toBe(1);
			expect(english).toBe(1);
		});

		it("counts distinct authors and works", () => {
			insertTestQuote(db, { text: "Quote 1", author: "Author A", workTitle: "Work 1" });
			insertTestQuote(db, { text: "Quote 2", author: "Author A", workTitle: "Work 2" });
			insertTestQuote(db, { text: "Quote 3", author: "Author B", workTitle: "Work 2" });

			const authors = (
				db.prepare("SELECT COUNT(DISTINCT author) as count FROM quotes").get() as {
					count: number;
				}
			).count;
			const works = (
				db.prepare("SELECT COUNT(DISTINCT work_title) as count FROM quotes").get() as {
					count: number;
				}
			).count;

			expect(authors).toBe(2);
			expect(works).toBe(2);
		});
	});

	describe("generateFakeEmbedding", () => {
		it("returns 384-dimensional Float32Array", () => {
			const embedding = generateFakeEmbedding("test text");

			expect(embedding).toBeInstanceOf(Float32Array);
			expect(embedding.length).toBe(384);
		});

		it("returns deterministic results for same input", () => {
			const embedding1 = generateFakeEmbedding("same text");
			const embedding2 = generateFakeEmbedding("same text");

			expect(embedding1).toEqual(embedding2);
		});

		it("returns different results for different input", () => {
			const embedding1 = generateFakeEmbedding("text one");
			const embedding2 = generateFakeEmbedding("text two");

			expect(embedding1).not.toEqual(embedding2);
		});
	});
});

describe("parseQuoteRow resilience", () => {
	const baseRow: RawQuoteRow = {
		id: 1,
		text: "Test quote",
		author: "Test Author",
		workTitle: "Test Work",
		category: "wisdom",
		keywords: '["keyword1", "keyword2"]',
		tone: "neutral",
		standalone: 4,
		length: "medium",
		language: "sv",
		sourceType: null,
		createdAt: "2026-01-01T00:00:00Z",
	};

	it("parses valid keywords JSON correctly", () => {
		const result = parseQuoteRow(baseRow);
		expect(result.keywords).toEqual(["keyword1", "keyword2"]);
	});

	it("handles empty keywords string by defaulting to empty array", () => {
		const row = { ...baseRow, keywords: "" };
		const result = parseQuoteRow(row);
		expect(result.keywords, "Empty keywords string should parse to []").toEqual([]);
	});

	it("handles null-ish keywords via fallback", () => {
		// The || "[]" fallback handles falsy values
		const row = { ...baseRow, keywords: "" };
		expect(() => parseQuoteRow(row)).not.toThrow();
	});

	it("throws on malformed keywords JSON — this is the crash risk", () => {
		// Bug documentation: if a quote has non-JSON keywords in the DB,
		// every search returning that quote crashes with a JSON.parse error.
		// This test documents the current behavior (throws) so any fix is intentional.
		const row = { ...baseRow, keywords: "not valid json" };
		expect(
			() => parseQuoteRow(row),
			"Malformed keywords JSON should throw — this is the known crash risk in parseQuoteRow",
		).toThrow();
	});

	it("preserves all other fields unchanged", () => {
		const result = parseQuoteRow(baseRow);
		expect(result.id).toBe(1);
		expect(result.text).toBe("Test quote");
		expect(result.author).toBe("Test Author");
		expect(result.workTitle).toBe("Test Work");
		expect(result.category).toBe("wisdom");
		expect(result.tone).toBe("neutral");
		expect(result.standalone).toBe(4);
		expect(result.length).toBe("medium");
		expect(result.language).toBe("sv");
	});

	it("handles Arabic content in all fields", () => {
		const arabicRow: RawQuoteRow = {
			...baseRow,
			text: "الصبر مفتاح الفرج",
			author: "علي بن أبي طالب",
			workTitle: "نهج البلاغة",
			category: "صبر",
			keywords: '["صبر", "حكمة"]',
			language: "ar",
		};
		const result = parseQuoteRow(arabicRow);
		expect(result.keywords).toEqual(["صبر", "حكمة"]);
		expect(result.author).toBe("علي بن أبي طالب");
	});
});
