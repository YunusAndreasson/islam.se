/**
 * Shared text chunking utilities for quote extraction.
 * Used by Swedish, Arabic, and Norse extractors.
 */

/**
 * Hard splits text into fixed-size parts when no natural boundaries exist.
 */
function hardSplitText(text: string, maxSize: number): string[] {
	const parts: string[] = [];
	for (let i = 0; i < text.length; i += maxSize) {
		parts.push(text.slice(i, i + maxSize));
	}
	return parts;
}

interface ChunkBuilder {
	chunks: string[];
	current: string;
}

function flushChunk(builder: ChunkBuilder): void {
	if (builder.current.trim()) {
		builder.chunks.push(builder.current.trim());
		builder.current = "";
	}
}

interface SplitOptions {
	/**
	 * Regex pattern for splitting sentences.
	 * Default: /(?<=[.!?])\s+/ for Western languages
	 * Use /(?<=[.؟!])\s+/ for Arabic
	 */
	sentenceSplitPattern?: RegExp;
}

const DEFAULT_SENTENCE_PATTERN = /(?<=[.!?])\s+/;
const ARABIC_SENTENCE_PATTERN = /(?<=[.؟!])\s+/;

export const SENTENCE_PATTERNS = {
	western: DEFAULT_SENTENCE_PATTERN,
	arabic: ARABIC_SENTENCE_PATTERN,
} as const;

function processSentence(sentence: string, maxChunkSize: number, builder: ChunkBuilder): void {
	if (sentence.length > maxChunkSize) {
		builder.chunks.push(...hardSplitText(sentence, maxChunkSize));
		return;
	}
	if (builder.current.length + sentence.length > maxChunkSize) {
		flushChunk(builder);
		builder.current = sentence;
	} else {
		builder.current += (builder.current ? " " : "") + sentence;
	}
}

function processOversizedSegment(
	segment: string,
	maxChunkSize: number,
	builder: ChunkBuilder,
	sentencePattern: RegExp,
): void {
	flushChunk(builder);
	const sentences = segment.split(sentencePattern);
	for (const sentence of sentences) {
		processSentence(sentence, maxChunkSize, builder);
	}
}

/**
 * Splits text into chunks, trying paragraph boundaries first, then sentences, then hard splits.
 *
 * @param text - The text to split
 * @param maxChunkSize - Maximum size of each chunk in characters
 * @param options - Optional configuration for sentence splitting
 */
export function splitIntoChunks(
	text: string,
	maxChunkSize: number,
	options?: SplitOptions,
): string[] {
	const sentencePattern = options?.sentenceSplitPattern ?? DEFAULT_SENTENCE_PATTERN;

	let segments = text.split(/\n\n+/);
	if (segments.length === 1 || segments.some((s) => s.length > maxChunkSize)) {
		segments = text.split(/\n+/);
	}

	const builder: ChunkBuilder = { chunks: [], current: "" };

	for (const segment of segments) {
		if (segment.length > maxChunkSize) {
			processOversizedSegment(segment, maxChunkSize, builder, sentencePattern);
		} else if (
			builder.current.length + segment.length > maxChunkSize &&
			builder.current.length > 0
		) {
			builder.chunks.push(builder.current.trim());
			builder.current = segment;
		} else {
			builder.current += (builder.current ? "\n\n" : "") + segment;
		}
	}

	flushChunk(builder);
	return builder.chunks;
}
