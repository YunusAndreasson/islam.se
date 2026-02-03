import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const EXTRACTED_DIR = join(PROJECT_ROOT, "data", "extracted");

// Valid categories for Norse quotes
const VALID_CATEGORIES = [
	"wisdom",
	"fate",
	"courage",
	"honor",
	"kinship",
	"death",
	"nature",
	"cunning",
	"hospitality",
	"vengeance",
	"loyalty",
	"humility",
	"perseverance",
	"moderation",
	"friendship",
	"speech",
	"wealth",
	"gods",
] as const;

// Valid tones
const VALID_TONES = ["hopeful", "somber", "reflective", "ironic", "warning", "neutral"] as const;

/**
 * Schema for a Norse saga quote
 */
export const NorseQuoteSchema = z.object({
	text: z.string().describe("The quote text in English"),
	author: z.string().describe("The saga or source name"),
	workTitle: z.string().describe("The specific work or section"),
	category: z
		.string()
		.transform((c) => {
			const lower = c.toLowerCase();
			return VALID_CATEGORIES.includes(lower as (typeof VALID_CATEGORIES)[number])
				? lower
				: "wisdom";
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

export type NorseQuote = z.infer<typeof NorseQuoteSchema>;

/**
 * Schema for extraction result
 */
export const NorseExtractionResultSchema = z.object({
	quotes: z.array(NorseQuoteSchema),
	sourceUrl: z.string(),
	extractedAt: z.string(),
});

export type NorseExtractionResult = z.infer<typeof NorseExtractionResultSchema>;

/**
 * Splits text into chunks, trying paragraph boundaries first, then sentences, then hard splits
 */
function splitIntoChunks(text: string, maxChunkSize: number): string[] {
	const chunks: string[] = [];

	// First split by double newlines (paragraphs)
	let segments = text.split(/\n\n+/);

	// If we only got one segment or segments are too large, try single newlines
	if (segments.length === 1 || segments.some((s) => s.length > maxChunkSize)) {
		segments = text.split(/\n+/);
	}

	let currentChunk = "";
	for (const segment of segments) {
		// If a single segment is too large, split it by sentences or hard split
		if (segment.length > maxChunkSize) {
			// First, push current chunk if any
			if (currentChunk.trim()) {
				chunks.push(currentChunk.trim());
				currentChunk = "";
			}

			// Try to split long segment by sentences
			const sentences = segment.split(/(?<=[.!?])\s+/);
			for (const sentence of sentences) {
				if (sentence.length > maxChunkSize) {
					// Hard split if even a sentence is too long
					for (let i = 0; i < sentence.length; i += maxChunkSize) {
						chunks.push(sentence.slice(i, i + maxChunkSize));
					}
				} else if (currentChunk.length + sentence.length > maxChunkSize) {
					if (currentChunk.trim()) {
						chunks.push(currentChunk.trim());
					}
					currentChunk = sentence;
				} else {
					currentChunk += (currentChunk ? " " : "") + sentence;
				}
			}
		} else if (currentChunk.length + segment.length > maxChunkSize && currentChunk.length > 0) {
			chunks.push(currentChunk.trim());
			currentChunk = segment;
		} else {
			currentChunk += (currentChunk ? "\n\n" : "") + segment;
		}
	}

	if (currentChunk.trim()) {
		chunks.push(currentChunk.trim());
	}

	return chunks;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
): Promise<NorseQuote[]> {
	const systemPrompt = `<role>
You are extracting wisdom quotes from Old Norse sagas and Eddic poetry (in English translation).
</role>

<extraction_criteria>
Extract quotes that:
- Express profound truths about life, fate, honor, and human nature
- Contain timeless wisdom relevant across cultures (Hávamál is especially rich)
- Reflect on themes: courage, hospitality, friendship, death, cunning, perseverance
- Could resonate with modern readers seeking ancient wisdom
- Are self-contained and understandable without extensive context
</extraction_criteria>

<categories>
wisdom, fate, courage, honor, kinship, death, nature, cunning, hospitality, vengeance, loyalty, humility, perseverance, moderation, friendship, speech, wealth, gods
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
1. text: Exact English text (1-4 sentences, preserve poetic line breaks if present)
2. author: Use "Hávamál", "Völuspá", saga name, or provided source
3. workTitle: Specific section like "Poetic Edda" or "Prose Edda"
4. category: ONE from categories list
5. keywords: 2-3 English search terms
6. tone: ONE from tone_options
7. standalone: 1-5 score (5 = works perfectly alone, 1 = needs much context)
</output_fields>

<quality_examples>
<example standalone="5" category="wisdom">
{
  "text": "Cattle die, kindred die,\\nEvery man is mortal:\\nBut the good name never dies\\nOf one who has done well.",
  "author": "Hávamál",
  "workTitle": "Poetic Edda",
  "category": "wisdom",
  "keywords": ["mortality", "legacy", "reputation"],
  "tone": "reflective",
  "standalone": 5
}
<why_good>Complete philosophical statement about mortality and legacy. Universal truth that needs no context.</why_good>
</example>

<example standalone="5" category="hospitality">
{
  "text": "Fire is needed by the newcomer\\nWhose knees are frozen numb;\\nMeat and clean linen a man needs\\nWho has fared across the fells.",
  "author": "Hávamál",
  "workTitle": "Poetic Edda",
  "category": "hospitality",
  "keywords": ["guest", "warmth", "care"],
  "tone": "neutral",
  "standalone": 5
}
<why_good>Practical wisdom about hospitality. Vivid imagery, universally applicable.</why_good>
</example>

<example standalone="4" category="fate">
{
  "text": "No man can escape the fate the Norns have spun for him.",
  "author": "Völsunga saga",
  "workTitle": "Saga Literature",
  "category": "fate",
  "keywords": ["destiny", "Norns", "inevitability"],
  "tone": "somber",
  "standalone": 4
}
<why_good>Clear statement about fate. Minor context helps (Norns) but meaning is clear.</why_good>
</example>
</quality_examples>

<quality_guidance>
Prioritize standalone score 4-5. A score of 5 means a reader encountering this quote in isolation understands its meaning without needing saga context.

Skip:
- Genealogies ("He was the son of X, who was the son of Y...")
- Battle logistics ("They positioned their ships...")
- Plot-dependent statements without universal application

IMPORTANT: Hávamál (Sayings of the High One) is a goldmine of standalone wisdom - extract extensively from it if present.
</quality_guidance>

Extract 30-50 quotes prioritizing DEPTH and UNIVERSAL WISDOM.

Output ONLY valid JSON.`;

	const userPrompt = `<input>
Section ${chunkIndex + 1} of ${totalChunks}
Source: ${metadata?.author ?? "Unknown"}
Work: ${metadata?.title ?? "Unknown"}

<text>
${chunk}
</text>
</input>

<output_format>
{
  "quotes": [
    {
      "text": "Exact quote text (preserve line breaks with \\\\n)",
      "author": "${metadata?.author ?? "Source"}",
      "workTitle": "${metadata?.title ?? "Title"}",
      "category": "category from list",
      "keywords": ["keyword1", "keyword2"],
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

			let jsonStr = content.text.trim();
			if (jsonStr.startsWith("```json")) {
				jsonStr = jsonStr.slice(7);
			}
			if (jsonStr.startsWith("```")) {
				jsonStr = jsonStr.slice(3);
			}
			if (jsonStr.endsWith("```")) {
				jsonStr = jsonStr.slice(0, -3);
			}
			jsonStr = jsonStr.trim();

			// Fix common JSON issues
			jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");

			try {
				const parsed = JSON.parse(jsonStr);
				return z.array(NorseQuoteSchema).parse(parsed.quotes);
			} catch (parseError) {
				// Try to extract quotes array from malformed wrapper JSON
				const quotesMatch = jsonStr.match(/"quotes"\s*:\s*\[/);
				if (quotesMatch) {
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
					const quotesArray = jsonStr.slice(startIdx, endIdx);
					const fixedArray = quotesArray.replace(/,\s*([}\]])/g, "$1");
					const quotes = JSON.parse(fixedArray);
					return z.array(NorseQuoteSchema).parse(quotes);
				}
				throw parseError;
			}
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (error instanceof Anthropic.RateLimitError) {
				if (attempt < maxRetries - 1) {
					const waitTime = 60000 * 2 ** attempt;
					const waitMinutes = Math.round(waitTime / 60000);
					onProgress?.(
						`Rate limited. Waiting ${waitMinutes} minute(s) before retry ${attempt + 2}/${maxRetries}...`,
					);
					await sleep(waitTime);
					continue;
				}
			} else if (error instanceof Anthropic.APIError) {
				onProgress?.(`API Error: ${error.status} - ${error.message}`);
			}

			throw lastError;
		}
	}

	throw lastError || new Error("Max retries exceeded");
}

