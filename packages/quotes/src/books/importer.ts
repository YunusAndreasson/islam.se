/**
 * Book importer with Claude-powered summarization.
 *
 * Workflow:
 * 1. Fetch text (reuse fetcher.ts)
 * 2. Detect and split chapters
 * 3. Chunk into passages
 * 4. Generate chapter summaries via ClaudeRunner (subscription)
 * 5. Generate book summary from chapter summaries
 * 6. Embed passages + summaries locally (free)
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { generateLocalEmbedding, generateLocalEmbeddings } from "../embeddings/local.js";
import { fetchText } from "../fetcher.js";
import { type ChunkingOptions, chunkBook } from "./chunker.js";
import {
	type Book,
	deleteBook,
	getBookByUrl,
	initBookDatabase,
	insertBook,
	insertChapter,
	insertPassage,
	insertPassageEmbedding,
	insertSummaryEmbedding,
	updateBook,
	updateChapter,
} from "./database.js";

// ============================================================================
// Types
// ============================================================================

export interface ImportOptions extends ChunkingOptions {
	/** Override the detected title */
	title?: string;
	/** Override the detected author */
	author?: string;
	/** Skip summarization (faster, but no concept search) */
	skipSummarization?: boolean;
	/** Progress callback */
	onProgress?: (message: string) => void;
	/** Re-import if book already exists */
	forceReimport?: boolean;
}

export interface ImportResult {
	success: boolean;
	bookId?: number;
	book?: Book;
	chaptersImported: number;
	passagesImported: number;
	error?: string;
}

// ============================================================================
// Claude Runner (inline for simplicity - avoids cross-package import)
// ============================================================================

interface ClaudeRunOptions {
	prompt: string;
	systemPrompt?: string;
	model?: string;
}

interface ClaudeRunResult {
	success: boolean;
	output?: string;
	error?: string;
}

async function runClaude(options: ClaudeRunOptions): Promise<ClaudeRunResult> {
	const args = ["--print", "--model", options.model ?? "claude-opus-4-5-20251101"];

	if (options.systemPrompt) {
		args.push("--append-system-prompt", options.systemPrompt);
	}

	args.push(options.prompt);

	return new Promise((resolve) => {
		const child = spawn("claude", args, {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, ANTHROPIC_HEADLESS: "1" },
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
		});

		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolve({ success: true, output: stdout.trim() });
			} else {
				resolve({ success: false, error: stderr || `Exit code: ${code}` });
			}
		});

		child.on("error", (err) => {
			resolve({ success: false, error: err.message });
		});
	});
}

// ============================================================================
// Metadata Detection
// ============================================================================

/**
 * Fetches metadata from Gutenberg API as fallback.
 */
async function fetchGutenbergMetadata(
	gutenbergId: string,
): Promise<{ title: string; author: string } | null> {
	try {
		const response = await fetch(`https://gutendex.com/books/${gutenbergId}/`);
		if (!response.ok) return null;
		const data = (await response.json()) as {
			title?: string;
			authors?: { name: string }[];
		};
		return {
			title: data.title ?? "Unknown Title",
			author: data.authors?.[0]?.name ?? "Unknown Author",
		};
	} catch {
		return null;
	}
}

/**
 * Attempts to detect book metadata from text content.
 * Works with Gutenberg and OpenITI formats.
 */
function detectMetadata(
	text: string,
	url: string,
): { title: string; author: string; language: "sv" | "ar" | "en" } {
	let title = "Unknown Title";
	let author = "Unknown Author";
	let language: "sv" | "ar" | "en" = "sv";

	// Only look at the header section (first 3000 chars)
	const header = text.slice(0, 3000);

	// Detect language from URL or content
	if (url.includes("openiti") || /[\u0600-\u06FF]/.test(text.slice(0, 1000))) {
		language = "ar";
	} else if (url.includes("gutenberg.org")) {
		// Check Language field first, then content
		const langMatch = header.match(/^Language:\s*(.+)$/im);
		const langField = langMatch?.[1]?.toLowerCase() ?? "";
		if (langField.includes("swedish") && !langField.includes("english")) {
			language = "sv";
		} else if (langField.includes("english") && !langField.includes("swedish")) {
			language = "en";
		} else if (/[åäöÅÄÖ]/.test(text.slice(0, 5000))) {
			// Bilingual or unclear - check content for Swedish characters
			language = "sv";
		} else {
			language = "en";
		}
	}

	// Try to extract title - Gutenberg format: "Title: X" on its own line
	const titlePatterns = [
		/^Title:\s*(.+)$/im,
		/The Project Gutenberg eBook of ([^,\n]+)/i,
		/^#\s+(.+)$/m,
	];
	for (const pattern of titlePatterns) {
		const match = header.match(pattern);
		if (match?.[1]) {
			// Clean up the title
			let t = match[1].trim();
			// Remove trailing "by Author" if present
			t = t.replace(/,?\s+by\s+.+$/i, "");
			if (t && t.length > 2) {
				title = t;
				break;
			}
		}
	}

	// Try to extract author - Gutenberg format: "Author: X" on its own line
	const authorPatterns = [
		/^Author:\s*(.+)$/im,
		/^Creator:\s*(.+)$/im,
		/eBook of .+,?\s+by\s+([^\n]+)/i,
	];
	for (const pattern of authorPatterns) {
		const match = header.match(pattern);
		if (match?.[1]) {
			const a = match[1].trim();
			if (a && a.length > 2 && !a.toLowerCase().includes("unknown")) {
				author = a;
				break;
			}
		}
	}

	return { title, author, language };
}

