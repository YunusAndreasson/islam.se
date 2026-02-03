import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Find the project root (where this package is installed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const EXTRACTED_DIR = join(PROJECT_ROOT, "data", "extracted");

// Valid categories for Swedish quotes
const VALID_CATEGORIES = [
	"tro",
	"tålamod",
	"tacksamhet",
	"prövningar",
	"ödmjukhet",
	"döden",
	"mening",
	"kunskap",
	"karaktär",
	"gemenskap",
	"rättvisa",
	"barmhärtighet",
	"naturen",
	"självrannsakan",
	"hopp",
	"kärlek",
	"girighet",
	"högmod",
] as const;

// Valid tones
const VALID_TONES = ["hopeful", "somber", "reflective", "ironic", "warning", "neutral"] as const;

/**
 * Schema for a single extracted quote
 */
export const QuoteSchema = z.object({
	text: z.string().describe("The quote text"),
	author: z.string().describe("The author of the work"),
	workTitle: z.string().describe("The title of the work"),
	category: z
		.string()
		.transform((c) => {
			const lower = c.toLowerCase();
			return VALID_CATEGORIES.includes(lower as (typeof VALID_CATEGORIES)[number])
				? lower
				: "övrigt";
		})
		.describe("Thematic category"),
	keywords: z.array(z.string()).describe("2-3 search keywords"),
	tone: z
		.string()
		.transform((t) => {
			const lower = t.toLowerCase();
			return VALID_TONES.includes(lower as (typeof VALID_TONES)[number]) ? lower : "neutral";
		})
		.describe("Emotional tone"),
	standalone: z.number().min(1).max(5).describe("How well quote works without context (1-5)"),
});

export type Quote = z.infer<typeof QuoteSchema>;

/**
 * Schema for extraction result
 */
export const ExtractionResultSchema = z.object({
	quotes: z.array(QuoteSchema),
	sourceUrl: z.string(),
	extractedAt: z.string(),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

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
): void {
	flushChunk(builder);
	const sentences = segment.split(/(?<=[.!?])\s+/);
	for (const sentence of sentences) {
		processSentence(sentence, maxChunkSize, builder);
	}
}

/**
 * Splits text into chunks, trying paragraph boundaries first, then sentences, then hard splits
 */
function splitIntoChunks(text: string, maxChunkSize: number): string[] {
	let segments = text.split(/\n\n+/);
	if (segments.length === 1 || segments.some((s) => s.length > maxChunkSize)) {
		segments = text.split(/\n+/);
	}

	const builder: ChunkBuilder = { chunks: [], current: "" };

	for (const segment of segments) {
		if (segment.length > maxChunkSize) {
			processOversizedSegment(segment, maxChunkSize, builder);
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

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanJsonString(text: string): string {
	let jsonStr = text.trim();
	if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
	if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
	if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
	return jsonStr.trim().replace(/,\s*([}\]])/g, "$1");
}

function extractQuotesArray(jsonStr: string): string | null {
	const quotesMatch = jsonStr.match(/"quotes"\s*:\s*\[/);
	if (!quotesMatch) return null;

	const startIdx = jsonStr.indexOf("[", quotesMatch.index);
	let depth = 0;
	let endIdx = startIdx;

	for (let i = startIdx; i < jsonStr.length; i++) {
		if (jsonStr[i] === "[") depth++;
		if (jsonStr[i] === "]") depth--;
		if (depth === 0) {
			endIdx = i + 1;
			break;
		}
	}

	return jsonStr.slice(startIdx, endIdx).replace(/,\s*([}\]])/g, "$1");
}

function parseQuotesResponse(responseText: string): Quote[] {
	const jsonStr = cleanJsonString(responseText);

	try {
		const parsed = JSON.parse(jsonStr);
		return z.array(QuoteSchema).parse(parsed.quotes);
	} catch {
		const quotesArray = extractQuotesArray(jsonStr);
		if (quotesArray) {
			const quotes = JSON.parse(quotesArray);
			return z.array(QuoteSchema).parse(quotes);
		}
		throw new Error("Failed to parse quotes from response");
	}
}

/**
 * Extracts quotes from a single chunk of text with retry logic for rate limits
 */
async function extractFromChunk(
	client: Anthropic,
	chunk: string,
	chunkIndex: number,
	totalChunks: number,
	metadata?: { author?: string; title?: string },
	onProgress?: (message: string) => void,
): Promise<Quote[]> {
	const systemPrompt = `<role>
You are extracting quotes for use in Islamic spiritual and philosophical writing in Swedish.
</role>

<extraction_criteria>
Extract quotes that:
- Express profound truths about human nature, existence, morality, or the human condition
- Reflect on themes relevant to spiritual life: faith, patience, gratitude, trials, purpose, mortality
- Could illustrate Islamic concepts even if from non-Islamic sources
- Capture universal wisdom about life, death, suffering, hope, and relationships
</extraction_criteria>

<categories>
tro, tålamod, tacksamhet, prövningar, ödmjukhet, döden, mening, kunskap, karaktär, gemenskap, rättvisa, barmhärtighet, naturen, självrannsakan, hopp, kärlek, girighet, högmod
</categories>

<tone_options>
- hopeful: optimistic, encouraging
- somber: serious, heavy
- reflective: contemplative, thoughtful
- ironic: paradoxical, with hidden meaning
- warning: cautionary
- neutral: matter-of-fact wisdom
</tone_options>

<output_fields>
1. text: Exact Swedish text (1-4 sentences)
2. author: Use provided author
3. workTitle: Use provided title
4. category: ONE from categories list
5. keywords: 2-3 Swedish search terms (beyond category)
6. tone: ONE from tone_options
7. standalone: 1-5 score (5 = works perfectly alone, 1 = needs much context)
</output_fields>

<quality_examples>
<example standalone="5" category="kunskap">
{
  "text": "Den som söker sanningen måste vara redo att överge allt han tror sig veta.",
  "author": "Hjalmar Söderberg",
  "workTitle": "Doktor Glas",
  "category": "kunskap",
  "keywords": ["sanning", "visdom", "ödmjukhet"],
  "tone": "reflective",
  "standalone": 5
}
<why_good>Complete thought that resonates universally. No context needed to understand or appreciate.</why_good>
</example>

<example standalone="5" category="döden">
{
  "text": "Döden är den enda sanningen som aldrig ljuger.",
  "author": "Pär Lagerkvist",
  "workTitle": "Dvärgen",
  "category": "döden",
  "keywords": ["sanning", "liv", "förgänglighet"],
  "tone": "somber",
  "standalone": 5
}
<why_good>Memorable aphorism. Works as standalone wisdom.</why_good>
</example>

<example standalone="3" category="prövningar">
{
  "text": "Det var i mörkret hon lärde sig att se.",
  "author": "Selma Lagerlöf",
  "workTitle": "Gösta Berlings saga",
  "category": "prövningar",
  "keywords": ["lidande", "insikt", "utveckling"],
  "tone": "hopeful",
  "standalone": 3
}
<why_lower>Beautiful but "hon" creates curiosity about context. Still usable.</why_lower>
</example>
</quality_examples>

<quality_guidance>
Prioritize standalone score 4-5. A score of 5 means a reader encountering this quote in isolation understands its meaning without needing to know the plot, characters, or context.

Skip:
- Mundane dialogue ("Han nickade och gick ut")
- Plot-dependent statements ("Efter det som hänt kunde hon aldrig...")
- Character-specific references without universal application
</quality_guidance>

Extract 30-50 quotes prioritizing DEPTH.

Output ONLY valid JSON.`;

	const userPrompt = `<input>
Section ${chunkIndex + 1} of ${totalChunks}
Author: ${metadata?.author ?? "Unknown"}
Title: ${metadata?.title ?? "Unknown"}

<text>
${chunk}
</text>
</input>

<output_format>
{
  "quotes": [
    {
      "text": "Exact Swedish quote (1-4 sentences)",
      "author": "${metadata?.author ?? "Author"}",
      "workTitle": "${metadata?.title ?? "Title"}",
      "category": "category from list",
      "keywords": ["Swedish keyword1", "keyword2"],
      "tone": "hopeful|somber|reflective|ironic|warning|neutral",
      "standalone": 4
    }
  ]
}
</output_format>

Extract 30-50 quotes. Prioritize standalone scores 4-5. Output ONLY JSON.`;

	// Retry logic with exponential backoff for rate limits
	const maxRetries = 5;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const response = await client.messages.create({
				model: "claude-haiku-4-5-20251001",
				max_tokens: 8192,
				messages: [
					{
						role: "user",
						content: userPrompt,
					},
				],
				// Use prompt caching for system prompt (90% cost reduction on cache hits)
				system: [
					{
						type: "text",
						text: systemPrompt,
						cache_control: { type: "ephemeral" },
					},
				],
			});

			const content = response.content[0];
			if (!content || content.type !== "text") {
				throw new Error("Unexpected response type from Claude");
			}

			return parseQuotesResponse(content.text);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Use typed error classes for better error handling (modern SDK pattern)
			if (error instanceof Anthropic.RateLimitError) {
				if (attempt < maxRetries - 1) {
					// Exponential backoff: 60s, 120s, 240s, 480s
					const waitTime = 60000 * 2 ** attempt;
					const waitMinutes = Math.round(waitTime / 60000);
					onProgress?.(
						`Rate limited. Waiting ${waitMinutes} minute(s) before retry ${attempt + 2}/${maxRetries}...`,
					);
					await sleep(waitTime);
					continue;
				}
			} else if (error instanceof Anthropic.APIError) {
				// Log API error details for debugging
				onProgress?.(`API Error: ${error.status} - ${error.message}`);
			}

			throw lastError;
		}
	}

	throw lastError || new Error("Max retries exceeded");
}

