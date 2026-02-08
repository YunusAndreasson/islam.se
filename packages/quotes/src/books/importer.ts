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
	beginBookTransaction,
	commitBookTransaction,
	deleteBook,
	getAllBooks,
	getBook,
	getBookByUrl,
	getChaptersByBook,
	getPassagesByChapter,
	initBookDatabase,
	insertBook,
	insertChapter,
	insertPassage,
	insertPassageEmbedding,
	insertSummaryEmbedding,
	rollbackBookTransaction,
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
	const args = ["--print", "--model", options.model ?? "claude-opus-4-6"];

	if (options.systemPrompt) {
		args.push("--append-system-prompt", options.systemPrompt);
	}

	// Pass prompt via stdin to avoid shell argument length/encoding issues with Arabic text
	return new Promise((resolve) => {
		const child = spawn("claude", args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, ANTHROPIC_HEADLESS: "1" },
		});

		child.stdin?.write(options.prompt);
		child.stdin?.end();

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
				resolve({ success: false, error: stderr || stdout || `Exit code: ${code}` });
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

function detectLanguageFromGutenberg(header: string, text: string): "sv" | "ar" | "en" {
	const langMatch = header.match(/^Language:\s*(.+)$/im);
	const langField = langMatch?.[1]?.toLowerCase() ?? "";

	if (langField.includes("swedish") && !langField.includes("english")) return "sv";
	if (langField.includes("english") && !langField.includes("swedish")) return "en";
	if (/[åäöÅÄÖ]/.test(text.slice(0, 5000))) return "sv";
	return "en";
}

function detectLanguage(text: string, url: string, header: string): "sv" | "ar" | "en" {
	if (url.includes("openiti") || /[\u0600-\u06FF]/.test(text.slice(0, 1000))) {
		return "ar";
	}
	if (url.includes("gutenberg.org")) {
		return detectLanguageFromGutenberg(header, text);
	}
	return "sv";
}

function extractWithPatterns(
	header: string,
	patterns: RegExp[],
	cleaner?: (s: string) => string,
): string | null {
	for (const pattern of patterns) {
		const match = header.match(pattern);
		if (match?.[1]) {
			let value = match[1].trim();
			if (cleaner) value = cleaner(value);
			if (value && value.length > 2) return value;
		}
	}
	return null;
}

/**
 * Attempts to detect book metadata from text content.
 * Works with Gutenberg and OpenITI formats.
 */
const OPENITI_AUTHORS: Record<string, string> = {
	"0450AbuHasanMawardi": "al-Mawardi",
	"0456IbnHazm": "Ibn Hazm",
	"0505Ghazali": "al-Ghazali",
	"0597IbnJawzi": "Ibn al-Jawzi",
	"0676Nawawi": "al-Nawawi",
	"0728IbnTawordsymiyya": "Ibn Taymiyyah",
	"0751IbnQayyimJawziyya": "Ibn Qayyim",
	"0911Suyuti": "al-Suyuti",
};

const OPENITI_TITLES: Record<string, string> = {
	TawqHamama: "Tawq al-Hamama (The Ring of the Dove)",
	FaslFiMacrifatNafs: "Fasl fi Ma'rifat al-Nafs (On Knowing the Soul)",
	AdabDunyaWaDin: "Adab al-Dunya wal-Din (Ethics of Religion and Worldly Life)",
	KimiyaSacada: "Kimiya al-Sa'ada (Alchemy of Happiness)",
	BidayatHidaya: "Bidayat al-Hidaya (Beginning of Guidance)",
	TalbisIblis: "Talbis Iblis (The Devil's Deception)",
	SifatSafwa: "Sifat al-Safwa (Characteristics of the Elite)",
	ArbacunaNawawiyya: "al-Arba'in al-Nawawiyya (The Forty Hadiths)",
	RiyadSalihin: "Riyad al-Salihin (Gardens of the Righteous)",
	WabilSayyib: "al-Wabil al-Sayyib (Beneficial Words on Dhikr)",
	Fawaid: "al-Fawaid (Collection of Wisdom Benefits)",
	DaWaDawa: "al-Da' wa al-Dawa (The Disease and the Cure)",
	CuddatSabirin: "Uddat al-Sabirin (Patience and Gratitude)",
	RawdatMuhibbin: "Rawdat al-Muhibbin (Garden of Lovers)",
	MadarijSalikin: "Madarij al-Salikin (Stations of the Seekers)",
	Itqan: "al-Itqan fi Ulum al-Quran (Perfection in Quranic Sciences)",
};

