import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..");
const EXTRACTED_DIR = join(PROJECT_ROOT, "data", "extracted");

/**
 * Schema for Arabic quote (same structure, different categories)
 */
const validTones = ["hopeful", "somber", "reflective", "ironic", "warning", "neutral"] as const;

export const ArabicQuoteSchema = z.object({
	text: z.string().describe("The Arabic quote text"),
	author: z.string().describe("The author name in Arabic"),
	workTitle: z.string().describe("The book title in Arabic"),
	category: z.string().describe("Thematic category in Arabic"),
	keywords: z.array(z.string()).describe("2-3 Arabic search keywords"),
	tone: z
		.string()
		.transform((val) => {
			const lower = val.toLowerCase();
			if (validTones.includes(lower as (typeof validTones)[number])) {
				return lower as (typeof validTones)[number];
			}
			return "neutral" as const; // Default invalid tones to neutral
		})
		.describe("Emotional tone"),
	standalone: z.number().min(1).max(5).describe("How well quote works without context (1-5)"),
});

export type ArabicQuote = z.infer<typeof ArabicQuoteSchema>;

export const ArabicExtractionResultSchema = z.object({
	quotes: z.array(ArabicQuoteSchema),
	sourceUrl: z.string(),
	extractedAt: z.string(),
});

export type ArabicExtractionResult = z.infer<typeof ArabicExtractionResultSchema>;

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

function parseArabicQuotesResponse(responseText: string): ArabicQuote[] {
	const jsonStr = cleanJsonString(responseText);

	try {
		const parsed = JSON.parse(jsonStr);
		return z.array(ArabicQuoteSchema).parse(parsed.quotes);
	} catch {
		const quotesArray = extractQuotesArray(jsonStr);
		if (quotesArray) {
			const quotes = JSON.parse(quotesArray);
			return z.array(ArabicQuoteSchema).parse(quotes);
		}
		throw new Error("Failed to parse quotes from response");
	}
}

/**
 * Clean OpenITI mARkdown format to plain text
 */