/**
 * Extracts meaningful quotes from a literary text using Claude.
 * Processes text in chunks for longer works to ensure comprehensive coverage.
 */
export async function extractQuotes(
	text: string,
	sourceUrl: string,
	metadata?: { author?: string; title?: string },
	onProgress?: (message: string) => void,
): Promise<ExtractionResult> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("ANTHROPIC_API_KEY environment variable is required");
	}

	const client = new Anthropic({ apiKey });

	// Split into chunks of ~40k chars (roughly ~50k tokens with Swedish text)
	// This leaves room for the prompt and stays under Claude's 200k token limit
	const maxChunkSize = 40000;
	const chunks = splitIntoChunks(text, maxChunkSize);

	const allQuotes: Quote[] = [];

	let failedChunks = 0;
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		if (!chunk) continue;

		onProgress?.(`Processing chunk ${i + 1}/${chunks.length}...`);

		try {
			const quotes = await extractFromChunk(client, chunk, i, chunks.length, metadata, onProgress);
			allQuotes.push(...quotes);
			onProgress?.(`  Found ${quotes.length} quotes in chunk ${i + 1}`);
		} catch (error) {
			failedChunks++;
			onProgress?.(
				`  ⚠️ Chunk ${i + 1} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			onProgress?.("  Continuing with remaining chunks...");
			// Continue processing other chunks instead of failing entirely
		}
	}

	if (failedChunks > 0) {
		onProgress?.(
			`Note: ${failedChunks}/${chunks.length} chunks failed, but extracted ${allQuotes.length} quotes from successful chunks`,
		);
	}

	// Deduplicate quotes by text (in case of overlap at chunk boundaries)
	const seenTexts = new Set<string>();
	const uniqueQuotes = allQuotes.filter((quote) => {
		const normalized = quote.text.toLowerCase().trim();
		if (seenTexts.has(normalized)) {
			return false;
		}
		seenTexts.add(normalized);
		return true;
	});

	return {
		quotes: uniqueQuotes,
		sourceUrl,
		extractedAt: new Date().toISOString(),
	};
}

/**
 * Saves extraction result to a JSON file for review
 */
export function saveExtractionResult(result: ExtractionResult, filename: string): string {
	if (!existsSync(EXTRACTED_DIR)) {
		mkdirSync(EXTRACTED_DIR, { recursive: true });
	}

	const outputPath = join(EXTRACTED_DIR, filename.replace(/\.txt$/, ".json"));
	writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

	return outputPath;
}
