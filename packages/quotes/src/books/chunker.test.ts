import { describe, expect, it } from "vitest";
import {
	type ChunkingOptions,
	chunkBook,
	chunkText,
	detectChapters,
	estimatePassageCount,
} from "./chunker.js";

describe("chunkText", () => {
	it("returns single chunk for text shorter than targetSize", () => {
		const text = "This is a short text.";
		const chunks = chunkText(text, { targetSize: 100 });

		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.text).toBe(text);
		expect(chunks[0]?.passageNumber).toBe(1);
	});

	it("produces overlapping chunks for long text", () => {
		// Create a text with clear paragraph breaks
		const paragraphs = new Array(10)
			.fill(null)
			.map((_, i) => `Paragraph ${i + 1}. This is some content that fills the paragraph.`)
			.join("\n\n");

		const chunks = chunkText(paragraphs, { targetSize: 200, overlap: 50 });

		expect(chunks.length).toBeGreaterThan(1);

		// Check that chunks have correct passage numbers
		for (let i = 0; i < chunks.length; i++) {
			expect(chunks[i]?.passageNumber).toBe(i + 1);
		}
	});

	it("respects targetSize option approximately", () => {
		const text = "A".repeat(1000);
		const chunks = chunkText(text, { targetSize: 200, overlap: 50 });

		// Most chunks should be around targetSize (with some flexibility for boundaries)
		for (const chunk of chunks.slice(0, -1)) {
			// All but last
			expect(chunk.text.length).toBeGreaterThanOrEqual(100);
			expect(chunk.text.length).toBeLessThanOrEqual(400);
		}
	});

	it("finds split points at paragraph boundaries", () => {
		const text =
			"First paragraph content here.\n\nSecond paragraph content here.\n\nThird paragraph.";
		const chunks = chunkText(text, { targetSize: 50, overlap: 10 });

		// Should split at paragraph boundaries when possible
		expect(chunks.length).toBeGreaterThan(1);
		// First chunk should end cleanly
		expect(chunks[0]?.text).not.toMatch(/\n$/);
	});

	it("falls back to sentence boundaries", () => {
		const text = "First sentence here. Second sentence here. Third sentence here. Fourth sentence.";
		const chunks = chunkText(text, { targetSize: 40, overlap: 10 });

		expect(chunks.length).toBeGreaterThan(1);
	});

	it("handles text with no natural boundaries", () => {
		const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(10);
		const chunks = chunkText(text, { targetSize: 50, overlap: 10 });

		expect(chunks.length).toBeGreaterThan(1);
		// All text should be covered
		const totalLength = chunks.reduce((sum, c) => sum + c.text.length, 0);
		expect(totalLength).toBeGreaterThanOrEqual(text.length);
	});
});

