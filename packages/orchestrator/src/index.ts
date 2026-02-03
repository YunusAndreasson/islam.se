import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { ClaudeRunner, type ClaudeRunOptions } from "./claude-runner.js";
import { ReferenceTracker } from "./reference-tracker.js";
import {
	DraftOutputSchema,
	FactCheckOutputSchema,
	getDraftJsonSchema,
	getFactCheckJsonSchema,
	getResearchJsonSchema,
	getReviewJsonSchema,
	ResearchOutputSchema,
	ReviewOutputSchema,
} from "./schemas.js";
import { ArticlePublisher } from "./services/article-publisher.js";
import { IdeationService } from "./services/ideation-service.js";
import { SourceValidator } from "./source-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface OrchestratorOptions {
	/** Output directory for generated content */
	outputDir: string;
	/** Model to use (default: opus) */
	model?: "opus" | "sonnet";
	/** Minimum quality score to publish (default: 7.5) */
	qualityThreshold?: number;
	/** Target word count (default: 2500) */
	targetWordCount?: number;
	/** Include Arabic quotes (default: true) */
	includeArabic?: boolean;
	/** Maximum revision attempts (default: 2) */
	maxRevisions?: number;
}

export interface StageResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	duration?: number;
}

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
		notes?: string;
	}>;
	unverifiedClaims?: Array<{
		claim: string;
		status: "unverified";
		reason: string;
	}>;
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
}

export interface ReviewOutput {
	finalScore: number;
	verdict: "publish" | "revise" | "reject";
	summary: string;
	strengths?: string[];
	issues?: string[];
	revisedText?: string | null;
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

export class ContentOrchestrator {
	private runner: ClaudeRunner;
	private validator: SourceValidator;
	private references: ReferenceTracker;
	private options: Required<OrchestratorOptions>;
	private promptsDir: string;

	constructor(options: OrchestratorOptions) {
		this.runner = new ClaudeRunner();
		this.validator = new SourceValidator();
		this.references = new ReferenceTracker();
		this.promptsDir = join(__dirname, "../prompts");

		this.options = {
			outputDir: options.outputDir,
			model: options.model ?? "opus",
			qualityThreshold: options.qualityThreshold ?? 7.5,
			targetWordCount: options.targetWordCount ?? 2500,
			includeArabic: options.includeArabic ?? true,
			maxRevisions: options.maxRevisions ?? 2,
		};
	}