/**
 * Enhanced metadata detection with Gutenberg API fallback.
 */
async function detectMetadataWithFallback(
	text: string,
	url: string,
): Promise<{ title: string; author: string; language: "sv" | "ar" | "en" }> {
	const detected = detectMetadata(text, url);

	// If we got good metadata from text, use it
	if (detected.author !== "Unknown Author" && detected.title !== "Unknown Title") {
		return detected;
	}

	// Try Gutenberg API fallback for Gutenberg URLs
	if (url.includes("gutenberg.org")) {
		const idMatch = url.match(/(\d+)/);
		const gutenbergId = idMatch?.[1];
		if (gutenbergId) {
			const apiMeta = await fetchGutenbergMetadata(gutenbergId);
			if (apiMeta) {
				return {
					title: detected.title === "Unknown Title" ? apiMeta.title : detected.title,
					author: detected.author === "Unknown Author" ? apiMeta.author : detected.author,
					language: detected.language,
				};
			}
		}
	}

	// Final fallback: use Gutenberg ID in title
	if (detected.title === "Unknown Title" && url.includes("gutenberg.org")) {
		const fallbackMatch = url.match(/(\d+)/);
		const fallbackId = fallbackMatch?.[1];
		if (fallbackId) {
			detected.title = `Gutenberg Book ${fallbackId}`;
		}
	}

	return detected;
}

// ============================================================================
// Summarization
// ============================================================================

const ChapterSummarySchema = z.object({
	summary: z.string().describe("A concise summary of the chapter (2-3 sentences)"),
	keyConcepts: z.array(z.string()).describe("3-5 key concepts or themes from this chapter"),
});

const BookSummarySchema = z.object({
	summary: z.string().describe("A comprehensive summary of the entire book (3-5 sentences)"),
	keyConcepts: z.array(z.string()).describe("5-10 key concepts or themes from the book"),
});

type ChapterSummary = z.infer<typeof ChapterSummarySchema>;
type BookSummary = z.infer<typeof BookSummarySchema>;

/**
 * Generates a summary for a chapter using Claude.
 */
async function summarizeChapter(
	chapterText: string,
	chapterTitle: string | null,
	bookTitle: string,
	language: "sv" | "ar" | "en",
): Promise<ChapterSummary | null> {
	const languageInstr =
		language === "sv"
			? "Respond in Swedish."
			: language === "ar"
				? "Respond in Arabic."
				: "Respond in English.";

	const prompt = `Summarize this chapter from "${bookTitle}"${chapterTitle ? ` (${chapterTitle})` : ""}:

<chapter>
${chapterText.slice(0, 15000)}
</chapter>

${languageInstr}

Respond with JSON only:
{
  "summary": "A concise summary (2-3 sentences)",
  "keyConcepts": ["concept1", "concept2", "concept3"]
}`;

	const result = await runClaude({
		prompt,
		systemPrompt:
			"You are a literary analyst. Extract key themes and create concise summaries. Respond with valid JSON only, no markdown.",
	});

	if (!result.success || !result.output) {
		return null;
	}

	try {
		// Extract JSON from response
		const jsonMatch = result.output.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return null;
		const parsed = JSON.parse(jsonMatch[0]);
		return ChapterSummarySchema.parse(parsed);
	} catch {
		return null;
	}
}

/**
 * Generates a book summary from chapter summaries.
 */
