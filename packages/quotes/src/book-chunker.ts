/**
 * Book text chunking utilities.
 *
 * Handles chapter detection and text chunking with overlap
 * for Swedish, Arabic, and English texts.
 */

// ============================================================================
// Types
// ============================================================================

export interface ChapterInfo {
	number: number;
	title: string | null;
	startPosition: number;
	endPosition: number;
	text: string;
}

export interface ChunkInfo {
	text: string;
	passageNumber: number;
	startPosition: number;
	endPosition: number;
	chapterIndex: number | null; // Index into chapters array
}

export interface ChunkingResult {
	chapters: ChapterInfo[];
	chunks: ChunkInfo[];
}

export interface ChunkingOptions {
	targetSize?: number; // Target chunk size in characters (default: 800)
	overlap?: number; // Overlap between chunks (default: 200)
	language?: "sv" | "ar" | "en";
}

// ============================================================================
// Chapter Detection Patterns
// ============================================================================

const CHAPTER_PATTERNS: Record<string, RegExp[]> = {
	sv: [
		// Swedish: "Kapitel 1", "KAPITEL I", "Första kapitlet"
		/^(?:KAPITEL|Kapitel)\s+(?:[IVXLCDM]+|\d+)\.?\s*$/m,
		/^(?:[Ff]örsta|[Aa]ndra|[Tt]redje|[Ff]järde|[Ff]emte|[Ss]jätte|[Ss]junde|[Åå]ttonde|[Nn]ionde|[Tt]ionde)\s+[Kk]apitlet\.?\s*$/m,
		/^(?:\d+|[IVXLCDM]+)\.\s+/m,
	],
	ar: [
		// Arabic: "باب", "فصل", "الباب الأول"
		/^(?:باب|فصل|الباب|الفصل)\s+/m,
		/^(?:الباب|الفصل)\s+(?:الأول|الثاني|الثالث|الرابع|الخامس)/m,
	],
	en: [
		// English/Norse: "Chapter 1", "CHAPTER I", "Part One"
		/^(?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)\.?\s*/m,
		/^(?:PART|Part)\s+(?:[IVXLCDM]+|\d+|One|Two|Three|Four|Five)\.?\s*/m,
		// Markdown headers
		/^#{1,3}\s+.+$/m,
	],
};

// Combined pattern for detecting any chapter start
function getChapterPattern(language: "sv" | "ar" | "en"): RegExp {
	const patterns = CHAPTER_PATTERNS[language] ?? CHAPTER_PATTERNS.en ?? [];
	const combined = patterns.map((p) => p.source).join("|");
	return new RegExp(`(${combined})`, "gm");
}

// ============================================================================
// Chapter Detection
// ============================================================================