	/**
	 * Generate a URL-safe slug from topic
	 */
	private slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[åä]/g, "a")
			.replace(/[ö]/g, "o")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 50);
	}

	/**
	 * Get model ID for Claude CLI
	 */
	private getModelId(): ClaudeRunOptions["model"] {
		return this.options.model === "opus"
			? "claude-opus-4-5-20251101"
			: "claude-sonnet-4-5-20250929";
	}

	/**
	 * Execute a Claude stage with common timing, logging, and error handling.
	 * Optionally validates output against a Zod schema.
	 * Returns the raw result - stages handle their own post-processing.
	 * Includes retry logic for transient validation failures.
	 */
	private async executeClaudeStage<T>(options: {
		name: string;
		emoji: string;
		promptFile: string;
		systemPrompt: string;
		allowedTools: string[];
		schema?: z.ZodSchema<T>;
		jsonSchema?: object;
		maxRetries?: number;
	}): Promise<StageResult<T>> {
		const startTime = Date.now();
		const maxRetries = options.maxRetries ?? 2;
		console.log(`${options.emoji} ${options.name}...`);

		const promptPath = join(this.promptsDir, options.promptFile);

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			const result = await this.runner.runJSON<T>(
				{
					prompt: promptPath,
					systemPrompt: options.systemPrompt,
					model: this.getModelId(),
					allowedTools: options.allowedTools,
					jsonSchema: options.jsonSchema,
					fallbackModel: "sonnet",
					noSessionPersistence: true,
				},
				options.schema,
			);

			if (result.success && result.data) {
				return {
					success: true,
					data: result.data,
					duration: Date.now() - startTime,
				};
			}

			// Only retry on validation failures (transient issues)
			const isValidationError = result.error?.includes("Validation failed");
			if (isValidationError && attempt < maxRetries) {
				const delay = 2000 * attempt; // exponential backoff: 2s, 4s
				console.log(
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
	 * Save stage output to file
	 */
	private saveOutput(dir: string, filename: string, data: unknown): void {
		const filepath = join(dir, filename);
		if (typeof data === "string") {
			writeFileSync(filepath, data, "utf-8");
		} else {
			writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
		}
	}

	/**
	 * Load stage output from file
	 */
	private loadOutput<T>(dir: string, filename: string): T | null {
		const filepath = join(dir, filename);
		if (!existsSync(filepath)) {
			return null;
		}
		const content = readFileSync(filepath, "utf-8");
		if (filename.endsWith(".json")) {
			return JSON.parse(content) as T;
		}
		// For non-JSON files, content is the raw string
		return content as T;
	}

	/**
	 * Run the research stage from an EnrichedIdea
	 * Uses pre-found quotes and the idea's angle for targeted searching
	 */
	async runResearchFromIdea(idea: {
		thesis: string;
		angle: string;
		keywords: string[];
		quotes: Array<{ id: number; text: string; author: string; source?: string }>;
	}): Promise<StageResult<ResearchOutput>> {
		const startTime = Date.now();
		console.log("📚 Stage 1: Research (from idea)...");

		// Convert pre-found quotes to research format
		const preFoundQuotes = idea.quotes.map((q) => ({
			id: `idea-quote-${q.id}`,
			text: q.text,
			author: q.author,
			source: q.source,
		}));

		console.log(`   - Using ${preFoundQuotes.length} pre-found quotes from ideation`);
		console.log(`   - Angle: ${idea.angle.slice(0, 80)}...`);

		// Build system prompt with idea context - giving Claude autonomy per best practices
		const systemPrompt = `Topic: ${idea.thesis}

<context>
This article has a specific angle already developed. Your research should find material that supports and enriches this perspective.

Angle: ${idea.angle}

Suggested keywords: ${idea.keywords.join(", ")}
</context>

<pre_found_quotes>
These quotes were already identified as relevant during ideation. Include them in your output and find complementary material:
${preFoundQuotes.map((q) => `- "${q.text.slice(0, 100)}..." — ${q.author}`).join("\n")}
</pre_found_quotes>

<guidance>
Focus on finding quotes and sources that:
- Directly support the specific angle (not just the general topic)
- Provide cross-cultural perspectives (Arabic scholars + Swedish/Western authors)
- Add depth or nuance to the pre-found material

Use parallel tool calls when searching multiple angles or authors simultaneously.
</guidance>`;

		// Run Claude with MCP quote tools + web tools
		const promptPath = join(this.promptsDir, "research.md");
		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.runner.runJSON<ResearchOutput>(
			{
				prompt: promptPath,
				systemPrompt,
				model: this.getModelId(),
				mcpConfig: mcpConfigPath,
				allowedTools: [
					"mcp__quotes__search_quotes",
					"mcp__quotes__search_by_filter",
					"mcp__quotes__search_text",
					"mcp__quotes__get_inventory",
					"mcp__quotes__bulk_search",
					"WebSearch",
					"Read",
				],
				jsonSchema: getResearchJsonSchema(),
				fallbackModel: "sonnet",
				noSessionPersistence: true,
			},
			ResearchOutputSchema,
		);

		if (!(result.success && result.data)) {
			return {
				success: false,
				error: result.error || "Research stage failed",
				duration: Date.now() - startTime,
			};
		}

		// Merge pre-found quotes with newly discovered ones
		const allQuotes = [...preFoundQuotes, ...(result.data.quotes || [])];
		// Deduplicate by text prefix (O(n) with Set instead of O(n²) with findIndex)
		const seenPrefixes = new Set<string>();
		const uniqueQuotes = allQuotes.filter((q) => {
			const prefix = q.text.slice(0, 50);
			if (seenPrefixes.has(prefix)) return false;
			seenPrefixes.add(prefix);
			return true;
		});

		// Validate sources
		const rawSources = result.data.sources || [];
		console.log("   - Verifying URLs...");
		const urlsToVerify = rawSources.map((s) => s.url);
		const verification = await this.validator.verifyUrls(urlsToVerify);

		if (verification.stats.failed > 0) {
			console.log(`   - ⚠️  ${verification.stats.failed} URL(s) failed verification`);
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

		const data = {
			...result.data,
			sources: validatedSources,
			quotes: uniqueQuotes,
			bookPassages: result.data.bookPassages || [],
		};

		// Add to reference tracker
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

		console.log(
			`   - Total: ${data.quotes.length} quotes (${preFoundQuotes.length} from idea + ${data.quotes.length - preFoundQuotes.length} new)`,
		);
		console.log(`   - Found ${data.sources.length} credible sources`);

		return {
			success: true,
			data,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Run the research stage
	 * Uses MCP quote tools for intelligent, targeted searching
	 */
	async runResearch(topic: string): Promise<StageResult<ResearchOutput>> {
		const startTime = Date.now();
		console.log("📚 Stage 1: Research...");
		console.log("   - Claude will search quote database via MCP tools");

		// Build system prompt - giving Claude autonomy per best practices
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

Use parallel tool calls when searching multiple angles or authors simultaneously.
</guidance>`;

		// Run Claude with MCP quote tools + web tools
		const promptPath = join(this.promptsDir, "research.md");
		// MCP config is in project root (3 levels up from packages/orchestrator/src)
		const mcpConfigPath = join(__dirname, "../../..", ".mcp.json");
		const result = await this.runner.runJSON<ResearchOutput>(
			{
				prompt: promptPath,
				systemPrompt,
				model: this.getModelId(),
				// MCP config for quote database tools (absolute path)
				mcpConfig: mcpConfigPath,
				// MCP tools + standard tools
				allowedTools: [
					"mcp__quotes__search_quotes",
					"mcp__quotes__search_by_filter",
					"mcp__quotes__search_text",
					"mcp__quotes__get_inventory",
					"mcp__quotes__bulk_search",
					"WebSearch",
					"Read",
				],
				jsonSchema: getResearchJsonSchema(),
				fallbackModel: "sonnet",
				noSessionPersistence: true,
			},
			ResearchOutputSchema,
		);

		if (!(result.success && result.data)) {
			return {
				success: false,
				error: result.error || "Research stage failed",
				duration: Date.now() - startTime,
			};
		}

		// Validate sources (with fallback if Claude didn't return any)
		const rawSources = result.data.sources || [];

		// Step 4: Verify URLs actually exist (catches hallucinated URLs)
		console.log("   - Verifying URLs...");
		const urlsToVerify = rawSources.map((s) => s.url);
		const verification = await this.validator.verifyUrls(urlsToVerify);

		if (verification.stats.failed > 0) {
			console.log(`   - ⚠️  ${verification.stats.failed} URL(s) failed verification:`);
			for (const url of verification.stats.failedUrls) {
				const result = verification.results.find((r) => r.url === url);
				console.log(`     - ${url} (${result?.error || "unreachable"})`);
			}
		}

		// Filter out sources with invalid URLs
		const verifiedUrls = new Set<string>();
		for (const r of verification.results) {
			if (r.exists) verifiedUrls.add(r.url);
		}

		const validatedSources = rawSources
			.filter((source) => verifiedUrls.has(source.url))
			.filter((source) => {
				// Only reject blacklisted sources
				const validation = this.validator.validateSource(source.url);
				if (validation.credibility === "rejected") {
					console.log(`   - Rejected blacklisted source: ${source.url}`);
					return false;
				}
				return true;
			});
		// Trust LLM's credibility assessment for non-blacklisted sources

		// Use quotes and passages that Claude found via MCP tools
		const data = {
			...result.data,
			sources: validatedSources,
			quotes: result.data.quotes || [],
			bookPassages: result.data.bookPassages || [],
		};

		// Add sources to reference tracker
		for (const source of data.sources) {
			this.references.addReference({
				type: "web",
				title: source.title,
				url: source.url,
				accessDate: new Date().toISOString(),
			});
		}

		// Add quotes to reference tracker
		for (const quote of data.quotes) {
			this.references.addReference({
				type: "quote",
				title: quote.source || "Unknown",
				author: quote.author,
			});
		}

		console.log(`   - Found ${data.sources.length} credible sources`);
		console.log(`   - Retrieved ${data.quotes.length} quotes total`);

		return {
			success: true,
			data,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Run the fact-checking stage
	 */
	async runFactCheck(research: ResearchOutput): Promise<StageResult<FactCheckOutput>> {
		const systemPrompt = `Research data:\n${JSON.stringify(research, null, 2)}`;

		const result = await this.executeClaudeStage<FactCheckOutput>({
			name: "Stage 2: Quality Review",
			emoji: "🔍",
			promptFile: "fact-checker.md",
			systemPrompt,
			allowedTools: ["WebFetch"], // URL verification only
			schema: FactCheckOutputSchema,
			jsonSchema: getFactCheckJsonSchema(),
		});

		if (!(result.success && result.data)) {
			return result;
		}

		const data = {
			...result.data,
			verifiedClaims: result.data.verifiedClaims || [],
		};

		console.log(`   - Verified ${data.verifiedClaims.length} claims`);
		console.log(`   - Overall credibility: ${data.overallCredibility ?? 0}/10`);

		// Check quality gate
		if (data.overallCredibility < 7) {
			console.log("   ❌ Credibility below threshold (7.0)");
			return {
				success: false,
				data,
				error: `Credibility score ${data.overallCredibility} below threshold 7.0`,
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
		_factCheck: FactCheckOutput,
	): Promise<StageResult<DraftOutput>> {
		// Use research directly - fact-check has already validated
		const verifiedResearch = research;

		let systemPrompt = `## CONTEXT
You are writing for islam.se. The purpose is to promote Islamic thought intelligently to Swedish readers.

Key requirements:
- ONE clear thematic thread from start to finish
- Compelling subtitles that make readers want to continue
- Let quotes and passages earn their place
- Reference the Quran where relevant
- Let classical Islamic scholars shine
- Swedish/Western authors strengthen the Islamic stance
- Use markdown blockquotes and footnotes

Verified research:
${JSON.stringify(verifiedResearch, null, 2)}`;

		if (research.bookPassages && research.bookPassages.length > 0) {
			systemPrompt += `\n\n## BOOK PASSAGES AVAILABLE
${research.bookPassages.length} book passages available for integration.`;
		}

		const result = await this.executeClaudeStage<DraftOutput>({
			name: "Stage 3: Authoring",
			emoji: "✍️ ",
			promptFile: "author.md",
			systemPrompt,
			allowedTools: ["Read"],
			schema: DraftOutputSchema,
			jsonSchema: getDraftJsonSchema(),
		});

		if (!(result.success && result.data)) {
			return result;
		}

		const wordCount = result.data.wordCount ?? result.data.body.split(/\s+/).length;
		console.log(`   - Draft complete: ${wordCount} words`);

		return result;
	}

	/**
	 * Run the review stage
	 */
	async runReview(
		draft: DraftOutput,
		research: ResearchOutput,
	): Promise<StageResult<ReviewOutput>> {
		const systemPrompt = `Draft article:\n${draft.body}\n\nOriginal research summary:\n${research.summary}`;

		const result = await this.executeClaudeStage<ReviewOutput>({
			name: "Stage 4: Quality Review",
			emoji: "👁️ ",
			promptFile: "reviewer.md",
			systemPrompt,
			allowedTools: ["Read"],
			schema: ReviewOutputSchema,
			jsonSchema: getReviewJsonSchema(),
		});

		if (!(result.success && result.data)) {
			return result;
		}

		console.log(`   - Quality Score: ${result.data.finalScore ?? 0}/10`);
		console.log(`   - VERDICT: ${(result.data.verdict || "unknown").toUpperCase()}`);

		return result;
	}

	/**
	 * Publish article and update idea status
	 */
	private publishArticle(
		outputDir: string,
		topicSlug: string,
		draft: DraftOutput,
		qualityScore: number,
		ideaContext?: IdeaContext,
	): string | undefined {
		// Publish to web-accessible directory
		try {
			const publisher = new ArticlePublisher();
			publisher.publish(outputDir, topicSlug, {
				title: draft.title,
				wordCount: draft.wordCount,
				qualityScore,
				sourceIdea: ideaContext
					? { topic: ideaContext.topicSlug, ideaId: ideaContext.ideaId }
					: undefined,
			});
			console.log(`   📤 Published to data/articles/${topicSlug}.md`);
		} catch (publishError) {
			console.warn(`   ⚠️  Failed to publish article: ${publishError}`);
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
					articleSlug: topicSlug,
				});
				console.log(`   ✓ Marked idea #${ideaContext.ideaId} as done`);
			} catch (statusError) {
				console.warn(`   ⚠️  Failed to update idea status: ${statusError}`);
			}
		}

		return topicSlug;
	}

	/**
	 * Run the complete content production pipeline
	 * @param topic - The article topic
	 * @param ideaContext - Optional context linking to source idea for status tracking
	 */
	async produce(topic: string, ideaContext?: IdeaContext): Promise<ProductionResult> {
		const startTime = Date.now();
		const topicSlug = this.slugify(topic);
		const outputDir = this.ensureOutputDir(topicSlug);

		const result: ProductionResult = {
			success: false,
			topic,
			outputDir,
			stages: {},
		};

		// Stage 1: Research
		const researchResult = await this.runResearch(topic);
		result.stages.research = researchResult;
		if (!(researchResult.success && researchResult.data)) {
			result.totalDuration = Date.now() - startTime;
			return result;
		}
		this.saveOutput(outputDir, "research.json", researchResult.data);

		// Stage 2: Fact-Check
		const factCheckResult = await this.runFactCheck(researchResult.data);
		result.stages.factCheck = factCheckResult;
		if (!(factCheckResult.success && factCheckResult.data)) {
			result.totalDuration = Date.now() - startTime;
			return result;
		}
		this.saveOutput(outputDir, "fact-check.json", factCheckResult.data);

		// Stage 3: Authoring
		const authoringResult = await this.runAuthoring(researchResult.data, factCheckResult.data);
		result.stages.authoring = authoringResult;
		if (!(authoringResult.success && authoringResult.data)) {
			result.totalDuration = Date.now() - startTime;
			return result;
		}
		this.saveOutput(outputDir, "draft.md", authoringResult.data.body);
		this.saveOutput(outputDir, "draft-meta.json", authoringResult.data);

		// Stage 4: Review (with potential revision loop)
		let currentDraft = authoringResult.data;
		let revisionCount = 0;

		while (revisionCount <= this.options.maxRevisions) {
			const reviewResult = await this.runReview(currentDraft, researchResult.data);
			result.stages.review = reviewResult;

			if (!(reviewResult.success && reviewResult.data)) {
				result.totalDuration = Date.now() - startTime;
				return result;
			}

			this.saveOutput(outputDir, "review.json", reviewResult.data);

			// Check verdict
			if (reviewResult.data.verdict === "publish") {
				// Success! Always prefer polished version
				const finalText = reviewResult.data.revisedText ?? currentDraft.body;
				this.saveOutput(outputDir, "final.md", finalText);

				// Generate bibliography
				const bibliography = this.references.formatSwedishBibliography();
				this.saveOutput(outputDir, "references.md", `# Referenser\n\n${bibliography}`);

				// Save metadata
				this.saveOutput(outputDir, "metadata.json", {
					topic,
					producedAt: new Date().toISOString(),
					qualityScore: reviewResult.data.finalScore,
					wordCount: currentDraft.wordCount,
					revisionCount,
				});

				// Publish to web-accessible directory and update idea status
				result.publishedSlug = this.publishArticle(
					outputDir,
					topicSlug,
					currentDraft,
					reviewResult.data.finalScore,
					ideaContext,
				);

				result.success = true;
				result.finalArticle = finalText;
				result.bibliography = bibliography;
				break;
			}

			if (reviewResult.data.verdict === "reject") {
				console.log("   ❌ Article rejected - requires complete rewrite");
				break;
			}

			// Verdict is 'revise'
			if (revisionCount >= this.options.maxRevisions) {
				console.log(`   ⚠️  Max revisions (${this.options.maxRevisions}) reached`);
				break;
			}

			// Apply revisions if provided
			if (reviewResult.data.revisedText) {
				currentDraft = {
					...currentDraft,
					body: reviewResult.data.revisedText,
				};
				revisionCount++;
				console.log(`   📝 Revision ${revisionCount} applied, re-reviewing...`);
			} else {
				console.log("   ⚠️  Revisions requested but no revised text provided");
				break;
			}
		}

		result.totalDuration = Date.now() - startTime;

		if (result.success) {
			console.log("✅ Content production complete!");
		} else {
			console.log("❌ Content production failed");
		}

		return result;
	}

	/**
	 * Run research only (no writing)
	 */
	async researchOnly(topic: string): Promise<StageResult<ResearchOutput>> {
		const topicSlug = this.slugify(topic);
		const outputDir = this.ensureOutputDir(topicSlug);

		const result = await this.runResearch(topic);
		if (result.success && result.data) {
			this.saveOutput(outputDir, "research.json", result.data);
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

		const metadata = this.loadOutput<{
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

// Re-export utilities
export { ClaudeRunner } from "./claude-runner.js";
export { ReferenceTracker } from "./reference-tracker.js";
// Re-export services
export {
	type ArticleIndex,
	// Article publisher
	ArticlePublisher,
	// Book service
	type BookSearchOptions,
	type BookSearchResult,
	// Ideation service
	type EnrichedIdea,
	type EnrichedIdeationOutput,
	type EnrichedQuote,
	enrichIdeasWithQuotes,
	formatBooksForPrompt,
	// Quote service
	formatQuotesForPrompt,
	generateIdeas,
	hasBookContent,
	type Idea,
	type IdeaProductionStatus,
	type IdeationOutput,
	IdeationService,
	type IdeationServiceOptions,
	type PublishedArticle,
	passagesToResearchFormat,
	type QuoteSearchOptions,
	type QuoteSearchResult,
	quotesToResearchFormat,
	searchBooksComprehensive,
	searchQuotesComprehensive,
} from "./services/index.js";
export { SourceValidator } from "./source-validator.js";
