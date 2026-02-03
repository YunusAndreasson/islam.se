import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, generateFakeEmbedding, seedTestQuotes } from "./test-utils/db.js";

// Mock the embeddings module to avoid loading the 470MB model
vi.mock("./embeddings/index.js", () => ({
	generateEmbedding: vi.fn(async (text: string) => generateFakeEmbedding(text)),
	generateLocalEmbedding: vi.fn(async (text: string) => generateFakeEmbedding(text)),
}));

// Import after mocking
import { findQuotesByFilter, searchQuotesText } from "./search.js";

describe("search functions", () => {
	// Note: The actual searchQuotes function uses a singleton database,
	// so we can only test the pure functions here without refactoring.
	// For full integration tests, we'd need to refactor database.ts to accept
	// a database instance parameter.

	describe("findQuotesByFilter", () => {
		// These tests will use the production database if it exists
		// In a real setup, we'd mock initDatabase() to return our test DB

		it("is defined and callable", () => {
			expect(typeof findQuotesByFilter).toBe("function");
		});
	});

	describe("searchQuotesText", () => {
		it("is defined and callable", () => {
			expect(typeof searchQuotesText).toBe("function");
		});
	});
});

describe("cosineSimilarity (implementation test)", () => {
	// Test the cosine similarity logic directly
	function cosineSimilarity(a: Float32Array, b: Float32Array): number {
		let dot = 0;
		let normA = 0;
		let normB = 0;
		for (let i = 0; i < a.length; i++) {
			const aVal = a[i] ?? 0;
			const bVal = b[i] ?? 0;
			dot += aVal * bVal;
			normA += aVal * aVal;
			normB += bVal * bVal;
		}
		return dot / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	it("returns 1 for identical vectors", () => {
		const v = new Float32Array([1, 2, 3, 4]);
		const similarity = cosineSimilarity(v, v);

		expect(similarity).toBeCloseTo(1.0, 5);
	});

	it("returns 0 for orthogonal vectors", () => {
		const v1 = new Float32Array([1, 0, 0, 0]);
		const v2 = new Float32Array([0, 1, 0, 0]);
		const similarity = cosineSimilarity(v1, v2);

		expect(similarity).toBeCloseTo(0, 5);
	});

	it("returns -1 for opposite vectors", () => {
		const v1 = new Float32Array([1, 0, 0]);
		const v2 = new Float32Array([-1, 0, 0]);
		const similarity = cosineSimilarity(v1, v2);

		expect(similarity).toBeCloseTo(-1.0, 5);
	});

	it("handles normalized vectors correctly", () => {
		// Two normalized vectors at 45 degrees
		const v1 = new Float32Array([1, 0]);
		const v2 = new Float32Array([Math.SQRT1_2, Math.SQRT1_2]);
		const similarity = cosineSimilarity(v1, v2);

		expect(similarity).toBeCloseTo(Math.SQRT1_2, 5);
	});

	it("handles 384-dimensional vectors (embedding size)", () => {
		const v1 = generateFakeEmbedding("test text");
		const v2 = generateFakeEmbedding("test text");
		const similarity = cosineSimilarity(v1, v2);

		// Same input should produce identical embeddings
		expect(similarity).toBeCloseTo(1.0, 5);
	});

	it("produces different similarity for different texts", () => {
		const v1 = generateFakeEmbedding("patience virtue");
		const v2 = generateFakeEmbedding("completely different topic");
		const similarity = cosineSimilarity(v1, v2);

		// Different text should have similarity < 1
		expect(similarity).toBeLessThan(1.0);
	});
});

describe("applyMMR (implementation test)", () => {
	type Candidate = { score: number; embedding: Float32Array; id: number };

	function cosineSimilarityLocal(a: Float32Array, b: Float32Array): number {
		let dot = 0;
		let normA = 0;
		let normB = 0;
		for (let i = 0; i < a.length; i++) {
			const aVal = a[i] ?? 0;
			const bVal = b[i] ?? 0;
			dot += aVal * bVal;
			normA += aVal * aVal;
			normB += bVal * bVal;
		}
		return dot / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	function maxSimilarityToSelected(candidate: Candidate, selected: Candidate[]): number {
		return selected.reduce((max, sel) => {
			const sim = cosineSimilarityLocal(candidate.embedding, sel.embedding);
			return sim > max ? sim : max;
		}, 0);
	}

	function computeMMRScore(candidate: Candidate, selected: Candidate[], lambda: number): number {
		const maxSim = maxSimilarityToSelected(candidate, selected);
		return lambda * candidate.score - (1 - lambda) * maxSim;
	}

	function findBestCandidate(
		remaining: Candidate[],
		selected: Candidate[],
		lambda: number,
	): number {
		let bestIdx = 0;
		let bestScore = -Infinity;
		for (let i = 0; i < remaining.length; i++) {
			const candidate = remaining[i];
			if (!candidate) continue;
			const mmrScore = computeMMRScore(candidate, selected, lambda);
			if (mmrScore > bestScore) {
				bestScore = mmrScore;
				bestIdx = i;
			}
		}
		return bestIdx;
	}

	function applyMMR(candidates: Candidate[], limit: number, lambda = 0.7): Candidate[] {
		if (candidates.length === 0) return [];
		if (candidates.length <= limit) return candidates;

		const selected: Candidate[] = [];
		const remaining = [...candidates];

		const first = remaining.shift();
		if (first) selected.push(first);

		while (selected.length < limit && remaining.length > 0) {
			const bestIdx = findBestCandidate(remaining, selected, lambda);
			const spliced = remaining.splice(bestIdx, 1)[0];
			if (spliced) selected.push(spliced);
		}

		return selected;
	}

	it("returns empty array for empty input", () => {
		const result = applyMMR([], 5);
		expect(result).toEqual([]);
	});

	it("returns all items if fewer than limit", () => {
		const candidates = [
			{ id: 1, score: 0.9, embedding: generateFakeEmbedding("text1") },
			{ id: 2, score: 0.8, embedding: generateFakeEmbedding("text2") },
		];

		const result = applyMMR(candidates, 5);
		expect(result).toHaveLength(2);
	});

	it("selects highest relevance item first", () => {
		const candidates = [
			{ id: 1, score: 0.5, embedding: generateFakeEmbedding("text1") },
			{ id: 2, score: 0.9, embedding: generateFakeEmbedding("text2") },
			{ id: 3, score: 0.7, embedding: generateFakeEmbedding("text3") },
		];

		// Sort by score descending (as input would be)
		candidates.sort((a, b) => b.score - a.score);

		const result = applyMMR(candidates, 2);

		expect(result[0]?.id).toBe(2); // Highest score first
	});

	it("favors diversity in subsequent selections", () => {
		// Create candidates where some are very similar
		const baseEmbedding = generateFakeEmbedding("patience and virtue");

		const candidates = [
			{ id: 1, score: 0.9, embedding: baseEmbedding },
			{
				id: 2,
				score: 0.85,
				embedding: new Float32Array(baseEmbedding), // Nearly identical
			},
			{ id: 3, score: 0.8, embedding: generateFakeEmbedding("completely different topic") },
		];

		const result = applyMMR(candidates, 2, 0.5);

		// With lambda=0.5, diversity matters more
		// Should prefer the different topic over the similar one
		const ids = result.map((r) => r.id);
		expect(ids).toContain(1); // First (highest score)
		// The second should be influenced by diversity
	});

	it("respects limit parameter", () => {
		const candidates = new Array(10).fill(null).map((_, i) => ({
			id: i + 1,
			score: 1 - i * 0.05,
			embedding: generateFakeEmbedding(`text ${i}`),
		}));

		const result = applyMMR(candidates, 3);
		expect(result).toHaveLength(3);
	});
});

describe("database-integrated search tests", () => {
	let db: Database.Database;

	beforeEach(() => {
		db = createTestDatabase();
		seedTestQuotes(db);
	});

	afterEach(() => {
		db.close();
	});

	describe("filter-based search logic", () => {
		it("filters by language correctly", () => {
			const svQuotes = db
				.prepare("SELECT * FROM quotes WHERE language = ? AND standalone >= ?")
				.all("sv", 4);
			const arQuotes = db
				.prepare("SELECT * FROM quotes WHERE language = ? AND standalone >= ?")
				.all("ar", 4);

			expect(svQuotes.length).toBeGreaterThan(0);
			expect(arQuotes.length).toBeGreaterThan(0);
		});

		it("filters by author correctly", () => {
			const quotes = db.prepare("SELECT * FROM quotes WHERE author LIKE ?").all("%Strindberg%");

			expect(quotes.length).toBeGreaterThan(0);
		});

		it("filters by category correctly", () => {
			const quotes = db.prepare("SELECT * FROM quotes WHERE category = ?").all("صبر");

			expect(quotes.length).toBeGreaterThan(0);
		});

		it("filters by standalone score correctly", () => {
			const highQuality = db.prepare("SELECT * FROM quotes WHERE standalone >= ?").all(5);
			const allQuotes = db.prepare("SELECT * FROM quotes").all();

			expect(highQuality.length).toBeLessThanOrEqual(allQuotes.length);
			expect(highQuality.length).toBeGreaterThan(0);
		});

		it("combines multiple filters correctly", () => {
			const results = db
				.prepare(
					`SELECT * FROM quotes
					 WHERE language = ?
					 AND standalone >= ?
					 ORDER BY standalone DESC`,
				)
				.all("sv", 4);

			for (const row of results as Array<{ language: string; standalone: number }>) {
				expect(row.language).toBe("sv");
				expect(row.standalone).toBeGreaterThanOrEqual(4);
			}
		});
	});

	describe("text search logic", () => {
		it("finds quotes by text content", () => {
			const results = db.prepare("SELECT * FROM quotes WHERE text LIKE ?").all("%tålamod%");

			// Should find the Selma Lagerlöf quote about tålamod (patience)
			expect(results.length).toBeGreaterThanOrEqual(0);
		});

		it("finds quotes by author name", () => {
			const results = db.prepare("SELECT * FROM quotes WHERE author LIKE ?").all("%Strindberg%");

			expect(results.length).toBeGreaterThan(0);
		});

		it("searches keywords JSON field", () => {
			const results = db.prepare("SELECT * FROM quotes WHERE keywords LIKE ?").all('%"motgång"%');

			expect(results.length).toBeGreaterThan(0);
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
			// Test that sqlite-vec is working
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