export function detectChapters(text: string, language: "sv" | "ar" | "en" = "sv"): ChapterInfo[] {
	const pattern = getChapterPattern(language);
	const chapters: ChapterInfo[] = [];
	const matches: { index: number; title: string }[] = [];

	// Find all chapter markers
	let match = pattern.exec(text);
	while (match !== null) {
		// Extract the chapter title (the line containing the match)
		const lineStart = text.lastIndexOf("\n", match.index) + 1;
		const lineEnd = text.indexOf("\n", match.index);
		const title = text
			.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
			.trim()
			.replace(/^#+\s*/, ""); // Remove markdown headers

		matches.push({ index: match.index, title });
		match = pattern.exec(text);
	}

	// If no chapters found, treat entire text as one chapter
	if (matches.length === 0) {
		return [
			{
				number: 1,
				title: null,
				startPosition: 0,
				endPosition: text.length,
				text: text,
			},
		];
	}

	// Create chapters from matches
	for (let i = 0; i < matches.length; i++) {
		const current = matches[i];
		if (!current) continue;
		const next = matches[i + 1];
		const endPosition = next ? next.index : text.length;

		chapters.push({
			number: i + 1,
			title: current.title || null,
			startPosition: current.index,
			endPosition,
			text: text.slice(current.index, endPosition),
		});
	}

	// If first chapter doesn't start at 0, add a preamble chapter
	const firstChapter = chapters[0];
	if (firstChapter && firstChapter.startPosition > 0) {
		const preambleText = text.slice(0, firstChapter.startPosition).trim();
		if (preambleText.length > 100) {
			// Only add if substantial
			chapters.unshift({
				number: 0,
				title: language === "sv" ? "Förord" : language === "ar" ? "مقدمة" : "Preface",
				startPosition: 0,
				endPosition: firstChapter.startPosition,
				text: preambleText,
			});
			// Renumber chapters
			for (let idx = 0; idx < chapters.length; idx++) {
				const ch = chapters[idx];
				if (ch) ch.number = idx;
			}
		}
	}

	return chapters;
}

// ============================================================================
// Text Chunking
// ============================================================================

/**
 * Finds the best split point near the target position.
 * Prefers paragraph breaks > sentence ends > word boundaries.
 */
function findBestSplitPoint(text: string, targetPos: number, searchRange: number = 100): number {
	const start = Math.max(0, targetPos - searchRange);
	const end = Math.min(text.length, targetPos + searchRange);
	const searchText = text.slice(start, end);

	// Priority 1: Paragraph break (double newline)
	const paragraphBreak = searchText.lastIndexOf("\n\n");
	if (paragraphBreak !== -1) {
		return start + paragraphBreak + 2; // After the paragraph break
	}

	// Priority 2: Single newline
	const newline = searchText.lastIndexOf("\n");
	if (newline !== -1) {
		return start + newline + 1;
	}

	// Priority 3: Sentence end (. ! ?)
	const sentenceEnds = [". ", "! ", "? ", "。", "؟ "];
	for (const ending of sentenceEnds) {
		const idx = searchText.lastIndexOf(ending);
		if (idx !== -1) {
			return start + idx + ending.length;
		}
	}

	// Priority 4: Word boundary (space)
	const space = searchText.lastIndexOf(" ");
	if (space !== -1) {
		return start + space + 1;
	}

	// Fallback: exact position
	return targetPos;
}

/**
 * Chunks text into overlapping segments, respecting natural boundaries.
 */
export function chunkText(
	text: string,
	options: ChunkingOptions = {},
): Omit<ChunkInfo, "chapterIndex">[] {
	const targetSize = options.targetSize ?? 800;
	const overlap = options.overlap ?? 200;

	const chunks: Omit<ChunkInfo, "chapterIndex">[] = [];

	if (text.length <= targetSize) {
		return [
			{
				text: text.trim(),
				passageNumber: 1,
				startPosition: 0,
				endPosition: text.length,
			},
		];
	}

	let currentPos = 0;
	let passageNumber = 1;

	while (currentPos < text.length) {
		// Calculate the end position for this chunk
		let endPos = Math.min(currentPos + targetSize, text.length);

		// If not at the end, find a better split point
		if (endPos < text.length) {
			endPos = findBestSplitPoint(text, endPos);
		}

		const chunkText = text.slice(currentPos, endPos).trim();

		if (chunkText.length > 0) {
			chunks.push({
				text: chunkText,
				passageNumber,
				startPosition: currentPos,
				endPosition: endPos,
			});
			passageNumber++;
		}

		// Move forward, accounting for overlap
		// Overlap means the next chunk starts before the current one ends
		const nextStart = endPos - overlap;
		currentPos = Math.max(nextStart, currentPos + 1); // Ensure forward progress

		// Prevent tiny final chunks
		if (text.length - currentPos < targetSize / 4) {
			const remainingText = text.slice(currentPos).trim();
			const lastChunk = chunks[chunks.length - 1];
			if (remainingText.length > 0 && lastChunk) {
				// Append to last chunk if small
				if (lastChunk.text.length + remainingText.length < targetSize * 1.5) {
					lastChunk.text = text.slice(lastChunk.startPosition).trim();
					lastChunk.endPosition = text.length;
				} else {
					chunks.push({
						text: remainingText,
						passageNumber,
						startPosition: currentPos,
						endPosition: text.length,
					});
				}
			}
			break;
		}
	}

	return chunks;
}

// ============================================================================
// Main Chunking Function
// ============================================================================

/**
 * Chunks a book text into chapters and passages with overlap.
 * Detects chapters automatically and preserves position information.
 */
export function chunkBook(text: string, options: ChunkingOptions = {}): ChunkingResult {
	const language = options.language ?? "sv";

	// Detect chapters
	const chapters = detectChapters(text, language);

	// Chunk each chapter
	const allChunks: ChunkInfo[] = [];
	let globalPassageNumber = 1;

	for (let chapterIdx = 0; chapterIdx < chapters.length; chapterIdx++) {
		const chapter = chapters[chapterIdx];
		if (!chapter) continue;
		const chapterChunks = chunkText(chapter.text, options);

		for (const chunk of chapterChunks) {
			allChunks.push({
				text: chunk.text,
				passageNumber: globalPassageNumber++,
				// Adjust positions to be relative to the full text
				startPosition: chapter.startPosition + chunk.startPosition,
				endPosition: chapter.startPosition + chunk.endPosition,
				chapterIndex: chapterIdx,
			});
		}
	}

	return { chapters, chunks: allChunks };
}

/**
 * Estimates the number of passages that will be created for a given text length.
 */
export function estimatePassageCount(textLength: number, options: ChunkingOptions = {}): number {
	const targetSize = options.targetSize ?? 800;
	const overlap = options.overlap ?? 200;
	const effectiveStep = targetSize - overlap;

	return Math.ceil(textLength / effectiveStep);
}
