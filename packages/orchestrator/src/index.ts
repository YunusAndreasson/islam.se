import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getQuote } from "@islam-se/quotes";
import { ClaudeRunner, type ClaudeRunOptions } from "./claude-runner.js";
import {
	formatBlockedDomainsPrompt,
	formatDomainReputation,
	getBlockedDomains,
	loadDomainTracker,
	recordPublishedArticle,
	saveDomainTracker,
	updateDomainTracker,
} from "./domain-tracker.js";
import { ReferenceTracker } from "./reference-tracker.js";
import {
	AqeedahReviewFrontmatterSchema,
	BrillianceFrontmatterSchema,
	CohesionFrontmatterSchema,
	CompressFrontmatterSchema,
	DeepenFrontmatterSchema,
	DetoxFrontmatterSchema,
	DraftFrontmatterSchema,
	DraftOutputSchema,
	ElevateFrontmatterSchema,
	FactCheckOutputSchema,
	FlowFrontmatterSchema,
	GroundFrontmatterSchema,
	getFactCheckJsonSchema,
	getResearchJsonSchema,
	LanguageFrontmatterSchema,
	PolishFrontmatterSchema,
	ProofreadFrontmatterSchema,
	ResearchOutputSchema,
	ReviewFrontmatterSchema,
	ScaffoldFrontmatterSchema,
	SwedishVoiceFrontmatterSchema,
	TafsirEnrichFrontmatterSchema,
	TitleIngressFrontmatterSchema,
	TransliterateFrontmatterSchema,
} from "./schemas.js";
import { ArticlePublisher } from "./services/article-publisher.js";
import { IdeationService } from "./services/ideation-service.js";
import {
	formatBooksForPrompt,
	formatQuotesForPrompt,
	formatQuranForPrompt,
	searchBooksComprehensive,
	searchQuotesComprehensive,
	searchQuranComprehensive,
} from "./services/index.js";
import { extractQuranRefsFromFootnotes, fetchIbnKathirTafsir } from "./services/tarteel-client.js";
import { SourceValidator } from "./source-validator.js";
import {
	createLogger,
	formatDuration,
	getModelId,
	loadOutput,
	pickSwedishAuthors,
	RESEARCH_ALLOWED_TOOLS,
	saveOutput,
	slugify,
} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Extract 2-3 search queries from an article's structure (H1, H2s, first sentence).
 * Used for pre-fetching from local databases.
 */
