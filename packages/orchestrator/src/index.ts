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
	DraftFrontmatterSchema,
	DraftOutputSchema,
	FactCheckOutputSchema,
	getFactCheckJsonSchema,
	getResearchJsonSchema,
	PolishFrontmatterSchema,
	ResearchOutputSchema,
	ReviewFrontmatterSchema,
} from "./schemas.js";
import { ArticlePublisher } from "./services/article-publisher.js";
import { IdeationService } from "./services/ideation-service.js";
import { SourceValidator } from "./source-validator.js";
import {
	createLogger,
	formatDuration,
	getModelId,
	loadOutput,
	RESEARCH_ALLOWED_TOOLS,
	saveOutput,
	slugify,
} from "./utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type StageName = "research" | "factCheck" | "authoring" | "review" | "polish";

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
		maxTurns?: number;
		timeout?: number;
	}): Promise<StageResult<T>> {
		const startTime = Date.now();
		const maxRetries = options.maxRetries ?? 2;
		this.logger.log(`${options.emoji} ${options.name}...`);

		const promptPath = join(this.promptsDir, options.promptFile);
		const useStreaming = !!this.options.onPreview;
		const isMarkdown = !!options.markdownMode;

		const runOptions: ClaudeRunOptions = {
			prompt: promptPath,
			systemPrompt: options.systemPrompt,
			model: getModelId(this.options.model),
			allowedTools: options.allowedTools,
			mcpConfig: options.mcpConfig,
			// JSON mode: pass schema for server-side validation
			// Markdown mode: no schema, no json output format
			jsonSchema: isMarkdown ? undefined : options.jsonSchema,
			effort: options.effort,
			maxTurns: options.maxTurns,
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
					result = isMarkdown
						? this.parseMarkdownResult(streamResult, options.markdownMode!)
						: this.parseJsonResult(streamResult, options.schema);
				} else {
					result = streamResult;
				}
			} else if (isMarkdown) {
				// Markdown mode: raw run, parse frontmatter+body
				const rawResult = await this.runner.run(runOptions);
				if (rawResult.success && rawResult.output) {
					result = this.parseMarkdownResult(rawResult, options.markdownMode!);
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
					`   ⚠️  Validation failed, retry ${attempt}/${maxRetries - 1} in ${delay / 1000}s...`,
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
			const snippet = output.slice(0, 200);
			return {
				success: false,
				error: `Output parse failed: no frontmatter block found.${snippet ? ` Got: ${snippet}...` : " Output was empty."}`,
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

		let systemPrompt = `Topic: ${idea.thesis}

<context>
This article has a specific angle already developed. Your research should find material that supports and enriches this perspective.

Angle: ${idea.angle}

Suggested keywords: ${idea.keywords.join(", ")}
</context>

<guidance>
Find the best material for this specific angle:
- Quotes from scholars/authors (Arabic + Swedish/Western perspectives)
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
			maxTurns: 25,
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

		const systemPrompt = `Topic: ${topic}

<context>
You have access to MCP tools for searching the quote database (~30k quotes: Arabic Islamic scholars, Swedish literature, Norse texts).

Your task is to develop a distinctive angle on this topic and gather supporting material. The angle should be specific enough to make the article interesting ("X as Y" rather than just "about X").
</context>

<guidance>
Consider what would make this article compelling:
- What's a fresh or counter-intuitive take on this topic?
- Which classical Islamic scholars addressed this theme?
- What Swedish or Western perspectives could enrich the discussion?

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
			maxTurns: 25,
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
			maxTurns: 20,
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
- Swedish/Western authors strengthen the Islamic stance
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
			effort: "high",
			timeout: 1800000, // 30 min — authoring with effort:max needs room
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
			effort: "high",
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

		const systemPrompt = `Du är en erfaren svensk essäist och redaktör. Du läser den här texten som en krävande läsare, inte som en redigerare.\n\n## TEXTEN\n\n${articleBody}`;

		const result = await this.executeClaudeStage<PolishOutput>({
			name: "Stage 5: Polish",
			stage: "polish",
			emoji: "🖊️ ",
			promptFile: "polish.md",
			systemPrompt,
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

		const systemPrompt = `Du granskar en publicerad artikel för islam.se. Analysera texten teologiskt och skriv om problematiska avsnitt enligt instruktionerna.\n\n## TEXTEN\n\n${articleBody}`;

		const result = await this.executeClaudeStage<AqeedahReviewOutput>({
			name: "Aqeedah Review",
			stage: "polish", // reuse polish stage type for streaming
			emoji: "📖",
			promptFile: "aqeedah-review.md",
			systemPrompt,
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