async function summarizeBook(
	chapterSummaries: { title: string | null; summary: string }[],
	bookTitle: string,
	author: string,
	language: "sv" | "ar" | "en",
): Promise<BookSummary | null> {
	const languageInstr =
		language === "sv"
			? "Respond in Swedish."
			: language === "ar"
				? "Respond in Arabic."
				: "Respond in English.";

	const summariesText = chapterSummaries
		.map((ch, i) => `Chapter ${i + 1}${ch.title ? ` (${ch.title})` : ""}: ${ch.summary}`)
		.join("\n\n");

	const prompt = `Create an overall summary for "${bookTitle}" by ${author}, based on these chapter summaries:

${summariesText}

${languageInstr}

Respond with JSON only:
{
  "summary": "A comprehensive summary of the book (3-5 sentences)",
  "keyConcepts": ["concept1", "concept2", "concept3", "concept4", "concept5"]
}`;

	const result = await runClaude({
		prompt,
		systemPrompt:
			"You are a literary analyst. Create comprehensive book summaries. Respond with valid JSON only, no markdown.",
	});

	if (!result.success || !result.output) {
		return null;
	}

	try {
		const jsonMatch = result.output.match(/\{[\s\S]*\}/);
		if (!jsonMatch) return null;
		const parsed = JSON.parse(jsonMatch[0]);
		return BookSummarySchema.parse(parsed);
	} catch {
		return null;
	}
}

// ============================================================================
// Main Import Function
// ============================================================================

/**
 * Imports a book from a URL or local file path.
 */