/**
 * Extracts wisdom quotes from Norse saga/Edda text using Claude.
 */
export async function extractNorseQuotes(
	text: string,
	sourceUrl: string,
	metadata?: { author?: string; title?: string },
	onProgress?: (message: string) => void,
): Promise<NorseExtractionResult> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("ANTHROPIC_API_KEY environment variable is required");
	}

	const client = new Anthropic({ apiKey });

	const maxChunkSize = 40000;
	const chunks = splitIntoChunks(text, maxChunkSize);

	const allQuotes: NorseQuote[] = [];

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
				`  Chunk ${i + 1} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			onProgress?.(`  Continuing with remaining chunks...`);
		}
	}

	if (failedChunks > 0) {
		onProgress?.(
			`Note: ${failedChunks}/${chunks.length} chunks failed, but extracted ${allQuotes.length} quotes from successful chunks`,
		);
	}

	// Deduplicate quotes by text
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
export function saveNorseExtractionResult(result: NorseExtractionResult, filename: string): string {
	if (!existsSync(EXTRACTED_DIR)) {
		mkdirSync(EXTRACTED_DIR, { recursive: true });
	}

	const outputPath = join(EXTRACTED_DIR, filename.replace(/\.txt$/, "-norse.json"));
	writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

	return outputPath;
}