function extractSearchQueries(articleBody: string): string[] {
	const queries: string[] = [];

	// Extract H1 title
	const h1Match = articleBody.match(/^#\s+(.+)$/m);
	if (h1Match?.[1]) {
		queries.push(h1Match[1]);
	}

	// Extract H2 subheadings
	const h2Matches = articleBody.matchAll(/^##\s+(.+)$/gm);
	for (const match of h2Matches) {
		if (match[1] && queries.length < 3) {
			queries.push(match[1]);
		}
	}

	// Fallback: first sentence if no headings found
	if (queries.length === 0) {
		const firstSentence = articleBody.match(/[^#\n][^\n.!?]*[.!?]/);
		if (firstSentence) {
			queries.push(firstSentence[0].trim());
		} else {
			queries.push(articleBody.slice(0, 300));
		}
	}

	return queries;
}

export type StageName =
	| "research"
	| "factCheck"
	| "authoring"
	| "review"
	| "polish"
	| "deepen"
	| "ground"
	| "detox"
	| "language"
	| "swedishVoice";

export interface StageProgress {
	stage: StageName;
	status: "running" | "complete" | "failed";
	duration?: number;
	summary?: string;
	error?: string;
}

export interface PreviewChunk {
	stage: StageName;
	type: "text" | "tool_use" | "tool_result";
	content: string;
}

export interface OrchestratorOptions {
	/** Output directory for generated content */
	outputDir: string;
	/** Model to use (default: opus) */
	model?: "opus" | "sonnet";
	/** Minimum quality score to publish (default: 7.5) */
	qualityThreshold?: number;
	/** Maximum revision attempts (default: 2) */
	maxRevisions?: number;
	/** Suppress console output (for TUI mode) */
	quiet?: boolean;
	/** Callback for streaming preview snippets during execution */
	onPreview?: (chunk: PreviewChunk) => void;
	/** Callback for stage lifecycle events (starting, completed, failed) */
	onStageChange?: (progress: StageProgress) => void;
}

export type StageResult<T = unknown> =
	| { success: true; data: T; error?: undefined; duration?: number }
	| { success: false; error: string; data?: T; duration?: number };

export interface ResearchOutput {
	topic: string;
	summary: string;
	quranReferences: Array<{
		surah: string;
		ayah: string;
		text: string;
	}>;
	quotes: Array<{
		id: string;
		text: string;
		author: string;
		source?: string;
	}>;
	bookPassages: Array<{
		id: string;
		text: string;
		bookTitle: string;
		author: string;
	}>;
	sources: Array<{
		id: string;
		url: string;
		title: string;
		keyFindings: string[];
	}>;
}

export interface FactCheckOutput {
	overallCredibility: number;
	verdict: "pass" | "revise" | "reject";
	summary: string;
	verifiedClaims: Array<{
		claim: string;
		status: "verified";
		method?: string;
		notes?: string;
	}>;
	unverifiedClaims?: Array<{
		claim: string;
		status: "unverified";
		reason: string;
	}>;
	missingPerspectives?: string[];
	sourceAssessment: {
		totalSources: number;
		highCredibility: number;
	};
	recommendations?: string[];
}

export interface DraftOutput {
	title: string;
	body: string;
	wordCount?: number;
	reflection?: string;
	struggles?: string;
	efficiencySuggestions?: string;
}

export interface ReviewOutput {
	finalScore: number;
	verdict: "publish" | "revise" | "reject";
	summary: string;
	strengths?: string[];
	issues?: string[];
	revisedText?: string | null;
}

export interface PolishOutput {
	sectionScores: string;
	strongestSentence: string;
	weakestSentence: string;
	body: string;
	edits: string;
}

export interface AqeedahReviewOutput {
	verdict: "clean" | "rewritten";
	issuesFound: Array<{
		type: "sufi" | "ashari" | "other";
		location: string;
		original: string;
		issue: string;
		fix: string;
	}>;
	summary: string;
	body: string;
}

export interface LanguageOutput {
	verdict: "clean" | "corrected";
	issuesFound: Array<{
		type: "nonexistent-word" | "anglicism" | "ai-phrase" | "gender" | "preposition";
		location: string;
		original: string;
		correction: string;
		reason: string;
	}>;
	summary: string;
	body: string;
}

export interface ProofreadOutput {
	verdict: "clean" | "corrected";
	issuesFound: Array<{
		type: "spelling" | "grammar" | "punctuation" | "terminology" | "clarity";
		location: string;
		original: string;
		correction: string;
		reason: string;
	}>;
	summary: string;
	body: string;
}

export interface SwedishVoiceOutput {
	verdict: "clean" | "corrected";
	correctedTitle?: string;
	correctedDescription?: string;
	issuesFound: Array<{
		type:
			| "anglicism"
			| "rhetoric"
			| "repetition"
			| "overexplain"
			| "rhythm"
			| "idiom"
			| "hedging"
			| "connector"
			| "abstraction";
		location: string;
		original: string;
		correction: string;
		reason: string;
	}>;
	summary: string;
	body: string;
}

export interface ElevateOutput {
	verdict: "clean" | "elevated";
	changesCount: number;
	changes: Array<{
		location: string;
		original: string;
		replacement: string;
		why: string;
	}>;
	summary: string;
	body: string;
}

export interface FlowOutput {
	verdict: "clean" | "restructured";
	changesCount: number;
	changes: Array<{
		type: string;
		location: string;
		original: string;
		replacement: string;
		why: string;
	}>;
	summary: string;
	body: string;
}

export interface CompressOutput {
	verdict: "clean" | "compressed";
	changesCount: number;
	changes: Array<{
		location: string;
		original: string;
		replacement: string;
		why: string;
	}>;
	summary: string;
	body: string;
}

export interface GroundOutput {
	verdict: "clean" | "grounded";
	changesCount: number;
	changes: Array<{
		location: string;
		original: string;
		addition: string;
		why: string;
	}>;
	summary: string;
	body: string;
}

export interface ScaffoldOutput {
	verdict: "clean" | "trimmed";
	changesCount: number;
	changes: Array<{
		action: "remove" | "absorb";
		location: string;
		original: string;
		result: string;
		why: string;
	}>;
	summary: string;
	body: string;
}

export interface TransliterateOutput {
	verdict: "clean" | "corrected";
	changesCount: number;
	changes: Array<{
		original: string;
		corrected: string;
		occurrences: number;
		locations: string[];
	}>;
	summary: string;
	body: string;
}

export interface CohesionOutput {
	verdict: "cohesive" | "revised";
	changesCount: number;
	changes: Array<{
		type: string;
		location: string;
		problem: string;
		fix: string;
	}>;
	summary: string;
	body: string;
}

export interface DeepenOutput {
	verdict: "clean" | "deepened";
	thesis: string;
	argumentChain: string[];
	gaps: Array<{
		location: string;
		type: string;
		description: string;
	}>;
	changes: Array<{
		location: string;
		type: string;
		before: string;
		after: string;
		reasoning: string;
	}>;
	changesCount: number;
	summary: string;
	body: string;
}

export interface DetoxOutput {
	verdict: "clean" | "detoxed";
	changesCount: number;
	changes: Array<{
		pattern: string;
		location: string;
		original: string;
		replacement: string;
		why: string;
	}>;
	patternCounts: Record<string, { before: number | string; after: number | string }>;
	summary: string;
	body: string;
}

export interface BrillianceOutput {
	verdict: "clean" | "enriched";
	additionsCount: number;
	additions: Array<{
		type: "quote" | "reference" | "argument";
		location: string;
		content: string;
		source: string;
		why: string;
	}>;
	searchesPerformed: Array<{
		tool: string;
		query: string;
		result: string;
	}>;
	summary: string;
	body: string;
}

export interface TitleIngressOutput {
	currentTitleAssessment: string;
	titleSuggestions: Array<{
		title: string;
		reasoning: string;
	}>;
	currentDescriptionAssessment: string;
	descriptionSuggestions: Array<{
		description: string;
		reasoning: string;
	}>;
	recommendation: string;
}

export interface TafsirEnrichOutput {
	verdict: "clean" | "enriched";
	versesAnalyzed: number;
	findings: Array<{
		ayahKey: string;
		surahName: string;
		included: boolean;
		insight: string;
	}>;
	summary: string;
	body: string;
}

export interface ProductionResult {
	success: boolean;
	topic: string;
	outputDir: string;
	stages: {
		research?: StageResult<ResearchOutput>;
		factCheck?: StageResult<FactCheckOutput>;
		authoring?: StageResult<DraftOutput>;
		review?: StageResult<ReviewOutput>;
		polish?: StageResult<PolishOutput>;
		deepen?: StageResult<DeepenOutput>;
		ground?: StageResult<GroundOutput>;
		detox?: StageResult<DetoxOutput>;
		language?: StageResult<LanguageOutput>;
		swedishVoice?: StageResult<SwedishVoiceOutput>;
	};
	finalArticle?: string;
	bibliography?: string;
	totalDuration?: number;
	publishedSlug?: string;
}

export interface IdeaContext {
	topicSlug: string;
	ideaId: number;
}

export interface IdeaBrief {
	title: string;
	thesis: string;
	angle: string;
	keywords: string[];
	difficulty: "standard" | "challenging" | "expert";
	seedQuotes?: Array<{ text: string; author: string; source?: string }>;
}

export class ContentOrchestrator {
	private runner: ClaudeRunner;
	private validator: SourceValidator;
	private references: ReferenceTracker;
	private logger: ReturnType<typeof createLogger>;
	private options: Required<Omit<OrchestratorOptions, "onPreview" | "onStageChange">> &
		Pick<OrchestratorOptions, "onPreview" | "onStageChange">;
	private promptsDir: string;

	constructor(options: OrchestratorOptions) {
		this.runner = new ClaudeRunner();
		this.validator = new SourceValidator();
		this.references = new ReferenceTracker();
		this.promptsDir = join(__dirname, "../prompts");

		this.options = {
			outputDir: options.outputDir,
			model: options.model ?? "opus",
			qualityThreshold: options.qualityThreshold ?? 7,
			maxRevisions: options.maxRevisions ?? 2,
			quiet: options.quiet ?? false,
			onPreview: options.onPreview,
			onStageChange: options.onStageChange,
		};
		this.logger = createLogger(this.options.quiet);
	}

	/**
	 * Execute a Claude stage with common timing, logging, and error handling.
	 * Optionally validates output against a Zod schema.
	 * Returns the raw result - stages handle their own post-processing.
	 * Includes retry logic for transient validation failures.
	 * When onPreview is configured, uses streaming to emit preview snippets.
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-mode stage executor with retry logic
	private async executeClaudeStage<T>(options: {
		name: string;
		stage: PreviewChunk["stage"];
		emoji: string;
		promptFile: string;
		systemPrompt: string;
		allowedTools?: string[];
		/** Zod schema for full output validation (JSON mode) */
		schema?: import("zod").ZodSchema<T>;
		/** JSON Schema for Claude --json-schema flag (JSON mode only) */
		jsonSchema?: object;
		/** Markdown mode: frontmatter+body output instead of JSON.
		 * When set, jsonSchema is ignored. Output is parsed as frontmatter+markdown. */
		markdownMode?: {
			frontmatterSchema: import("zod").ZodSchema;
			combine: (meta: Record<string, unknown>, body: string) => T;
		};
		maxRetries?: number;
		skipPermissions?: boolean;
		mcpConfig?: string;
		effort?: ClaudeRunOptions["effort"];
		timeout?: number;
		/** Content appended to the user prompt (article body, pre-fetched material).
		 *  Keeps article text out of --append-system-prompt so Claude never echoes the prefix. */
		userContent?: string;
	}): Promise<StageResult<T>> {
		const startTime = Date.now();
		const maxRetries = options.maxRetries ?? 2;
		this.logger.log(`${options.emoji} ${options.name}...`);

		const promptPath = join(this.promptsDir, options.promptFile);
		const useStreaming = !!this.options.onPreview;
		const { markdownMode } = options;
		const isMarkdown = !!markdownMode;

		const runOptions: ClaudeRunOptions = {
			prompt: promptPath,
			systemPrompt: options.systemPrompt,
			userContent: options.userContent,
			model: getModelId(this.options.model),
			allowedTools: options.allowedTools,
			mcpConfig: options.mcpConfig,
			// JSON mode: pass schema for server-side validation
			// Markdown mode: no schema, no json output format
			jsonSchema: isMarkdown ? undefined : options.jsonSchema,
			effort: options.effort,
			timeout: options.timeout,
			fallbackModel: "sonnet",
			noSessionPersistence: true,
			skipPermissions: options.skipPermissions ?? true,
		};

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			let result: {
				success: boolean;
				output?: string;
				error?: string;
				data?: T;
				exitCode?: number;
			};

			if (useStreaming) {
				const streamResult = await this.runner.runWithStreaming(runOptions, (chunk) => {
					this.options.onPreview?.({
						stage: options.stage,
						type: chunk.type,
						content: chunk.content,
					});
				});

				if (streamResult.success && streamResult.output) {
					result =
						isMarkdown && markdownMode
							? this.parseMarkdownResult(streamResult, markdownMode)
							: this.parseJsonResult(streamResult, options.schema);
				} else {
					result = streamResult;
				}
			} else if (isMarkdown && markdownMode) {
				// Markdown mode: raw run, parse frontmatter+body
				const rawResult = await this.runner.run(runOptions);
				if (rawResult.success && rawResult.output) {
					result = this.parseMarkdownResult(rawResult, markdownMode);
				} else {
					result = rawResult;
				}
			} else {
				// JSON mode: runJSON with schema validation
				result = await this.runner.runJSON<T>(runOptions, options.schema);
			}

			if (result.success && result.data) {
				return {
					success: true,
					data: result.data,
					duration: Date.now() - startTime,
				};
			}

			// Retry on validation failures and transient errors
			const isRetryable =
				result.error?.includes("Validation failed") ||
				result.error?.includes("rate limit") ||
				result.error?.includes("429") ||
				result.error?.includes("503") ||
				result.error?.includes("overloaded") ||
				result.error?.includes("timed out") ||
				result.error?.includes("ECONNRESET");
			if (isRetryable && attempt < maxRetries) {
				const delay = 2000 * attempt; // exponential backoff: 2s, 4s
				this.logger.log(
					`   ⚠️  ${result.error?.slice(0, 200) ?? "Validation failed"}, retry ${attempt}/${maxRetries - 1} in ${delay / 1000}s...`,
				);
				await new Promise((resolve) => setTimeout(resolve, delay));
				continue;
			}

			return {
				success: false,
				error: result.error || `${options.name} failed`,
				duration: Date.now() - startTime,
			};
		}

		// Should never reach here, but satisfy TypeScript
		return {
			success: false,
			error: `${options.name} failed after ${maxRetries} attempts`,
			duration: Date.now() - startTime,
		};
	}

	/** Parse JSON mode result from streaming or runJSON output */
	private parseJsonResult<T>(
		rawResult: { success: boolean; output?: string; error?: string },
		schema?: import("zod").ZodSchema<T>,
	): { success: boolean; output?: string; error?: string; data?: T } {
		const output = rawResult.output ?? "";
		const parsed = this.runner.parseJSONOutput<T>(output);
		if (parsed && schema) {
			const validation = this.runner.validateOutput(parsed, schema);
			if (validation.success) {
				return { ...rawResult, data: validation.data };
			}
			return { success: false, error: validation.error, output };
		}
		if (parsed) {
			return { ...rawResult, data: parsed as T };
		}
		const snippet = output.slice(0, 300);
		return {
			success: false,
			error: `Output parse failed: no structured_output in stream result.${snippet ? ` Got: ${snippet}...` : " Output was empty."}`,
			output,
		};
	}

	/** Parse markdown frontmatter+body result */
	private parseMarkdownResult<T>(
		rawResult: { success: boolean; output?: string; error?: string },
		markdownMode: {
			frontmatterSchema: import("zod").ZodSchema;
			combine: (meta: Record<string, unknown>, body: string) => T;
		},
	): { success: boolean; output?: string; error?: string; data?: T } {
		const output = rawResult.output ?? "";
		const parsed = this.runner.parseMarkdownWithMeta(output);
		if (!parsed) {
			const head = output.slice(0, 500);
			const tail = output.slice(-300);
			return {
				success: false,
				error: `Output parse failed: no frontmatter block found. Length: ${output.length} chars.\nHEAD: ${head}\nTAIL: ${tail}`,
				output,
			};
		}

		const validation = this.runner.validateOutput(parsed.meta, markdownMode.frontmatterSchema);
		if (!validation.success) {
			return { success: false, error: validation.error, output };
		}

		const data = markdownMode.combine(validation.data as Record<string, unknown>, parsed.body);
		return { ...rawResult, data };
	}

	/**
	 * Ensure output directory exists
	 */
	private ensureOutputDir(topicSlug: string): string {
		const dir = join(this.options.outputDir, topicSlug);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	/**
	 * Post-process research results: URL verification, source validation, reference tracking
	 * Returns both the stage result and a formatted summary with timing breakdown.
	 */
	private async processResearchResult(
		rawResult: StageResult<ResearchOutput>,
		startTime: number,
	): Promise<{ result: StageResult<ResearchOutput>; summary: string }> {
		if (!(rawResult.success && rawResult.data)) {
			return {
				result: {
					success: false,
					error: rawResult.error || "Research stage failed",
					duration: Date.now() - startTime,
				},
				summary: "",
			};
		}

		const claudeDuration = rawResult.duration ?? Date.now() - startTime;

		// URL verification
		this.options.onStageChange?.({
			stage: "research",
			status: "running",
			summary: "Verifying URLs...",
		});
		const rawSources = rawResult.data.sources || [];
		this.logger.log("   - Verifying URLs...");
		const verifyStart = Date.now();
		const urlsToVerify = rawSources.map((s) => s.url);
		const verification = await this.validator.verifyUrls(urlsToVerify);

		if (verification.stats.failed > 0) {
			this.logger.log(`   - ⚠️  ${verification.stats.failed} URL(s) failed verification`);
		}

		// Persist URL verification results for future blocklist
		try {
			const tracker = loadDomainTracker();
			updateDomainTracker(tracker, verification.results);
			saveDomainTracker(tracker);
		} catch (e) {
			this.logger.warn(`   - ⚠️  Failed to save domain tracker: ${e}`);
		}

		const verifiedUrls = new Set<string>();
		for (const r of verification.results) {
			if (r.exists) verifiedUrls.add(r.url);
		}

		const validatedSources = rawSources
			.filter((source) => verifiedUrls.has(source.url))
			.filter((source) => {
				const validation = this.validator.validateSource(source.url);
				return validation.credibility !== "rejected";
			});
		const urlVerifyDuration = Date.now() - verifyStart;

		// Quote verification
		this.options.onStageChange?.({
			stage: "research",
			status: "running",
			summary: "Checking quotes...",
		});
		const quoteVerifyStart = Date.now();
		const rawQuotes = rawResult.data.quotes || [];
		let verifiedCount = 0;
		for (const quote of rawQuotes) {
			const numericId = Number.parseInt(String(quote.id).replace(/^quote-/, ""), 10);
			if (Number.isNaN(numericId)) {
				this.logger.log(`   - ⚠️  Quote has invalid ID: ${quote.id}`);
			} else {
				const dbQuote = getQuote(numericId);
				if (dbQuote) {
					verifiedCount++;
				} else {
					this.logger.log(`   - ⚠️  Quote ID ${quote.id} not found in database`);
				}
			}
		}
		if (rawQuotes.length > 0) {
			this.logger.log(`   - Verified ${verifiedCount}/${rawQuotes.length} quotes against database`);
		}
		const quoteVerifyDuration = Date.now() - quoteVerifyStart;

		const data: ResearchOutput = {
			...rawResult.data,
			sources: validatedSources,
			quotes: rawQuotes,
			bookPassages: rawResult.data.bookPassages || [],
		};

		for (const source of data.sources) {
			this.references.addReference({
				type: "web",
				title: source.title,
				url: source.url,
				accessDate: new Date().toISOString(),
			});
		}
		for (const quote of data.quotes) {
			this.references.addReference({
				type: "quote",
				title: quote.source || "Unknown",
				author: quote.author,
			});
		}

		this.logger.log(`   - Found ${data.quotes.length} quotes, ${data.sources.length} sources`);

		// Build summary with timing breakdown
		const verifyTotal = urlVerifyDuration + quoteVerifyDuration;
		const counts = `${data.sources.length} sources, ${data.quotes.length} quotes`;
		const timing = `LLM ${formatDuration(claudeDuration)}, verify ${formatDuration(verifyTotal)}`;
		this.logger.log(`   - Timing: ${timing}`);

		return {
			result: {
				success: true,
				data,
				duration: Date.now() - startTime,
			},
			summary: `${counts} | ${timing}`,
		};
	}

	/**
	 * Run the research stage from an EnrichedIdea
	 * Uses pre-found quotes and the idea's angle for targeted searching
	 */
	async runResearchFromIdea(idea: {
		thesis: string;
		angle: string;
		keywords: string[];
		seedQuotes?: Array<{ text: string; author: string; source?: string }>;
	}): Promise<{ result: StageResult<ResearchOutput>; summary: string }> {
		const startTime = Date.now();

		const blocklist = formatBlockedDomainsPrompt(getBlockedDomains(loadDomainTracker()));

		const suggestedAuthors = pickSwedishAuthors(4);
		let systemPrompt = `Topic: ${idea.thesis}

<context>
This article has a specific angle already developed. Your research should find material that supports and enriches this perspective.

Angle: ${idea.angle}

Suggested keywords: ${idea.keywords.join(", ")}
</context>

<guidance>
Find the best material for this specific angle:
- Quotes from scholars/authors — for Swedish voices, consider ${suggestedAuthors.join(", ")} alongside others
- Quran verses relevant to the angle
- Book passages for extended context
- Web sources for contemporary perspectives

Run multiple MCP searches in parallel, but do NOT mix WebFetch/WebSearch with MCP calls in the same batch — a web timeout kills sibling calls.
IMPORTANT WebFetch limitations:
- Skip URLs ending in .pdf — returns binary garbage.
- Skip litteraturbanken.se — JavaScript SPA, returns empty shell HTML.
- Skip any URL that returned empty/useless content on the first try.
</guidance>${blocklist}`;

		if (idea.seedQuotes && idea.seedQuotes.length > 0) {
			const formatted = idea.seedQuotes
				.map((q) => `- "${q.text}" — ${q.author}${q.source ? ` (${q.source})` : ""}`)
				.join("\n");
			systemPrompt += `

<seed_material>
These quotes were pre-found during ideation as a starting point. Use them if relevant, but search for richer and more diverse material — they are not the complete set.

${formatted}
</seed_material>`;
		}

		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.executeClaudeStage<ResearchOutput>({
			name: "Stage 1: Research (from idea)",
			stage: "research",
			emoji: "📚",
			promptFile: "research.md",
			systemPrompt,
			allowedTools: RESEARCH_ALLOWED_TOOLS,
			mcpConfig: mcpConfigPath,
			schema: ResearchOutputSchema,
			jsonSchema: getResearchJsonSchema(),
			effort: "high",
			timeout: 1800000, // 30 min — research is the most tool-intensive stage
		});

		return this.processResearchResult(result, startTime);
	}

	/**
	 * Run the research stage
	 * Uses MCP quote tools for intelligent, targeted searching
	 */
	async runResearch(
		topic: string,
	): Promise<{ result: StageResult<ResearchOutput>; summary: string }> {
		const startTime = Date.now();

		const blocklist = formatBlockedDomainsPrompt(getBlockedDomains(loadDomainTracker()));

		const suggestedAuthors = pickSwedishAuthors(4);
		const systemPrompt = `Topic: ${topic}

<context>
You have access to MCP tools for searching the quote database (~30k quotes: Arabic Islamic scholars, Swedish literature, Norse texts).

Your task is to develop a distinctive angle on this topic and gather supporting material. The angle should be specific enough to make the article interesting ("X as Y" rather than just "about X").
</context>

<guidance>
Consider what would make this article compelling:
- What's a fresh or counter-intuitive take on this topic?
- Which classical Islamic scholars addressed this theme?
- For Swedish perspectives, consider searching for quotes by ${suggestedAuthors.join(", ")} — but follow the material wherever it leads.

Run multiple MCP searches in parallel, but do NOT mix WebFetch/WebSearch with MCP calls in the same batch — a web timeout kills sibling calls.
IMPORTANT WebFetch limitations:
- Skip URLs ending in .pdf — returns binary garbage.
- Skip litteraturbanken.se — JavaScript SPA, returns empty shell HTML.
- Skip any URL that returned empty/useless content on the first try.
</guidance>${blocklist}`;

		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.executeClaudeStage<ResearchOutput>({
			name: "Stage 1: Research",
			stage: "research",
			emoji: "📚",
			promptFile: "research.md",
			systemPrompt,
			allowedTools: RESEARCH_ALLOWED_TOOLS,
			mcpConfig: mcpConfigPath,
			schema: ResearchOutputSchema,
			jsonSchema: getResearchJsonSchema(),
			effort: "high",
			timeout: 1800000, // 30 min — research is the most tool-intensive stage
		});

		return this.processResearchResult(result, startTime);
	}

	/**
	 * Run the fact-checking stage
	 */
	async runFactCheck(research: ResearchOutput): Promise<StageResult<FactCheckOutput>> {
		// Build domain reputation context for source credibility assessment
		const sourceUrls = (research.sources || []).map((s) => s.url);
		const reputation = formatDomainReputation(loadDomainTracker(), sourceUrls);

		// Provide research data with framing that guides balanced assessment
		const systemPrompt = `Research data to review:\n${JSON.stringify(research, null, 2)}

<review_guidance>
Score fairly based on what you can actually verify:
- Claims backed by database quotes (with IDs) are pre-verified — count them as verified
- Claims from web sources you can fetch and confirm are verified
- Claims you cannot independently verify are NOT automatically unverified — they may simply be common scholarly knowledge
- Only mark claims "unverified" if you find contradicting evidence or the claim is extraordinary and unsourced
- The threshold to pass is 7 — award that score if the research has no fabrications and reasonable sourcing
- WebFetch cannot read PDFs (.pdf) or JS-rendered sites (litteraturbanken.se)
</review_guidance>${reputation}`;

		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.executeClaudeStage<FactCheckOutput>({
			name: "Stage 2: Quality Review",
			stage: "factCheck",
			emoji: "🔍",
			promptFile: "fact-checker.md",
			systemPrompt,
			allowedTools: [
				"WebFetch",
				"WebSearch",
				"mcp__quotes__fetch_wikipedia",
				"mcp__quotes__search_quotes",
				"mcp__quotes__search_by_filter",
				"mcp__quotes__search_text",
				"mcp__quotes__get_quote_by_id",
			], // Content verification + independent search + quote attribution checks
			mcpConfig: mcpConfigPath,
			schema: FactCheckOutputSchema,
			jsonSchema: getFactCheckJsonSchema(),
			effort: "high",
			timeout: 1800000, // 30 min — fact-check verifies sources via web + MCP
		});

		if (!(result.success && result.data)) {
			return result;
		}

		const data = {
			...result.data,
			verifiedClaims: result.data.verifiedClaims || [],
		};

		this.logger.log(`   - Verified ${data.verifiedClaims.length} claims`);
		this.logger.log(`   - Overall credibility: ${data.overallCredibility ?? 0}/10`);

		// Check quality gate
		if (data.overallCredibility < this.options.qualityThreshold) {
			this.logger.log(`   ❌ Credibility below threshold (${this.options.qualityThreshold})`);
			this.logger.log(`   Summary: ${data.summary}`);
			if (data.unverifiedClaims && data.unverifiedClaims.length > 0) {
				this.logger.log(`   Unverified claims (${data.unverifiedClaims.length}):`);
				for (const claim of data.unverifiedClaims) {
					this.logger.log(`     - ${claim.claim}: ${claim.reason}`);
				}
			}
			if (data.recommendations && data.recommendations.length > 0) {
				this.logger.log("   Recommendations:");
				for (const rec of data.recommendations) {
					this.logger.log(`     - ${rec}`);
				}
			}
			return {
				success: false,
				data,
				error: `Credibility score ${data.overallCredibility} below threshold ${this.options.qualityThreshold}`,
				duration: result.duration,
			};
		}

		return { ...result, data };
	}

	/**
	 * Run the authoring stage
	 */
	async runAuthoring(
		research: ResearchOutput,
		factCheck: FactCheckOutput,
		ideaBrief?: IdeaBrief,
	): Promise<StageResult<DraftOutput>> {
		let systemPrompt = "";

		if (ideaBrief) {
			const difficultyGuidance: Record<string, string> = {
				standard:
					"Accessible but never condescending. A well-read generalist should follow every argument. Define technical terms on first use.",
				challenging:
					"Assume readers know basic Islamic terminology (taqwa, fitna, tazkiya). Move quickly through fundamentals to reach the insight.",
				expert:
					"Write for specialists. Use technical vocabulary freely. The value is in the original synthesis, not in explaining established concepts.",
			};

			systemPrompt += `## CREATIVE DIRECTION
This is your creative compass, not handcuffs — deviate where the material demands it.

**Working title** (improve it if you find something sharper): ${ideaBrief.title}

**Thesis:** ${ideaBrief.thesis}

**Angle:** ${ideaBrief.angle}

**Register:** ${difficultyGuidance[ideaBrief.difficulty] ?? difficultyGuidance.standard}

The research below was gathered to support this angle.

`;
		}

		systemPrompt += `## DEVELOPED ANGLE
${research.summary}

## CONTEXT
You are writing for islam.se. The purpose is to promote Islamic thought intelligently to Swedish readers.

Key requirements:
- ONE clear thematic thread from start to finish
- Compelling subtitles that make readers want to continue
- Let quotes and passages earn their place
- Reference the Quran where relevant
- Let classical Islamic scholars shine
- Swedish/Western authors strengthen the Islamic stance — for this article, consider weaving in ${pickSwedishAuthors(3).join(", ")} if the research material includes them
- Use markdown blockquotes and footnotes
- Write natural Swedish prose — avoid anglicisms like "i termer av", "adressera", "baserat på", calque constructions. Prefer Swedish idiom and rhythm (Axess/Respons register).`;

		// Format quotes readably
		if (research.quotes.length > 0) {
			const formatted = research.quotes
				.map((q) => `- "${q.text}" — ${q.author}${q.source ? `, *${q.source}*` : ""}`)
				.join("\n");
			systemPrompt += `\n\n## QUOTES\n${formatted}`;
		}

		// Format Quran references readably
		if (research.quranReferences.length > 0) {
			const formatted = research.quranReferences
				.map((q) => `- ${q.surah} ${q.ayah}: "${q.text}"`)
				.join("\n");
			systemPrompt += `\n\n## QURAN REFERENCES\n${formatted}`;
		}

		// Format book passages with full text for weaving in
		if (research.bookPassages && research.bookPassages.length > 0) {
			const formatted = research.bookPassages
				.map((p) => `### ${p.bookTitle} — ${p.author}\n${p.text}`)
				.join("\n\n---\n\n");
			systemPrompt += `\n\n## BOOK PASSAGES
Weave the strongest into your prose — quote directly when the original language is powerful, paraphrase for flow. Cite as footnotes (Author, *Work*, chapter/section).

${formatted}`;
		}

		// Format web sources for footnotes (title + URL only)
		if (research.sources.length > 0) {
			const formatted = research.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n");
			systemPrompt += `\n\n## WEB SOURCES (for footnotes)\n${formatted}`;
		}

		// Pass actionable guidance from fact-checker
		const guidance: string[] = [];
		if (factCheck.unverifiedClaims && factCheck.unverifiedClaims.length > 0) {
			guidance.push(
				"UNVERIFIED CLAIMS (do NOT use these without rewording or independent support):\n" +
					factCheck.unverifiedClaims.map((c) => `- ${c.claim}: ${c.reason}`).join("\n"),
			);
		}
		if (factCheck.missingPerspectives && factCheck.missingPerspectives.length > 0) {
			guidance.push(
				"MISSING PERSPECTIVES (consider addressing):\n" +
					factCheck.missingPerspectives.map((p) => `- ${p}`).join("\n"),
			);
		}
		if (factCheck.recommendations && factCheck.recommendations.length > 0) {
			guidance.push(
				"FACT-CHECKER RECOMMENDATIONS:\n" +
					factCheck.recommendations.map((r) => `- ${r}`).join("\n"),
			);
		}
		if (guidance.length > 0) {
			systemPrompt += `\n\n## FACT-CHECK GUIDANCE\n${guidance.join("\n\n")}`;
		}

		const result = await this.executeClaudeStage<DraftOutput>({
			name: "Stage 3: Authoring",
			stage: "authoring",
			emoji: "✍️ ",
			promptFile: "author.md",
			systemPrompt,
			allowedTools: ["Read"],
			markdownMode: {
				frontmatterSchema: DraftFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
						wordCount: body.split(/\s+/).filter((w) => w.length > 0).length,
					}) as DraftOutput,
			},
			effort: "max",
			timeout: 2700000, // 45 min — authoring with effort:max needs room for deep thinking
		});

		if (!(result.success && result.data)) {
			return result;
		}

		const wordCount = result.data.wordCount ?? result.data.body.split(/\s+/).length;
		this.logger.log(`   - Draft complete: ${wordCount} words`);
		if (result.data.struggles) {
			this.logger.log(`   - Struggles: ${result.data.struggles.slice(0, 200)}`);
		}
		if (result.data.efficiencySuggestions) {
			this.logger.log(`   - Suggestions: ${result.data.efficiencySuggestions.slice(0, 200)}`);
		}

		return result;
	}

	/**
	 * Run the review stage
	 */
	async runReview(
		draft: DraftOutput,
		research: ResearchOutput,
		factCheck?: FactCheckOutput,
		ideaBrief?: IdeaBrief,
		previousReview?: ReviewOutput,
	): Promise<StageResult<ReviewOutput>> {
		let systemPrompt = "";

		// If this is a re-review after revision, provide focused context
		if (previousReview) {
			systemPrompt += `## REVISION CONTEXT
This is a **re-review**. You previously scored this article ${previousReview.finalScore}/10 and requested revisions. Your edits have been applied to the text below.

**Your previous summary:** ${previousReview.summary}

**Issues you flagged:**
${(previousReview.issues || []).map((i) => `- ${i}`).join("\n")}

**Your task now:** Evaluate whether your specific issues are resolved. If they are, the score should reflect the improvement. Do NOT re-discover the same issues — focus on whether the revised text addresses them. If the prose is now at publish quality, verdict "publish".

`;
		}

		if (ideaBrief) {
			systemPrompt += `## INTENDED DIRECTION
Assess whether the draft delivers on this promise — or drifted into a generic overview.

**Thesis:** ${ideaBrief.thesis}
**Angle:** ${ideaBrief.angle}

`;
		}

		systemPrompt += `## ARTICLE TO REVIEW

**Title:** ${draft.title}

${draft.body}`;

		// Pass condensed research quotes for cross-referencing
		if (research.quotes.length > 0) {
			const quoteList = research.quotes
				.map(
					(q) =>
						`- [ID ${q.id}] ${q.author}${q.source ? `, *${q.source}*` : ""}: "${q.text.slice(0, 80)}${q.text.length > 80 ? "..." : ""}"`,
				)
				.join("\n");
			systemPrompt += `\n\n## VERIFIED QUOTES (from research)\nCross-reference the article's blockquotes against this list. Flag any quoted passage not found here — it may be invented.\n\n${quoteList}`;
		}

		// Pass fact-check flags so reviewer can verify author addressed them
		if (factCheck) {
			const fcContext: string[] = [];
			if (factCheck.unverifiedClaims && factCheck.unverifiedClaims.length > 0) {
				fcContext.push(
					"**Unverified claims** (verify the author avoided or reworded these):\n" +
						factCheck.unverifiedClaims.map((c) => `- ${c.claim}`).join("\n"),
				);
			}
			if (factCheck.recommendations && factCheck.recommendations.length > 0) {
				fcContext.push(
					"**Recommendations** (check whether the author addressed each — flag any that were silently ignored):\n" +
						factCheck.recommendations.map((r) => `- ${r}`).join("\n"),
				);
			}
			if (factCheck.missingPerspectives && factCheck.missingPerspectives.length > 0) {
				fcContext.push(
					"**Missing perspectives** (check whether the author engaged with these — flag significant omissions):\n" +
						factCheck.missingPerspectives.map((p) => `- ${p}`).join("\n"),
				);
			}
			if (fcContext.length > 0) {
				systemPrompt += `\n\n## FACT-CHECK FLAGS\n${fcContext.join("\n\n")}`;
			}
		}

		systemPrompt += `

<language_quality>
This article is for a Swedish publication. Watch for and fix anglicisms — English-influenced phrasing that sounds unnatural in Swedish:
- "i termer av" → "när det gäller", "vad gäller"
- "ta plats" (take place) → "äga rum", "ske"
- "göra en skillnad" → "göra skillnad"
- "vid slutet av dagen" → "i slutändan", "ytterst"
- "det är upp till" → "det ankommer på", "det beror på"
- "adressera" (address an issue) → "ta upp", "behandla"
- "nyckel-" as prefix (key insight) → "avgörande", "central"
- "baserat på" → "grundat på", "utifrån"
- "implementera" → "genomföra", "tillämpa"
- Stiff calque constructions: rephrase for natural Swedish prose rhythm
- Prefer Swedish conjunctions and flow over English sentence patterns
If the draft has anglicisms, fix them in the revised article.
</language_quality>`;

		const result = await this.executeClaudeStage<ReviewOutput>({
			name: "Stage 4: Review",
			stage: "review",
			emoji: "👁️ ",
			promptFile: "reviewer.md",
			systemPrompt,
			markdownMode: {
				frontmatterSchema: ReviewFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						revisedText: body || null,
					}) as ReviewOutput,
			},
			effort: "max",
			timeout: 1800000, // 30 min — review with effort:max does full rewrite + language audit
		});

		if (!(result.success && result.data)) {
			return result;
		}

		this.logger.log(`   - Quality Score: ${result.data.finalScore ?? 0}/10`);
		this.logger.log(`   - VERDICT: ${(result.data.verdict || "unknown").toUpperCase()}`);

		return result;
	}

	/**
	 * Run the polish stage — final prose refinement by a Swedish literary master matched to content
	 */
	async runPolish(articleBody: string): Promise<StageResult<PolishOutput>> {
		this.logger.log("   🖊️  Polish: prose rhythm, momentum, voice");

		const systemPrompt =
			"Du är en erfaren svensk essäist och redaktör. Du läser den här texten som en krävande läsare, inte som en redigerare.";

		const result = await this.executeClaudeStage<PolishOutput>({
			name: "Stage 5: Polish",
			stage: "polish",
			emoji: "🖊️ ",
			promptFile: "polish.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: PolishFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as PolishOutput,
			},
			effort: "high",
		});

		return result;
	}

	/**
	 * Review article for aqeedah compliance (Sufi, Ashari/Maturidi, non-mainstream ideas).
	 * Returns the article body with problematic passages rewritten.
	 */
	async runAqeedahReview(articleBody: string): Promise<StageResult<AqeedahReviewOutput>> {
		this.logger.log("   📖 Aqeedah review: theological compliance check");

		const systemPrompt =
			"Du granskar en publicerad artikel för islam.se. Analysera texten teologiskt och skriv om problematiska avsnitt enligt instruktionerna.";

		const result = await this.executeClaudeStage<AqeedahReviewOutput>({
			name: "Aqeedah Review",
			stage: "polish", // reuse polish stage type for streaming
			emoji: "📖",
			promptFile: "aqeedah-review.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: AqeedahReviewFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as AqeedahReviewOutput,
			},
			effort: "high",
		});

		return result;
	}

	/**
	 * Proofread article for spelling, grammar, punctuation, and terminology consistency.
	 * Returns the article body with corrections applied.
	 */
	async runProofread(articleBody: string): Promise<StageResult<ProofreadOutput>> {
		this.logger.log("   🔤 Proofread: spelling, grammar, terminology");

		const systemPrompt =
			"Du korrekturläser en publicerad artikel för islam.se. Kontrollera stavning, grammatik, interpunktion och terminologisk konsekvens enligt instruktionerna.";

		const result = await this.executeClaudeStage<ProofreadOutput>({
			name: "Proofread",
			stage: "polish", // reuse polish stage type for streaming
			emoji: "🔤",
			promptFile: "proofread.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: ProofreadFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as ProofreadOutput,
			},
			effort: "high",
		});

		return result;
	}

	/**
	 * Check word/phrase level Swedish naturalness — non-existent words, anglicisms,
	 * AI filler phrases, gender errors, and preposition calques from English.
	 */
	async runLanguage(articleBody: string): Promise<StageResult<LanguageOutput>> {
		this.logger.log("   🇸🇪 Language: ord som inte finns, anglicismer, AI-fraser");

		const systemPrompt =
			"Du är en infödd svensk redaktör. Du letar efter ord och fraser som inte är naturlig svenska: påhittade ord, anglicismer, AI-klyscheér på frasnivå, genusfel och calques från engelska. Ingenting annat.";

		const result = await this.executeClaudeStage<LanguageOutput>({
			name: "Language",
			stage: "polish",
			emoji: "🇸🇪",
			promptFile: "language.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: LanguageFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as LanguageOutput,
			},
			effort: "high",
		});

		return result;
	}

	/**
	 * Review article for Swedish naturalness — fix anglicisms, AI rhetoric patterns,
	 * repetition loops, overexplanation, and English sentence rhythm.
	 */
	async runSwedishVoice(
		articleBody: string,
		meta?: { title?: string; description?: string },
		mode: "fix" | "enrich" = "fix",
	): Promise<StageResult<SwedishVoiceOutput>> {
		const modeLabel =
			mode === "enrich" ? "enrich: inversion, compounds, rhythm" : "anglicisms, rhetoric, rhythm";
		this.logger.log(`   🇸🇪 Swedish voice: ${modeLabel}`);

		let metaSection = "";
		if (meta?.title || meta?.description) {
			metaSection = "\n\n## TITEL OCH INGRESS\n";
			if (meta.title) metaSection += `**Titel:** ${meta.title}\n`;
			if (meta.description) metaSection += `**Ingress:** ${meta.description}\n`;
		}

		const modeDirective =
			mode === "enrich"
				? `Du berikar en publicerad artikel för islam.se. Ditt HUVUDUPPDRAG är sektion 16 i prompten — "Svenskans egna verktyg". Aktivt använd:

- **Inversion (V2-regeln)** — flytta fram tidsadverbial, platsadverbial, objekt för betoning och flöde
- **Sammansatta ord** — slå ihop prepositionsfraser till energiska sammansättningar
- **Participkonstruktioner** — skapa eleganta bryggor mellan meningar
- **Semantiska konnektorer** (därav, häri, därmed, nämligen, likväl, sålunda) — komprimera logik
- **Etymologiskt djup** — aktivera ords dubbelmeningar där ämnet korsar rotbetydelsen
- **Meningsrytm** — skapa kontrast mellan korta och långa meningar, bryt monotoni

Sektionerna 1–15 (anglicismer, retoriska mönster etc.) är sekundära — åtgärda dem om du ser dem, men din huvuduppgift är att BERIKA texten med svenskans unika verktyg. Målet är att texten ska kännas som om den skrevs av en svensk essäist som medvetet utnyttjar språkets resurser.`
				: "Du granskar en publicerad artikel för islam.se. Identifiera och åtgärda mönster som avslöjar att texten tänkts på engelska.";

		const systemPrompt = `${modeDirective}${metaSection}`;

		const result = await this.executeClaudeStage<SwedishVoiceOutput>({
			name: "Swedish Voice",
			stage: "polish", // reuse polish stage type for streaming
			emoji: "🇸🇪",
			promptFile: "swedish-voice.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: SwedishVoiceFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as SwedishVoiceOutput,
			},
			effort: "high",
			maxRetries: 3,
		});

		return result;
	}

	/**
	 * Run the elevate stage — raise intellectual density of prose.
	 * Smarter word choices, conceptual sentence links, compression, resonance.
	 */
	async runElevate(articleBody: string): Promise<StageResult<ElevateOutput>> {
		this.logger.log("   🧠 Elevate: intellectual density, word precision, resonance");

		const systemPrompt =
			"Du är en stilmedveten svensk essäist med öra för intellektuell precision. Du höjer den intellektuella densiteten i varje mening som tål det.";

		const result = await this.executeClaudeStage<ElevateOutput>({
			name: "Elevate",
			stage: "polish",
			emoji: "🧠",
			promptFile: "elevate.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: ElevateFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as ElevateOutput,
			},
			effort: "high",
		});

		return result;
	}

	/**
	 * Run the flow stage — sentence architecture and transitions.
	 * Splits overloaded sentences, merges choppy ones, fixes inter-sentence bridges.
	 * Enforces Swedish writing rules (satsradning, kommatering, bisatsordning).
	 */
	async runFlow(articleBody: string): Promise<StageResult<FlowOutput>> {
		this.logger.log("   🌊 Flow: sentence boundaries, transitions, Swedish sentence law");

		const systemPrompt =
			"Du är en svensk stilredaktör specialiserad på meningsarkitektur. Du granskar meningsgränser och övergångar — ingenting annat. Varje AI-genererad text har meningsarkitekturproblem. Hitta dem.";

		// Flow uses the configured model (opus/sonnet) — but note that Opus can be slow
		// on this task because it evaluates every sentence boundary in extended thinking.
		// If Opus consistently times out, consider running with --model sonnet.
		const result = await this.executeClaudeStage<FlowOutput>({
			name: "Flow",
			stage: "polish",
			emoji: "🌊",
			promptFile: "flow.md",
			systemPrompt,
			userContent: `Här är texten att granska:\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: FlowFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as FlowOutput,
			},
			effort: "high",
			timeout: 900000, // 15 min — Opus needs time for sentence-by-sentence analysis
		});

		return result;
	}

	async runCompress(articleBody: string): Promise<StageResult<CompressOutput>> {
		this.logger.log("   🔧 Compress: multi-word phrases → single precise Swedish words");

		const systemPrompt =
			"Du är en svensk stilredaktör specialiserad på lexikal komprimering. Du söker fraser på 2–5 ord som kan ersättas med ett enda mer precist ord — ingenting annat.";

		const result = await this.executeClaudeStage<CompressOutput>({
			name: "Compress",
			stage: "polish",
			emoji: "🔧",
			promptFile: "compress.md",
			systemPrompt,
			userContent: `Här är texten att granska:\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: CompressFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as CompressOutput,
			},
			effort: "high",
			timeout: 900000,
		});

		return result;
	}

	async runGround(articleBody: string): Promise<StageResult<GroundOutput>> {
		this.logger.log("   🌱 Ground: anchoring abstract concepts in concrete human moments");

		const systemPrompt =
			"Du är en svensk essäredaktör specialiserad på att förankra abstrakt filosofi i konkreta mänskliga ögonblick. Du lägger till EN mening där ett begrepp svävar utan förankring — ingenting annat.";

		const result = await this.executeClaudeStage<GroundOutput>({
			name: "Ground",
			stage: "polish",
			emoji: "🌱",
			promptFile: "ground.md",
			systemPrompt,
			userContent: `Här är texten att granska:\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: GroundFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as GroundOutput,
			},
			effort: "high",
			timeout: 900000,
		});

		return result;
	}

	async runCohesion(articleBody: string): Promise<StageResult<CohesionOutput>> {
		this.logger.log("   🧵 Cohesion: orphan quotes, topic jumps, loose endings, unprepared intros");

		const systemPrompt =
			"Du är en svensk redaktör specialiserad på textkoherens och läsbarhet. Du granskar om essäns delar hänger ihop för läsaren — ingenting annat.";

		const result = await this.executeClaudeStage<CohesionOutput>({
			name: "Cohesion",
			stage: "polish",
			emoji: "🧵",
			promptFile: "cohesion.md",
			systemPrompt,
			userContent: `Här är texten att granska:\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: CohesionFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as CohesionOutput,
			},
			effort: "high",
			timeout: 900000,
		});

		return result;
	}

	async runScaffold(articleBody: string): Promise<StageResult<ScaffoldOutput>> {
		this.logger.log('   🪓 Scaffold: trimming decorative "Det är den som..." / ". Som..." closers');

		const systemPrompt =
			'Du är en svensk stilredaktör. Du söker fristående illustrerande meningar — "Det är den som..." och ". Som [scenario]." — som blivit dekorativa genom sin frekvens. Du tar bort eller absorberar de överflödiga och behåller de genuint starka.';

		const result = await this.executeClaudeStage<ScaffoldOutput>({
			name: "Scaffold",
			stage: "polish",
			emoji: "🪓",
			promptFile: "scaffold.md",
			systemPrompt,
			userContent: `Här är texten att granska:\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: ScaffoldFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as ScaffoldOutput,
			},
			effort: "high",
			timeout: 900000,
		});

		return result;
	}

	async runTransliterate(articleBody: string): Promise<StageResult<TransliterateOutput>> {
		this.logger.log("   🔤 Transliterate: verifying academic Arabic transliteration");

		const systemPrompt =
			"Du är en arabisk lingvist specialiserad på akademisk translitterering (ISO 233-2 / DIN 31635). Du kontrollerar att alla arabiska termer i texten har korrekta diakritiska tecken — ā, ī, ū, ḥ, ṣ, ḍ, ṭ, ẓ, ʿ, ʾ — ingenting annat.";

		const result = await this.executeClaudeStage<TransliterateOutput>({
			name: "Transliterate",
			stage: "polish",
			emoji: "🔤",
			promptFile: "transliterate.md",
			systemPrompt,
			userContent: `Här är texten att granska:\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: TransliterateFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as TransliterateOutput,
			},
			effort: "high",
			timeout: 900000,
		});

		return result;
	}

	/**
	 * Run the deepen stage — find where the essay illustrates rather than argues,
	 * and add the missing reasoning steps. 1–2 surgical changes per article.
	 */
	async runDeepen(articleBody: string): Promise<StageResult<DeepenOutput>> {
		this.logger.log("   🔬 Deepen: finding illustration where argumentation is needed");

		const systemPrompt =
			"Du är en filosof och argumentationsanalytiker. Du söker avsnitt som illustrerar sin tes istället för att argumentera för den — och lägger till det saknade resonemangssteget.";

		const result = await this.executeClaudeStage<DeepenOutput>({
			name: "Deepen",
			stage: "polish",
			emoji: "🔬",
			promptFile: "deepen.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: DeepenFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as DeepenOutput,
			},
			effort: "high",
			timeout: 600000, // 10 min — Opus needs extended thinking for argument analysis
		});

		return result;
	}

	/**
	 * Run the detox stage — remove AI vocabulary and structural tics from published articles.
	 * Targets specific patterns identified through corpus analysis of 44 articles:
	 * "inte X utan Y" overuse, vocabulary monotony, attribution verb repetition,
	 * em-dash saturation, convergence formulas, dramatic one-liner endings.
	 */
	async runDetox(articleBody: string): Promise<StageResult<DetoxOutput>> {
		this.logger.log("   🧹 Detox: hunting AI vocabulary and structural tics");

		const systemPrompt =
			"Du rensar specifika, mätbara AI-språkmönster från en publicerad artikel. Du är inte en allmän stilredaktör — du jagar exakt de mönster som listas i prompten och ersätter dem med naturlig svensk variation. Varje ändring måste bevara meningens exakta innebörd.";

		const result = await this.executeClaudeStage<DetoxOutput>({
			name: "Detox",
			stage: "polish",
			emoji: "🧹",
			promptFile: "detox.md",
			systemPrompt,
			userContent: `Här är texten att rensa:\n\n${articleBody}`,
			markdownMode: {
				frontmatterSchema: DetoxFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as DetoxOutput,
			},
			effort: "high",
			timeout: 1800000, // 30 min — Opus extended thinking for pattern counting + full rewrite
		});

		return result;
	}

	/**
	 * Run the brilliance stage — search for exceptional additions (quotes, references, arguments)
	 * that would make the article significantly more convincing for a secular Swedish reader.
	 * Most articles pass through unchanged — the threshold is doctoral-thesis level.
	 *
	 * Pre-fetches from quote/book/quran databases locally (~200ms, free),
	 * embeds results in system prompt, and lets Claude use only WebSearch.
	 */
	async runBrilliance(articleBody: string): Promise<StageResult<BrillianceOutput>> {
		this.logger.log("   💎 Brilliance: pre-fetching local databases");

		// Extract search queries from article structure
		const queries = extractSearchQueries(articleBody);
		this.logger.log(`      Queries: ${queries.map((q) => `"${q}"`).join(", ")}`);

		// Pre-fetch all three databases in parallel (local embeddings = free, ~200ms)
		const [quoteResult, bookResult, quranResult] = await Promise.all([
			searchQuotesComprehensive({ topic: queries[0] ?? articleBody.slice(0, 300) }),
			searchBooksComprehensive({ topic: queries[0] ?? articleBody.slice(0, 300) }),
			searchQuranComprehensive({ queries, limit: 10 }),
		]);

		this.logger.log(
			`      Pre-fetched: ${quoteResult.semanticMatches.length} quotes, ${bookResult.combined.length} book passages, ${quranResult.verses.length} Quran verses`,
		);

		// Format pre-fetched material
		const prefetchedMaterial = [
			"# PRE-FETCHED SOURCE MATERIAL",
			"",
			"The following quotes, book passages, and Quran verses were retrieved from local databases using semantic search on the article's key themes. Review them for exceptional additions.",
			"",
			formatQuotesForPrompt(quoteResult),
			formatBooksForPrompt(bookResult),
			formatQuranForPrompt(quranResult),
		].join("\n");

		const systemPrompt =
			"Du söker efter exceptionella tillägg — citat, referenser, argument — som skulle göra denna artikel märkbart starkare för en bildad sekulär svensk läsare. Tröskeln är doktorsavhandlingsnivå. Varje text har minst en lucka — hitta den.";

		const result = await this.executeClaudeStage<BrillianceOutput>({
			name: "Brilliance",
			stage: "polish",
			emoji: "💎",
			promptFile: "brilliance.md",
			systemPrompt,
			userContent: `## TEXTEN\n\n${articleBody}\n\n${prefetchedMaterial}`,
			markdownMode: {
				frontmatterSchema: BrillianceFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as BrillianceOutput,
			},
			effort: "high",
			timeout: 600000, // 10 min (down from 30)
		});

		return result;
	}

	/**
	 * Generate improved title and ingress suggestions for a published article.
	 * Returns ranked alternatives — does not modify the article directly.
	 */
	async runTitleIngress(
		articleBody: string,
		meta: { title: string; description: string },
	): Promise<StageResult<TitleIngressOutput>> {
		this.logger.log("   ✏️  Title & ingress: generating suggestions");

		const systemPrompt = `Du förbättrar titel och ingress för en publicerad artikel på islam.se.

## NUVARANDE TITEL
${meta.title}

## NUVARANDE INGRESS
${meta.description}

## ARTIKELN

${articleBody}`;

		const result = await this.executeClaudeStage<TitleIngressOutput>({
			name: "Title & Ingress",
			stage: "polish",
			emoji: "✏️",
			promptFile: "title-ingress.md",
			systemPrompt,
			markdownMode: {
				frontmatterSchema: TitleIngressFrontmatterSchema,
				combine: (meta) => meta as unknown as TitleIngressOutput,
			},
			effort: "high",
		});

		return result;
	}

	/**
	 * Tafsir enrichment: fetch Ibn Kathir commentary for Quran verses cited in the article,
	 * then ask Claude to validate and deepen the article's use of those verses.
	 */
	async runTafsirEnrich(articleBody: string): Promise<StageResult<TafsirEnrichOutput>> {
		this.logger.log("   📜 Tafsir: extracting Quran references from footnotes");

		// 1. Extract Quran references from footnotes
		const refs = extractQuranRefsFromFootnotes(articleBody);
		if (refs.length === 0) {
			this.logger.log("      No Quran references found in footnotes.");
			return {
				success: true,
				data: {
					verdict: "clean",
					versesAnalyzed: 0,
					findings: [],
					summary: "Inga Koranreferenser hittades i fotnoterna.",
					body: articleBody,
				},
				duration: 0,
			};
		}

		this.logger.log(
			`      Found ${refs.length} Quran references: ${refs.map((r) => r.ayahKey).join(", ")}`,
		);

		// 2. Fetch Ibn Kathir tafsir from Tarteel
		this.logger.log("      Fetching Ibn Kathir tafsir from Tarteel...");
		const ayahKeys = refs.map((r) => r.ayahKey);
		const tafsirResults = await fetchIbnKathirTafsir(ayahKeys);
		this.logger.log(`      Received tafsir for ${tafsirResults.length}/${refs.length} verses`);

		if (tafsirResults.length === 0) {
			this.logger.log("      No tafsir data received. Skipping.");
			return {
				success: true,
				data: {
					verdict: "clean",
					versesAnalyzed: 0,
					findings: [],
					summary: "Kunde inte hämta tafsir från Tarteel — inga ändringar gjorda.",
					body: articleBody,
				},
				duration: 0,
			};
		}

		// 3. Build tafsir context for Claude
		const tafsirContext = tafsirResults
			.map((t) => {
				const ref = refs.find((r) => r.ayahKey === t.ayahKey);
				const surahName = ref?.surahName ?? `Surah ${t.surah}`;
				// Truncate very long tafsir to keep prompt manageable
				const truncated = t.text.length > 2000 ? `${t.text.slice(0, 2000)}…` : t.text;
				return `### ${surahName} ${t.ayahKey}\n${truncated}`;
			})
			.join("\n\n");

		const systemPrompt =
			"Du granskar en publicerad artikel för islam.se mot Ibn Kathirs tafsir. Din uppgift är att verifiera att artikelns användning av Koranverser stämmer med den klassiska tolkningen, och föreslå fördjupningar där tafsiren ger insikter som artikeln missar.";

		const result = await this.executeClaudeStage<TafsirEnrichOutput>({
			name: "Tafsir Enrich",
			stage: "polish",
			emoji: "📜",
			promptFile: "tafsir-enrich.md",
			systemPrompt,
			userContent: `## ARTIKELN\n\n${articleBody}\n\n## IBN KATHIRS TAFSIR\n\n${tafsirContext}`,
			markdownMode: {
				frontmatterSchema: TafsirEnrichFrontmatterSchema,
				combine: (meta, body) =>
					({
						...meta,
						body,
					}) as TafsirEnrichOutput,
			},
			effort: "high",
			timeout: 600000,
		});

		return result;
	}

	/**
	 * Publish article and update idea status
	 */
	private publishArticle(
		outputDir: string,
		_topicSlug: string,
		draft: DraftOutput,
		qualityScore: number,
		finalWordCount: number,
		ideaContext?: IdeaContext,
	): string | undefined {
		// Derive slug from final title, not the working topic slug
		const articleSlug = slugify(draft.title);

		// Publish to web-accessible directory
		try {
			const publisher = new ArticlePublisher();
			publisher.publish(outputDir, articleSlug, {
				title: draft.title,
				wordCount: finalWordCount,
				qualityScore,
			});
			this.logger.log(`   📤 Published to data/articles/${articleSlug}.md`);
		} catch (publishError) {
			this.logger.warn(`   ⚠️  Failed to publish article: ${publishError}`);
			return undefined;
		}

		// Update idea status if context provided
		if (ideaContext) {
			try {
				const ideationService = new IdeationService({
					outputDir: this.options.outputDir,
				});
				ideationService.updateIdeaStatus(ideaContext.topicSlug, ideaContext.ideaId, {
					status: "done",
					producedAt: new Date().toISOString(),
					articleSlug,
				});
				this.logger.log(`   ✓ Marked idea #${ideaContext.ideaId} as done`);
			} catch (statusError) {
				this.logger.warn(`   ⚠️  Failed to update idea status: ${statusError}`);
			}
		}

		return articleSlug;
	}

	/**
	 * Run the complete content production pipeline
	 * @param topic - The article topic
	 * @param ideaContext - Optional context linking to source idea for status tracking
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-stage pipeline orchestrator
	async produce(
		topic: string,
		ideaContext?: IdeaContext,
		ideaBrief?: IdeaBrief,
		options?: { resume?: boolean },
	): Promise<ProductionResult> {
		const startTime = Date.now();
		const topicSlug = slugify(topic);
		const outputDir = this.ensureOutputDir(topicSlug);
		const resume = options?.resume ?? false;

		const result: ProductionResult = {
			success: false,
			topic,
			outputDir,
			stages: {},
		};

		// Save idea brief for audit trail
		if (ideaBrief) {
			saveOutput(outputDir, "idea-brief.json", ideaBrief);
		}

		// Stage 1: Research
		let researchResult: StageResult<ResearchOutput>;
		const cachedResearch = resume ? loadOutput<ResearchOutput>(outputDir, "research.json") : null;
		if (cachedResearch && ResearchOutputSchema.safeParse(cachedResearch).success) {
			this.logger.log("📚 Stage 1: Research — loaded from checkpoint");
			researchResult = { success: true, data: cachedResearch, duration: 0 };
			this.options.onStageChange?.({
				stage: "research",
				status: "complete",
				duration: 0,
				summary: `${cachedResearch.sources.length} sources, ${cachedResearch.quotes.length} quotes (cached)`,
			});
		} else {
			this.options.onStageChange?.({ stage: "research", status: "running" });
			const research = ideaBrief
				? await this.runResearchFromIdea({
						thesis: ideaBrief.thesis,
						angle: ideaBrief.angle,
						keywords: ideaBrief.keywords,
						seedQuotes: ideaBrief.seedQuotes,
					})
				: await this.runResearch(topic);
			researchResult = research.result;
			if (!(researchResult.success && researchResult.data)) {
				this.options.onStageChange?.({
					stage: "research",
					status: "failed",
					duration: researchResult.duration,
					error: researchResult.error,
				});
				result.stages.research = researchResult;
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			this.options.onStageChange?.({
				stage: "research",
				status: "complete",
				duration: researchResult.duration,
				summary: research.summary,
			});
			saveOutput(outputDir, "research.json", researchResult.data);
		}
		result.stages.research = researchResult;

		// Stage 2: Fact-Check
		let factCheckResult: StageResult<FactCheckOutput>;
		const cachedFactCheck = resume
			? loadOutput<FactCheckOutput>(outputDir, "fact-check.json")
			: null;
		if (
			cachedFactCheck &&
			FactCheckOutputSchema.safeParse(cachedFactCheck).success &&
			cachedFactCheck.overallCredibility >= this.options.qualityThreshold
		) {
			this.logger.log("🔍 Stage 2: Quality Review — loaded from checkpoint");
			factCheckResult = { success: true, data: cachedFactCheck, duration: 0 };
			this.options.onStageChange?.({
				stage: "factCheck",
				status: "complete",
				duration: 0,
				summary: `Score: ${cachedFactCheck.overallCredibility}/10 (cached)`,
			});
		} else {
			this.options.onStageChange?.({ stage: "factCheck", status: "running" });
			factCheckResult = await this.runFactCheck(researchResult.data);
			// Always save fact-check output for debugging (even on failure)
			if (factCheckResult.data) {
				saveOutput(outputDir, "fact-check.json", factCheckResult.data);
			}
			if (!(factCheckResult.success && factCheckResult.data)) {
				this.options.onStageChange?.({
					stage: "factCheck",
					status: "failed",
					duration: factCheckResult.duration,
					error: factCheckResult.error,
				});
				result.stages.factCheck = factCheckResult;
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			this.options.onStageChange?.({
				stage: "factCheck",
				status: "complete",
				duration: factCheckResult.duration,
				summary: `Score: ${factCheckResult.data.overallCredibility}/10`,
			});
		}
		result.stages.factCheck = factCheckResult;

		// Stage 3: Authoring
		let authoringResult: StageResult<DraftOutput>;
		const cachedDraft = resume ? loadOutput<DraftOutput>(outputDir, "draft-meta.json") : null;
		if (cachedDraft && DraftOutputSchema.safeParse(cachedDraft).success) {
			this.logger.log("✍️  Stage 3: Authoring — loaded from checkpoint");
			const cachedWordCount = cachedDraft.wordCount ?? cachedDraft.body.split(/\s+/).length;
			authoringResult = { success: true, data: cachedDraft, duration: 0 };
			this.options.onStageChange?.({
				stage: "authoring",
				status: "complete",
				duration: 0,
				summary: `${cachedWordCount} words (cached)`,
			});
		} else {
			this.options.onStageChange?.({ stage: "authoring", status: "running" });
			authoringResult = await this.runAuthoring(
				researchResult.data,
				factCheckResult.data,
				ideaBrief,
			);
			if (!(authoringResult.success && authoringResult.data)) {
				this.options.onStageChange?.({
					stage: "authoring",
					status: "failed",
					duration: authoringResult.duration,
					error: authoringResult.error,
				});
				result.stages.authoring = authoringResult;
				result.totalDuration = Date.now() - startTime;
				return result;
			}
			const wordCount =
				authoringResult.data.wordCount ?? authoringResult.data.body.split(/\s+/).length;
			this.options.onStageChange?.({
				stage: "authoring",
				status: "complete",
				duration: authoringResult.duration,
				summary: `${wordCount} words`,
			});
			saveOutput(outputDir, "draft.md", authoringResult.data.body);
			saveOutput(outputDir, "draft-meta.json", authoringResult.data);
		}
		result.stages.authoring = authoringResult;

		// Stage 4: Review (with potential revision loop)
		// All three are guaranteed non-null: either loaded from cache or ran successfully
		let currentDraft = authoringResult.data;
		const researchData = researchResult.data;
		const factCheckData = factCheckResult.data;
		let revisionCount = 0;
		let lastReviewData: ReviewOutput | undefined;

		this.options.onStageChange?.({ stage: "review", status: "running" });

		while (revisionCount <= this.options.maxRevisions) {
			const reviewResult = await this.runReview(
				currentDraft,
				researchData,
				factCheckData,
				ideaBrief,
				lastReviewData, // Pass previous review for focused re-evaluation
			);
			result.stages.review = reviewResult;

			if (!(reviewResult.success && reviewResult.data)) {
				this.options.onStageChange?.({
					stage: "review",
					status: "failed",
					duration: reviewResult.duration,
					error: reviewResult.error,
				});
				result.totalDuration = Date.now() - startTime;
				return result;
			}

			lastReviewData = reviewResult.data;
			saveOutput(outputDir, "review.json", reviewResult.data);
			const reviewSummary = `${reviewResult.data.finalScore}/10 — ${reviewResult.data.verdict}`;

			// Check verdict
			if (reviewResult.data.verdict === "publish") {
				this.options.onStageChange?.({
					stage: "review",
					status: "complete",
					duration: reviewResult.duration,
					summary: reviewSummary,
				});
				break;
			}

			if (reviewResult.data.verdict === "reject") {
				this.options.onStageChange?.({
					stage: "review",
					status: "failed",
					duration: reviewResult.duration,
					summary: reviewSummary,
					error: "Article rejected",
				});
				this.logger.log("   ❌ Article rejected - requires complete rewrite");
				result.totalDuration = Date.now() - startTime;
				return result;
			}

			// Verdict is 'revise'
			if (revisionCount >= this.options.maxRevisions) {
				this.options.onStageChange?.({
					stage: "review",
					status: "complete",
					duration: reviewResult.duration,
					summary: `${reviewSummary} (max revisions)`,
				});
				this.logger.log(`   ⚠️  Max revisions (${this.options.maxRevisions}) reached`);
				break;
			}

			// Apply revisions if provided
			if (reviewResult.data.revisedText) {
				currentDraft = {
					...currentDraft,
					body: reviewResult.data.revisedText,
				};
				revisionCount++;
				this.logger.log(`   📝 Revision ${revisionCount} applied, re-reviewing...`);
			} else {
				this.options.onStageChange?.({
					stage: "review",
					status: "complete",
					duration: reviewResult.duration,
					summary: reviewSummary,
				});
				this.logger.log("   ⚠️  Revisions requested but no revised text provided");
				break;
			}
		}

		// After review loop — reject already returned early above, so we have text to polish + publish
		if (!lastReviewData) {
			result.totalDuration = Date.now() - startTime;
			return result;
		}
		const reviewData = lastReviewData;
		let finalText = reviewData.revisedText ?? currentDraft.body;

		// Stage 5: Polish — final prose refinement by a Swedish literary master
		this.options.onStageChange?.({ stage: "polish", status: "running" });
		const polishResult = await this.runPolish(finalText);
		result.stages.polish = polishResult;
		if (polishResult.success && polishResult.data) {
			finalText = polishResult.data.body;
			const editCount = polishResult.data.edits.split("\n").filter((l) => l.trim()).length;
			this.logger.log(
				`   - Polish: ${editCount} edits, weakest: "${polishResult.data.weakestSentence.slice(0, 60)}..."`,
			);
			saveOutput(outputDir, "polish.json", polishResult.data);
			this.options.onStageChange?.({
				stage: "polish",
				status: "complete",
				duration: polishResult.duration,
				summary: `${editCount} edits`,
			});
		} else {
			this.options.onStageChange?.({
				stage: "polish",
				status: "failed",
				duration: polishResult.duration,
				error: polishResult.error,
				summary: "skipped (non-fatal)",
			});
		}

		// Stage 6: Deepen — argument development, logical gaps (non-fatal)
		this.options.onStageChange?.({ stage: "deepen", status: "running" });
		const deepenResult = await this.runDeepen(finalText);
		result.stages.deepen = deepenResult;
		if (deepenResult.success && deepenResult.data) {
			finalText = deepenResult.data.body;
			this.logger.log(`   - Deepen: ${deepenResult.data.verdict}`);
			saveOutput(outputDir, "deepen.json", deepenResult.data);
			this.options.onStageChange?.({
				stage: "deepen",
				status: "complete",
				duration: deepenResult.duration,
				summary: deepenResult.data.verdict,
			});
		} else {
			this.options.onStageChange?.({
				stage: "deepen",
				status: "failed",
				duration: deepenResult.duration,
				error: deepenResult.error,
				summary: "skipped (non-fatal)",
			});
		}

		// Stage 7: Ground — anchor abstract concepts in concrete moments (non-fatal)
		this.options.onStageChange?.({ stage: "ground", status: "running" });
		const groundResult = await this.runGround(finalText);
		result.stages.ground = groundResult;
		if (groundResult.success && groundResult.data) {
			finalText = groundResult.data.body;
			this.logger.log(`   - Ground: ${groundResult.data.verdict}`);
			saveOutput(outputDir, "ground.json", groundResult.data);
			this.options.onStageChange?.({
				stage: "ground",
				status: "complete",
				duration: groundResult.duration,
				summary: groundResult.data.verdict,
			});
		} else {
			this.options.onStageChange?.({
				stage: "ground",
				status: "failed",
				duration: groundResult.duration,
				error: groundResult.error,
				summary: "skipped (non-fatal)",
			});
		}

		// Stage 8: Detox — AI vocabulary/structural tic cleanup (non-fatal)
		this.options.onStageChange?.({ stage: "detox", status: "running" });
		const detoxResult = await this.runDetox(finalText);
		result.stages.detox = detoxResult;
		if (detoxResult.success && detoxResult.data) {
			finalText = detoxResult.data.body;
			this.logger.log(`   - Detox: ${detoxResult.data.verdict}`);
			saveOutput(outputDir, "detox.json", detoxResult.data);
			this.options.onStageChange?.({
				stage: "detox",
				status: "complete",
				duration: detoxResult.duration,
				summary: detoxResult.data.verdict,
			});
		} else {
			this.options.onStageChange?.({
				stage: "detox",
				status: "failed",
				duration: detoxResult.duration,
				error: detoxResult.error,
				summary: "skipped (non-fatal)",
			});
		}

		// Stage 9: Language — word-level Swedish naturalness (non-fatal)
		this.options.onStageChange?.({ stage: "language", status: "running" });
		const languageResult = await this.runLanguage(finalText);
		result.stages.language = languageResult;
		if (languageResult.success && languageResult.data) {
			finalText = languageResult.data.body;
			const issueCount = languageResult.data.issuesFound.length;
			this.logger.log(`   - Language: ${issueCount} issues fixed (${languageResult.data.verdict})`);
			saveOutput(outputDir, "language.json", languageResult.data);
			this.options.onStageChange?.({
				stage: "language",
				status: "complete",
				duration: languageResult.duration,
				summary: `${issueCount} issues`,
			});
		} else {
			this.options.onStageChange?.({
				stage: "language",
				status: "failed",
				duration: languageResult.duration,
				error: languageResult.error,
				summary: "skipped (non-fatal)",
			});
		}

		// Stage 7: Swedish Voice — fix anglicisms, rhetoric patterns, rhythm (non-fatal)
		this.options.onStageChange?.({ stage: "swedishVoice", status: "running" });
		const swedishVoiceResult = await this.runSwedishVoice(finalText);
		result.stages.swedishVoice = swedishVoiceResult;
		if (swedishVoiceResult.success && swedishVoiceResult.data) {
			finalText = swedishVoiceResult.data.body;
			const issueCount = swedishVoiceResult.data.issuesFound.length;
			this.logger.log(
				`   - Swedish Voice: ${issueCount} issues fixed (${swedishVoiceResult.data.verdict})`,
			);
			saveOutput(outputDir, "swedish-voice.json", swedishVoiceResult.data);
			this.options.onStageChange?.({
				stage: "swedishVoice",
				status: "complete",
				duration: swedishVoiceResult.duration,
				summary: `${issueCount} issues`,
			});
		} else {
			this.options.onStageChange?.({
				stage: "swedishVoice",
				status: "failed",
				duration: swedishVoiceResult.duration,
				error: swedishVoiceResult.error,
				summary: "skipped (non-fatal)",
			});
		}

		saveOutput(outputDir, "final.md", finalText);

		// Generate bibliography (include all tracked references)
		const bibliography = this.references.formatSwedishBibliography(false);
		if (bibliography.trim()) {
			saveOutput(outputDir, "references.md", `# Referenser\n\n${bibliography}`);
		}

		// Save metadata with stage timings
		const finalWordCount = finalText.split(/\s+/).filter((w) => w.length > 0).length;
		saveOutput(outputDir, "metadata.json", {
			topic,
			producedAt: new Date().toISOString(),
			qualityScore: reviewData.finalScore,
			wordCount: finalWordCount,
			revisionCount,
			stageDurations: {
				research: researchResult.duration,
				factCheck: factCheckResult.duration,
				authoring: authoringResult.duration,
				review: result.stages.review?.duration,
				polish: polishResult.duration,
				deepen: deepenResult.duration,
				ground: groundResult.duration,
				detox: detoxResult.duration,
				language: languageResult.duration,
				swedishVoice: swedishVoiceResult.duration,
				total: Date.now() - startTime,
			},
		});

		// Publish to web-accessible directory and update idea status
		result.publishedSlug = this.publishArticle(
			outputDir,
			topicSlug,
			currentDraft,
			reviewData.finalScore,
			finalWordCount,
			ideaContext,
		);

		// Record domain quality for published articles
		if (result.publishedSlug && researchData.sources.length > 0) {
			try {
				const tracker = loadDomainTracker();
				recordPublishedArticle(
					tracker,
					researchData.sources.map((s) => s.url),
					reviewData.finalScore,
				);
				saveDomainTracker(tracker);
			} catch (e) {
				this.logger.warn(`   ⚠️  Failed to record domain quality: ${e}`);
			}
		}

		result.success = true;
		result.finalArticle = finalText;
		result.bibliography = bibliography;

		result.totalDuration = Date.now() - startTime;

		this.logger.log("✅ Content production complete!");

		return result;
	}

	/**
	 * Run research only (no writing)
	 */
	async researchOnly(topic: string): Promise<StageResult<ResearchOutput>> {
		const topicSlug = slugify(topic);
		const outputDir = this.ensureOutputDir(topicSlug);

		const { result } = await this.runResearch(topic);
		if (result.success && result.data) {
			saveOutput(outputDir, "research.json", result.data);
		}

		return result;
	}

	/**
	 * Get production status for a topic
	 */
	getStatus(topicSlug: string): {
		exists: boolean;
		stages: {
			research: boolean;
			factCheck: boolean;
			draft: boolean;
			review: boolean;
			final: boolean;
		};
		metadata?: {
			producedAt: string;
			qualityScore: number;
			wordCount: number;
		};
	} {
		const dir = join(this.options.outputDir, topicSlug);

		if (!existsSync(dir)) {
			return {
				exists: false,
				stages: {
					research: false,
					factCheck: false,
					draft: false,
					review: false,
					final: false,
				},
			};
		}

		const metadata = loadOutput<{
			producedAt: string;
			qualityScore: number;
			wordCount: number;
		}>(dir, "metadata.json");

		return {
			exists: true,
			stages: {
				research: existsSync(join(dir, "research.json")),
				factCheck: existsSync(join(dir, "fact-check.json")),
				draft: existsSync(join(dir, "draft.md")),
				review: existsSync(join(dir, "review.json")),
				final: existsSync(join(dir, "final.md")),
			},
			metadata: metadata || undefined,
		};
	}
}

// Re-export services
export {
	ArticlePublisher,
	type BookSearchOptions,
	type BookSearchResult,
	type EnrichedIdea,
	type EnrichedIdeationOutput,
	type EnrichedQuote,
	formatBooksForPrompt,
	formatQuotesForPrompt,
	hasBookContent,
	type Idea,
	type IdeaProductionStatus,
	type IdeationOutput,
	IdeationService,
	type IdeationServiceOptions,
	type PodcastResult,
	PodcastService,
	type PublishedArticle,
	parseFrontmatter,
	passagesToResearchFormat,
	type QuoteSearchOptions,
	type QuoteSearchResult,
	quotesToResearchFormat,
	searchBooksComprehensive,
	searchQuotesComprehensive,
} from "./services/index.js";
export { SourceValidator } from "./source-validator.js";