export async function importBook(
	urlOrPath: string,
	options: ImportOptions = {},
): Promise<ImportResult> {
	const {
		title: overrideTitle,
		author: overrideAuthor,
		skipSummarization = true, // Default to skip (no API cost)
		onProgress = console.log,
		forceReimport = false,
		...chunkingOptions
	} = options;

	// Initialize database
	initBookDatabase();

	// Check if already imported
	const existing = getBookByUrl(urlOrPath);
	if (existing && !forceReimport) {
		onProgress(`Book already imported: "${existing.title}" (ID: ${existing.id})`);
		return {
			success: true,
			bookId: existing.id,
			book: existing,
			chaptersImported: existing.totalChapters,
			passagesImported: existing.totalPassages,
		};
	}

	if (existing && forceReimport) {
		onProgress(`Removing existing book for re-import...`);
		deleteBook(existing.id);
	}

	try {
		// Step 1: Fetch text
		onProgress(`Fetching text from ${urlOrPath}...`);
		const { text } = await fetchText(urlOrPath);
		onProgress(`  Fetched ${text.length.toLocaleString()} characters`);

		// Step 2: Detect metadata (with API fallback for Gutenberg)
		onProgress(`  Detecting metadata...`);
		const detected = await detectMetadataWithFallback(text, urlOrPath);
		const bookTitle = overrideTitle ?? detected.title;
		const bookAuthor = overrideAuthor ?? detected.author;
		const language = chunkingOptions.language ?? detected.language;

		onProgress(`  Detected: "${bookTitle}" by ${bookAuthor} (${language})`);

		// Step 3: Chunk the book
		onProgress(`Chunking text...`);
		const { chapters, chunks } = chunkBook(text, { ...chunkingOptions, language });
		onProgress(`  Found ${chapters.length} chapters, ${chunks.length} passages`);

		// Step 4: Insert book record
		const bookId = insertBook({
			title: bookTitle,
			author: bookAuthor,
			language,
			sourceUrl: urlOrPath,
			summary: null,
			keyConcepts: [],
			totalChapters: chapters.length,
			totalPassages: chunks.length,
		});

		// Step 5: Insert chapters
		onProgress(`Importing chapters...`);
		const chapterIdMap = new Map<number, number>(); // chapterIndex -> chapterId

		for (let i = 0; i < chapters.length; i++) {
			const chapter = chapters[i];
			if (!chapter) continue;
			const chapterId = insertChapter({
				bookId,
				chapterNumber: chapter.number,
				title: chapter.title,
				summary: null,
				keyConcepts: [],
				startPosition: chapter.startPosition,
				endPosition: chapter.endPosition,
			});
			chapterIdMap.set(i, chapterId);
		}

		// Step 6: Insert passages and generate embeddings
		onProgress(`Importing passages and generating embeddings...`);
		const passageTexts: string[] = [];
		const passageIds: number[] = [];

		for (const chunk of chunks) {
			const chapterId = chunk.chapterIndex !== null ? chapterIdMap.get(chunk.chapterIndex) : null;
			const passageId = insertPassage({
				bookId,
				chapterId: chapterId ?? null,
				passageNumber: chunk.passageNumber,
				text: chunk.text,
				startPosition: chunk.startPosition,
				endPosition: chunk.endPosition,
			});
			passageTexts.push(chunk.text);
			passageIds.push(passageId);
		}

		// Generate embeddings in batches (free - local)
		onProgress(`  Generating embeddings for ${passageTexts.length} passages...`);
		const passageEmbeddings = await generateLocalEmbeddings(passageTexts, "passage");

		for (let i = 0; i < passageIds.length; i++) {
			const passageId = passageIds[i];
			const embedding = passageEmbeddings[i];
			if (passageId !== undefined && embedding) {
				insertPassageEmbedding(passageId, embedding);
			}
		}

		// Step 7: Summarization (optional, uses subscription)
		if (!skipSummarization) {
			onProgress(`Generating summaries via Claude (subscription)...`);

			const chapterSummaries: { title: string | null; summary: string }[] = [];

			for (let i = 0; i < chapters.length; i++) {
				const chapter = chapters[i];
				if (!chapter) continue;
				onProgress(`  Summarizing chapter ${i + 1}/${chapters.length}...`);

				const summary = await summarizeChapter(chapter.text, chapter.title, bookTitle, language);

				if (summary) {
					const chapterId = chapterIdMap.get(i);
					if (chapterId === undefined) continue;
					updateChapter(chapterId, {
						summary: summary.summary,
						keyConcepts: summary.keyConcepts,
					});

					// Generate embedding for chapter summary
					const summaryEmbedding = await generateLocalEmbedding(
						`${chapter.title ?? `Chapter ${chapter.number}`}: ${summary.summary}`,
						"passage",
					);
					insertSummaryEmbedding("chapter", chapterId, summaryEmbedding);

					chapterSummaries.push({
						title: chapter.title,
						summary: summary.summary,
					});
				}
			}

			// Generate book summary from chapter summaries
			if (chapterSummaries.length > 0) {
				onProgress(`  Generating book summary...`);
				const bookSummary = await summarizeBook(chapterSummaries, bookTitle, bookAuthor, language);

				if (bookSummary) {
					updateBook(bookId, {
						summary: bookSummary.summary,
						keyConcepts: bookSummary.keyConcepts,
					});

					// Generate embedding for book summary
					const bookSummaryEmbedding = await generateLocalEmbedding(
						`${bookTitle} by ${bookAuthor}: ${bookSummary.summary}`,
						"passage",
					);
					insertSummaryEmbedding("book", bookId, bookSummaryEmbedding);
				}
			}
		}

		onProgress(`✓ Successfully imported "${bookTitle}"`);
		onProgress(`  ${chapters.length} chapters, ${chunks.length} passages`);

		const book = {
			id: bookId,
			title: bookTitle,
			author: bookAuthor,
			language,
			sourceUrl: urlOrPath,
			summary: null,
			keyConcepts: [],
			totalChapters: chapters.length,
			totalPassages: chunks.length,
			importedAt: new Date().toISOString(),
		} as Book;

		return {
			success: true,
			bookId,
			book,
			chaptersImported: chapters.length,
			passagesImported: chunks.length,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		onProgress(`✗ Import failed: ${message}`);
		return {
			success: false,
			chaptersImported: 0,
			passagesImported: 0,
			error: message,
		};
	}
}

/**
 * Imports multiple books from a file containing URLs (one per line).
 * Lines starting with "# DONE " are skipped.
 */
export async function importBooksFromFile(
	filePath: string,
	options: ImportOptions = {},
): Promise<{ imported: number; skipped: number; failed: number }> {
	const { onProgress = console.log, ...importOptions } = options;

	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n").filter((line) => line.trim());

	let imported = 0;
	let skipped = 0;
	let failed = 0;

	for (const line of lines) {
		const trimmed = line.trim();

		// Skip comments and done markers
		if (trimmed.startsWith("#") || trimmed.startsWith("//")) {
			if (trimmed.startsWith("# DONE ")) {
				skipped++;
			}
			continue;
		}

		// Skip empty lines
		if (!trimmed) continue;

		onProgress(`\n=== Importing: ${trimmed} ===`);
		const result = await importBook(trimmed, { ...importOptions, onProgress });

		if (result.success) {
			imported++;
		} else {
			failed++;
		}
	}

	return { imported, skipped, failed };
}