export function cleanOpenITIText(text: string): string {
	// First, remove the metadata header section
	const cleaned = text.replace(/^######OpenITI#[\s\S]*?#META#Header#End#\s*/m, "");

	// Process line by line
	const lines = cleaned.split("\n");
	const processedLines: string[] = [];

	for (const line of lines) {
		// Skip empty lines
		if (!line.trim()) {
			processedLines.push("");
			continue;
		}

		// Skip page markers
		if (/^# PageV\d+P\d+/.test(line)) {
			continue;
		}

		// Skip section headers like "### | مقدمة المؤلف" or "### || أما بعد:"
		if (/^### \|+/.test(line)) {
			continue;
		}

		// Handle content lines starting with "# " - extract the text
		if (line.startsWith("# ")) {
			processedLines.push(line.slice(2));
			continue;
		}

		// Handle continuation lines starting with "~~"
		if (line.startsWith("~~")) {
			processedLines.push(line.slice(2));
			continue;
		}

		// Skip lines that are just structural markers
		if (/^[|~@#]+$/.test(line.trim())) {
			continue;
		}

		// Keep other content
		processedLines.push(line);
	}

	return (
		processedLines
			.join("\n")
			// Remove milestone markers like ms01
			.replace(/ms\d+/g, "")
			// Normalize whitespace
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}

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

function processArabicSentence(
	sentence: string,
	maxChunkSize: number,
	builder: ChunkBuilder,
): void {
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

function processOversizedArabicSegment(
	segment: string,
	maxChunkSize: number,
	builder: ChunkBuilder,
): void {
	flushChunk(builder);
	const sentences = segment.split(/(?<=[.؟!])\s+/);
	for (const sentence of sentences) {
		processArabicSentence(sentence, maxChunkSize, builder);
	}
}

/**
 * Splits Arabic text into chunks at paragraph/section boundaries
 */
function splitIntoChunks(text: string, maxChunkSize: number): string[] {
	let segments = text.split(/\n\n+/);
	if (segments.length === 1 || segments.some((s) => s.length > maxChunkSize)) {
		segments = text.split(/\n+/);
	}

	const builder: ChunkBuilder = { chunks: [], current: "" };

	for (const segment of segments) {
		if (segment.length > maxChunkSize) {
			processOversizedArabicSegment(segment, maxChunkSize, builder);
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

async function extractFromChunk(
	client: Anthropic,
	chunk: string,
	chunkIndex: number,
	totalChunks: number,
	metadata?: { author?: string; title?: string },
	onProgress?: (message: string) => void,
): Promise<ArabicQuote[]> {
	const systemPrompt = `<role>
You are extracting quotes from classical Arabic Islamic texts for use in contemporary Islamic writing.
</role>

<extraction_criteria>
Extract quotes that:
- Express profound wisdom about the soul, faith, and life
- Address spiritual themes: monotheism, asceticism, repentance, patience, gratitude, humility
- Are suitable for citation in contemporary Islamic writing
- Are self-contained and understandable on their own
</extraction_criteria>

<categories>
faith, patience, gratitude, repentance, humility, asceticism, remembrance, supplication, character, relationships, heart, soul, worldly-life, afterlife, death, love, fear, hope, knowledge, wisdom
</categories>

<tone_options>
- hopeful: optimistic, encouraging
- somber: serious, weighty
- reflective: contemplative, thoughtful
- ironic: paradoxical, with deeper meaning
- warning: cautionary
- neutral: matter-of-fact wisdom
</tone_options>

<output_fields>
1. text: The exact Arabic text (1-4 sentences)
2. author: Author name in Arabic script
3. workTitle: Book title in Arabic script
4. category: ONE English category from categories list
5. keywords: 2-3 Arabic keywords for search
6. tone: ONE from tone_options
7. standalone: 1-5 score (5 = works perfectly alone)
</output_fields>

<quality_examples>
<example standalone="5" category="patience">
{
  "text": "الصبر نصف الإيمان، والشكر النصف الآخر",
  "author": "ابن القيم",
  "workTitle": "مدارج السالكين",
  "category": "patience",
  "keywords": ["صبر", "إيمان", "شكر"],
  "tone": "reflective",
  "standalone": 5
}
<why_good>Complete aphorism. Universal spiritual truth that needs no context.</why_good>
</example>

<example standalone="5" category="heart">
{
  "text": "القلب يصدأ كما يصدأ الحديد، وجلاؤه الاستغفار",
  "author": "الحسن البصري",
  "workTitle": "موعظة",
  "category": "heart",
  "keywords": ["قلب", "استغفار", "تزكية"],
  "tone": "warning",
  "standalone": 5
}
<why_good>Vivid metaphor. Self-contained wisdom about spiritual purification.</why_good>
</example>

<example standalone="4" category="knowledge">
{
  "text": "العلم بلا عمل كالشجرة بلا ثمر",
  "author": "الغزالي",
  "workTitle": "إحياء علوم الدين",
  "category": "knowledge",
  "keywords": ["علم", "عمل", "فائدة"],
  "tone": "warning",
  "standalone": 4
}
<why_good>Clear analogy. Works standalone though context enriches understanding.</why_good>
</example>
</quality_examples>

<quality_guidance>
Prioritize standalone score 4-5. A score of 5 means a reader encountering this quote in isolation understands its meaning without needing the surrounding text.

Skip:
- Detailed fiqh rulings requiring legal context
- Chains of narration (isnad)
- Text-specific references ("كما ذكرنا سابقاً...")
- Incomplete thoughts that depend on what follows
</quality_guidance>

Extract 30-50 quotes prioritizing DEPTH and standalone wisdom.

Output ONLY valid JSON.`;

	const userPrompt = `<input>
Section ${chunkIndex + 1} of ${totalChunks}
Author: ${metadata?.author ?? "Unknown"}
Book: ${metadata?.title ?? "Unknown"}

<text>
${chunk}
</text>
</input>

<output_format>
{
  "quotes": [
    {
      "text": "Arabic quote text (1-4 sentences)",
      "author": "${metadata?.author ?? "المؤلف"}",
      "workTitle": "${metadata?.title ?? "الكتاب"}",
      "category": "English category from list",
      "keywords": ["كلمة1", "كلمة2"],
      "tone": "hopeful|somber|reflective|ironic|warning|neutral",
      "standalone": 4
    }
  ]
}
</output_format>

Extract 30-50 quotes. Prioritize standalone scores 4-5. Output ONLY JSON.`;

	const maxRetries = 5;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const response = await client.messages.create({
				model: "claude-haiku-4-5-20251001",
				max_tokens: 8192,
				messages: [{ role: "user", content: userPrompt }],
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

			return parseArabicQuotesResponse(content.text);
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (error instanceof Anthropic.RateLimitError) {
				if (attempt < maxRetries - 1) {
					const waitTime = 60000 * 2 ** attempt;
					const waitMinutes = Math.round(waitTime / 60000);
					onProgress?.(`Rate limited. Waiting ${waitMinutes} minute(s)...`);
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
 * Extract author and title from OpenITI URI
 */
export function parseOpenITIUri(url: string): { author: string; title: string } {
	// Pattern: 0751IbnQayyimJawziyya.MadarijSalikin
	const match = url.match(/(\d{4}[A-Za-z]+)\.([A-Za-z]+)/);
	if (match) {
		const authorCode = match[1];
		const titleCode = match[2];

		// Map common author codes to Arabic names
		const authorMap: Record<string, string> = {
			// Sufi & Spiritual
			"0412Sulami": "أبو عبد الرحمن السلمي",
			"0638IbnCarabi": "محيي الدين ابن عربي",
			"0711IbnIbrahimCimadDinWasiti": "عماد الدين الواسطي",
			// Ethics & Philosophy
			"0456IbnHazm": "ابن حزم الأندلسي",
			// Hadith & Piety
			"0597IbnJawzi": "ابن الجوزي",
			"0676Nawawi": "الإمام النووي",
		};

		// Map common title codes to Arabic names
		const titleMap: Record<string, string> = {
			// Sufi & Spiritual
			TabaqatSufiyya: "طبقات الصوفية",
			FususHikam: "فصوص الحكم",
			MiftahTariqMuhibbin: "مفتاح طريق المحبين",
			QawacidFiSuluk: "قواعد في السلوك",
			// Ethics & Philosophy
			TawqHamama: "طوق الحمامة",
			FaslFiMacrifatNafs: "فصل في معرفة النفس",
			// Hadith & Piety
			TalbisIblis: "تلبيس إبليس",
			SifatSafwa: "صفة الصفوة",
			RiyadSalihin: "رياض الصالحين",
			ArbacunaNawawiyya: "الأربعون النووية",
		};

		const author =
			(authorCode && authorMap[authorCode]) || (authorCode?.replace(/^\d+/, "") ?? "غير معروف");
		const title = (titleCode && titleMap[titleCode]) || titleCode || "غير معروف";

		return { author, title };
	}

	return { author: "غير معروف", title: "غير معروف" };
}

/**
 * Extract quotes from Arabic Islamic text
 */
export async function extractArabicQuotes(
	text: string,
	sourceUrl: string,
	metadata?: { author?: string; title?: string },
	onProgress?: (message: string) => void,
): Promise<ArabicExtractionResult> {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) {
		throw new Error("ANTHROPIC_API_KEY environment variable is required");
	}

	const client = new Anthropic({ apiKey });

	// Clean OpenITI markup
	const cleanedText = cleanOpenITIText(text);

	// Parse metadata from URL if not provided
	const parsedMeta = parseOpenITIUri(sourceUrl);
	const finalMetadata = {
		author: metadata?.author || parsedMeta.author,
		title: metadata?.title || parsedMeta.title,
	};

	const maxChunkSize = 40000;
	const chunks = splitIntoChunks(cleanedText, maxChunkSize);

	const allQuotes: ArabicQuote[] = [];
	let failedChunks = 0;

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		if (!chunk) continue;

		onProgress?.(`Processing chunk ${i + 1}/${chunks.length}...`);

		try {
			const quotes = await extractFromChunk(
				client,
				chunk,
				i,
				chunks.length,
				finalMetadata,
				onProgress,
			);
			allQuotes.push(...quotes);
			onProgress?.(`  Found ${quotes.length} quotes in chunk ${i + 1}`);
		} catch (error) {
			failedChunks++;
			onProgress?.(
				`  ⚠️ Chunk ${i + 1} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
			onProgress?.("  Continuing with remaining chunks...");
		}
	}

	if (failedChunks > 0) {
		onProgress?.(
			`Note: ${failedChunks}/${chunks.length} chunks failed, extracted ${allQuotes.length} quotes`,
		);
	}

	// Deduplicate
	const seenTexts = new Set<string>();
	const uniqueQuotes = allQuotes.filter((quote) => {
		const normalized = quote.text.trim();
		if (seenTexts.has(normalized)) return false;
		seenTexts.add(normalized);
		return true;
	});

	return {
		quotes: uniqueQuotes,
		sourceUrl,
		extractedAt: new Date().toISOString(),
	};
}

export function saveArabicExtractionResult(
	result: ArabicExtractionResult,
	filename: string,
): string {
	if (!existsSync(EXTRACTED_DIR)) {
		mkdirSync(EXTRACTED_DIR, { recursive: true });
	}

	const outputPath = join(EXTRACTED_DIR, filename.replace(/\.mARkdown$/, "-ar.json"));
	writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");

	return outputPath;
}