describe("detectChapters", () => {
	it("finds Swedish chapter markers (Kapitel)", () => {
		const text = `Förord här.

Kapitel 1

Första kapitlets innehåll.

Kapitel 2

Andra kapitlets innehåll.`;

		const chapters = detectChapters(text, "sv");

		expect(chapters.length).toBeGreaterThanOrEqual(2);
		expect(chapters.some((c) => c.title?.includes("Kapitel 1"))).toBe(true);
		expect(chapters.some((c) => c.title?.includes("Kapitel 2"))).toBe(true);
	});

	it("finds Swedish ordinal chapter markers", () => {
		const text = `Första kapitlet

Content here.

Andra kapitlet

More content.`;

		const chapters = detectChapters(text, "sv");

		expect(chapters.length).toBeGreaterThanOrEqual(2);
	});

	it("finds Arabic chapter markers (باب)", () => {
		const text = `مقدمة

باب الأول

محتوى الباب الأول

فصل الثاني

محتوى الفصل`;

		const chapters = detectChapters(text, "ar");

		expect(chapters.length).toBeGreaterThanOrEqual(2);
	});

	it("finds English chapter markers", () => {
		const text = `Preface here.

Chapter 1

First chapter content.

Chapter 2

Second chapter content.`;

		const chapters = detectChapters(text, "en");

		expect(chapters.length).toBeGreaterThanOrEqual(2);
		expect(chapters.some((c) => c.title?.includes("Chapter 1"))).toBe(true);
	});

	it("finds markdown headers as chapters", () => {
		const text = `# Introduction

Some intro text.

## Part One

Content for part one.

## Part Two

Content for part two.`;

		const chapters = detectChapters(text, "en");

		expect(chapters.length).toBeGreaterThanOrEqual(2);
	});

	it("creates single chapter for unmarked text", () => {
		const text = "This is just plain text without any chapter markers. It goes on and on.";

		const chapters = detectChapters(text, "sv");

		expect(chapters).toHaveLength(1);
		expect(chapters[0]?.number).toBe(1);
		expect(chapters[0]?.title).toBeNull();
		expect(chapters[0]?.text).toBe(text);
	});

	it("adds preamble chapter for content before first chapter", () => {
		const preambleText =
			"This is a substantial preamble that has more than 100 characters of content before the first chapter marker appears in the text.";
		const text = `${preambleText}

Kapitel 1

First chapter content.`;

		const chapters = detectChapters(text, "sv");

		// Should have preamble + chapter
		expect(chapters.length).toBeGreaterThanOrEqual(2);
		expect(chapters[0]?.title).toBe("Förord"); // Swedish preamble title
	});

	it("uses correct preamble title for each language", () => {
		const preambleText = "A".repeat(150);

		const svChapters = detectChapters(`${preambleText}\n\nKapitel 1\n\nContent`, "sv");
		const arChapters = detectChapters(`${preambleText}\n\nباب الأول\n\nContent`, "ar");
		const enChapters = detectChapters(`${preambleText}\n\nChapter 1\n\nContent`, "en");

		expect(svChapters[0]?.title).toBe("Förord");
		expect(arChapters[0]?.title).toBe("مقدمة");
		expect(enChapters[0]?.title).toBe("Preface");
	});
});

describe("chunkBook", () => {
	it("combines chapter detection with chunking", () => {
		const text = `Kapitel 1

${"Content ".repeat(200)}

Kapitel 2

${"More content ".repeat(200)}`;

		const result = chunkBook(text, { targetSize: 500, overlap: 100, language: "sv" });

		expect(result.chapters.length).toBeGreaterThanOrEqual(2);
		expect(result.chunks.length).toBeGreaterThan(result.chapters.length);

		// All chunks should have chapterIndex
		for (const chunk of result.chunks) {
			expect(chunk.chapterIndex).not.toBeNull();
		}
	});

	it("assigns correct chapterIndex to chunks", () => {
		const text = `Kapitel 1

Short content.

Kapitel 2

Another short content.`;

		const result = chunkBook(text, { targetSize: 1000, language: "sv" });

		// With large targetSize, each chapter should be one chunk
		for (const chunk of result.chunks) {
			expect(typeof chunk.chapterIndex).toBe("number");
		}
	});

	it("uses global passage numbering across chapters", () => {
		const text = `Kapitel 1

First chapter.

Kapitel 2

Second chapter.`;

		const result = chunkBook(text, { targetSize: 1000, language: "sv" });

		const passageNumbers = result.chunks.map((c) => c.passageNumber);
		const uniqueNumbers = [...new Set(passageNumbers)];

		// All passage numbers should be unique
		expect(uniqueNumbers.length).toBe(passageNumbers.length);

		// Should start at 1 and be sequential
		expect(passageNumbers[0]).toBe(1);
	});
});

describe("estimatePassageCount", () => {
	it("calculates correct estimates for default options", () => {
		// targetSize=800, overlap=200 means effectiveStep=600
		const options: ChunkingOptions = { targetSize: 800, overlap: 200 };

		expect(estimatePassageCount(600, options)).toBe(1);
		expect(estimatePassageCount(1200, options)).toBe(2);
		expect(estimatePassageCount(1800, options)).toBe(3);
	});

	it("handles custom targetSize and overlap", () => {
		// targetSize=1000, overlap=100 means effectiveStep=900
		const options: ChunkingOptions = { targetSize: 1000, overlap: 100 };

		expect(estimatePassageCount(900, options)).toBe(1);
		expect(estimatePassageCount(1800, options)).toBe(2);
	});

	it("uses default values when options not provided", () => {
		// Default: targetSize=800, overlap=200, effectiveStep=600
		expect(estimatePassageCount(600)).toBe(1);
		expect(estimatePassageCount(1200)).toBe(2);
	});
});