function parseOpenITIUrl(url: string): { author: string; title: string } | null {
	// Pattern: 0456IbnHazm.TawqHamama in the URL path
	const match = url.match(/(\d{4}[A-Za-z]+)\.([A-Za-z]+)/);
	if (!match) return null;

	const authorCode = match[1] ?? "";
	const titleCode = match[2] ?? "";

	const author = OPENITI_AUTHORS[authorCode] ?? authorCode.replace(/^\d+/, "");
	const title = OPENITI_TITLES[titleCode] ?? titleCode;

	return { author, title };
}

function detectMetadata(
	text: string,
	url: string,
): { title: string; author: string; language: "sv" | "ar" | "en" } {
	const header = text.slice(0, 3000);
	const language = detectLanguage(text, url, header);

	const titlePatterns = [
		/^Title:\s*(.+)$/im,
		/The Project Gutenberg eBook of ([^,\n]+)/i,
		/^#\s+(.+)$/m,
	];
	const title =
		extractWithPatterns(header, titlePatterns, (t) => t.replace(/,?\s+by\s+.+$/i, "")) ??
		"Unknown Title";

	const authorPatterns = [
		/^Author:\s*(.+)$/im,
		/^Creator:\s*(.+)$/im,
		/eBook of .+,?\s+by\s+([^\n]+)/i,
	];
	const author =
		extractWithPatterns(header, authorPatterns, (a) =>
			a.toLowerCase().includes("unknown") ? "" : a,
		) ?? "Unknown Author";

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

	// OpenITI URL fallback: extract author/title from URL path
	if (url.includes("OpenITI") || url.includes("openiti")) {
		const parsed = parseOpenITIUrl(url);
		if (parsed) {
			// OpenITI metadata is more reliable than text detection for Arabic
			return {
				title: parsed.title,
				author: parsed.author,
				language: detected.language,
			};
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

	if (!(result.success && result.output)) {
		console.error(`    [warn] Claude failed: ${result.error ?? "no output"}`);
		return null;
	}

	try {
		// Extract JSON from response
		const jsonMatch = result.output.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			console.error(`    [warn] No JSON in response (${result.output.length} chars): ${result.output.slice(0, 150)}`);
			return null;
		}
		const parsed = JSON.parse(jsonMatch[0]);
		return ChapterSummarySchema.parse(parsed);
	} catch (err) {
		console.error(`    [warn] Parse error: ${err instanceof Error ? err.message : err}`);
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

	if (!(result.success && result.output)) {
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
// Import Helper Functions
// ============================================================================

interface ChapterData {
	number: number;
	title: string | null;
	text: string;
	startPosition: number;
	endPosition: number;
}

interface ChunkData {
	chapterIndex: number | null;
	passageNumber: number;
	text: string;
	startPosition: number;
	endPosition: number;
}

function insertChaptersAndGetMap(chapters: ChapterData[], bookId: number): Map<number, number> {
	const chapterIdMap = new Map<number, number>();

	// Wrap all chapter inserts in a transaction for 10-50x speedup
	beginBookTransaction();
	try {
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
		commitBookTransaction();
	} catch (error) {
		rollbackBookTransaction();
		throw error;
	}

	return chapterIdMap;
}

async function insertPassagesWithEmbeddings(
	chunks: ChunkData[],
	bookId: number,
	chapterIdMap: Map<number, number>,
	onProgress: (msg: string) => void,
): Promise<void> {
	const passageTexts: string[] = [];
	const passageIds: number[] = [];

	// Wrap all passage inserts in a transaction for 10-50x speedup
	beginBookTransaction();
	try {
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
		commitBookTransaction();
	} catch (error) {
		rollbackBookTransaction();
		throw error;
	}

	onProgress(`  Generating embeddings for ${passageTexts.length} passages...`);
	const passageEmbeddings = await generateLocalEmbeddings(passageTexts, "passage");

	// Wrap all embedding inserts in a transaction
	beginBookTransaction();
	try {
		for (let i = 0; i < passageIds.length; i++) {
			const passageId = passageIds[i];
			const embedding = passageEmbeddings[i];
			if (passageId !== undefined && embedding) {
				insertPassageEmbedding(passageId, embedding);
			}
		}
		commitBookTransaction();
	} catch (error) {
		rollbackBookTransaction();
		throw error;
	}
}

async function generateSummaries(
	chapters: ChapterData[],
	chapterIdMap: Map<number, number>,
	bookId: number,
	bookTitle: string,
	bookAuthor: string,
	language: "sv" | "ar" | "en",
	onProgress: (msg: string) => void,
): Promise<void> {
	onProgress("Generating summaries via Claude (subscription)...");
	const chapterSummaries: { title: string | null; summary: string }[] = [];

	for (let i = 0; i < chapters.length; i++) {
		const chapter = chapters[i];
		if (!chapter) continue;
		onProgress(`  Summarizing chapter ${i + 1}/${chapters.length}...`);

		let summary = await summarizeChapter(chapter.text, chapter.title, bookTitle, language);
		if (!summary) {
			// Rate limiting or parse failure — wait before retrying
			onProgress("    Retrying after 5s delay...");
			await new Promise((r) => setTimeout(r, 5000));
			summary = await summarizeChapter(chapter.text, chapter.title, bookTitle, language);
			if (!summary) continue;
		}

		const chapterId = chapterIdMap.get(i);
		if (chapterId === undefined) continue;

		updateChapter(chapterId, { summary: summary.summary, keyConcepts: summary.keyConcepts });

		const summaryEmbedding = await generateLocalEmbedding(
			`${chapter.title ?? `Chapter ${chapter.number}`}: ${summary.summary}`,
			"passage",
		);
		insertSummaryEmbedding("chapter", chapterId, summaryEmbedding);

		chapterSummaries.push({ title: chapter.title, summary: summary.summary });
	}

	if (chapterSummaries.length === 0) return;

	onProgress("  Generating book summary...");
	const bookSummary = await summarizeBook(chapterSummaries, bookTitle, bookAuthor, language);
	if (!bookSummary) return;

	updateBook(bookId, { summary: bookSummary.summary, keyConcepts: bookSummary.keyConcepts });

	const bookSummaryEmbedding = await generateLocalEmbedding(
		`${bookTitle} by ${bookAuthor}: ${bookSummary.summary}`,
		"passage",
	);
	insertSummaryEmbedding("book", bookId, bookSummaryEmbedding);
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
		skipSummarization = true,
		onProgress = console.log,
		forceReimport = false,
		...chunkingOptions
	} = options;

	initBookDatabase();

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
		onProgress("Removing existing book for re-import...");
		deleteBook(existing.id);
	}

	try {
		onProgress(`Fetching text from ${urlOrPath}...`);
		const { text } = await fetchText(urlOrPath);
		onProgress(`  Fetched ${text.length.toLocaleString()} characters`);

		onProgress("  Detecting metadata...");
		const detected = await detectMetadataWithFallback(text, urlOrPath);
		const bookTitle = overrideTitle ?? detected.title;
		const bookAuthor = overrideAuthor ?? detected.author;
		const language = chunkingOptions.language ?? detected.language;
		onProgress(`  Detected: "${bookTitle}" by ${bookAuthor} (${language})`);

		onProgress("Chunking text...");
		const { chapters, chunks } = chunkBook(text, { ...chunkingOptions, language });
		onProgress(`  Found ${chapters.length} chapters, ${chunks.length} passages`);

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

		onProgress("Importing chapters...");
		const chapterIdMap = insertChaptersAndGetMap(chapters, bookId);

		onProgress("Importing passages and generating embeddings...");
		await insertPassagesWithEmbeddings(chunks, bookId, chapterIdMap, onProgress);

		if (!skipSummarization) {
			await generateSummaries(
				chapters,
				chapterIdMap,
				bookId,
				bookTitle,
				bookAuthor,
				language,
				onProgress,
			);
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
		return { success: false, chaptersImported: 0, passagesImported: 0, error: message };
	}
}

/**
 * Generate summaries for an existing book that was imported without --summarize.
 * Reconstructs chapter text from passages, then runs the same summarization pipeline.
 */
export async function summarizeExistingBook(
	bookId: number,
	options: { onProgress?: (msg: string) => void } = {},
): Promise<{ success: boolean; error?: string }> {
	const { onProgress = console.log } = options;

	initBookDatabase();

	const book = getBook(bookId);
	if (!book) {
		return { success: false, error: `Book ID ${bookId} not found` };
	}

	if (book.summary) {
		onProgress(`Book "${book.title}" already has a summary — skipping`);
		return { success: true };
	}

	onProgress(`Summarizing "${book.title}" by ${book.author} (${book.language})...`);

	const chapters = getChaptersByBook(bookId);
	if (chapters.length === 0) {
		return { success: false, error: "No chapters found for this book" };
	}

	// Reconstruct chapter text from passages
	const chapterData: ChapterData[] = chapters.map((ch) => {
		const passages = getPassagesByChapter(ch.id);
		const text = passages.map((p) => p.text).join("\n\n");
		return {
			number: ch.chapterNumber,
			title: ch.title,
			text,
			startPosition: ch.startPosition,
			endPosition: ch.endPosition,
		};
	});

	// Build chapter ID map (chapterIndex → database ID)
	const chapterIdMap = new Map<number, number>();
	for (let i = 0; i < chapters.length; i++) {
		const ch = chapters[i];
		if (ch) chapterIdMap.set(i, ch.id);
	}

	await generateSummaries(
		chapterData,
		chapterIdMap,
		bookId,
		book.title,
		book.author,
		book.language as "sv" | "ar" | "en",
		onProgress,
	);

	// Verify summary was actually saved
	const updated = getBook(bookId);
	if (!updated?.summary) {
		onProgress(`✗ Summary generation failed for "${book.title}" (Claude calls may have returned invalid data)`);
		return { success: false, error: "Summary not saved — Claude output could not be parsed" };
	}

	onProgress(`✓ Summaries generated for "${book.title}"`);
	return { success: true };
}

/**
 * Generate summaries for all books that don't have them yet.
 */
export async function summarizeAllUnsummarized(
	options: { onProgress?: (msg: string) => void; maxChapters?: number } = {},
): Promise<{ summarized: number; skipped: number; failed: number }> {
	const { onProgress = console.log, maxChapters } = options;

	initBookDatabase();
	const books = getAllBooks().filter((b) => !b.summary);

	if (books.length === 0) {
		onProgress("All books already have summaries.");
		return { summarized: 0, skipped: 0, failed: 0 };
	}

	onProgress(`Found ${books.length} books without summaries.\n`);

	let summarized = 0;
	let skipped = 0;
	let failed = 0;

	for (const book of books) {
		if (maxChapters && book.totalChapters > maxChapters) {
			onProgress(`⏭ Skipping "${book.title}" (${book.totalChapters} chapters > ${maxChapters} limit)`);
			skipped++;
			continue;
		}
		const result = await summarizeExistingBook(book.id, { onProgress });
		if (result.success) {
			summarized++;
		} else {
			onProgress(`  ✗ Failed: ${result.error}`);
			failed++;
		}
	}

	return { summarized, skipped, failed };
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
