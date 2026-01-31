import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeRunner, type ClaudeRunOptions } from "./claude-runner.js";
import {
	formatQuotesForPrompt,
	quotesToResearchFormat,
	type QuoteSearchResult,
	searchQuotesComprehensive,
} from "./quote-service.js";
import { ReferenceTracker } from "./reference-tracker.js";
import { SourceValidator } from "./source-validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface OrchestratorOptions {
	/** Output directory for generated content */
	outputDir: string;
	/** Model to use (default: opus) */
	model?: "opus" | "sonnet";
	/** Minimum quality score to publish (default: 8.0) */
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
	sources: Array<{
		id: string;
		url: string;
		title: string;
		author?: string;
		publication?: string;
		date?: string;
		credibility: "high" | "medium" | "low";
		credibilityReason?: string;
		keyFindings: string[];
	}>;
	quotes: Array<{
		id: string;
		text: string;
		author: string;
		source?: string;
		language: "swedish" | "arabic" | "norse" | "english";
		relevance: string;
		standaloneScore?: number;
	}>;
	perspectives: Array<{
		name: string;
		description: string;
		supportingSources?: string[];
	}>;
	facts: Array<{
		claim: string;
		sources: string[];
		confidence?: "high" | "medium" | "low";
	}>;
	suggestedAngles?: string[];
	warnings?: string[];
}

export interface FactCheckOutput {
	overallCredibility: number;
	verdict: "pass" | "revise" | "reject";
	summary: string;
	verifiedClaims: Array<{
		claim: string;
		status: "verified";
		originalSource?: string;
		confirmingSources?: string[];
		notes?: string;
	}>;
	partiallyVerified?: Array<{
		claim: string;
		status: "partial";
		verified: string;
		unverified: string;
		recommendation?: string;
	}>;
	unverifiedClaims?: Array<{
		claim: string;
		status: "unverified";
		reason: string;
		severity: "high" | "medium" | "low";
		recommendation?: string;
	}>;
	flaggedIssues?: Array<{
		type: string;
		description: string;
		severity: "high" | "medium" | "low";
		affectedSources?: string[];
		recommendation?: string;
	}>;
	sourceAssessment: {
		totalSources: number;
		highCredibility: number;
		mediumCredibility?: number;
		lowCredibility?: number;
		rejected?: number;
	};
	recommendations?: string[];
}

export interface DraftOutput {
	title: string;
	subtitle?: string;
	body: string;
	wordCount: number;
	quotesUsed: Array<{
		quoteId: string;
		position: string;
		integrationNote?: string;
	}>;
	sourcesReferenced?: string[];
	selfCritique?: {
		strengths?: string[];
		concerns?: string[];
		aiPatternCheck?: string;
	};
}

export interface ReviewOutput {
	scores: {
		swedish: {
			score: number;
			issues?: Array<{ location: string; issue: string; suggestion: string }>;
		};
		islamic: { score: number; issues?: unknown[] };
		literary: { score: number; issues?: unknown[] };
		humanAuthenticity: { score: number; aiPatternsFound?: string[]; humanMarkersFound?: string[] };
	};
	finalScore: number;
	verdict: "publish" | "revise" | "reject";
	summary: string;
	strengths?: string[];
	criticalIssues?: Array<{
		severity: "high" | "medium" | "low";
		category: string;
		description: string;
		location?: string;
		fix?: string;
	}>;
	minorIssues?: Array<{
		category: string;
		description: string;
		suggestion?: string;
	}>;
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
			qualityThreshold: options.qualityThreshold ?? 8.0,
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
			return JSON.parse(content);
		}
		return content as unknown as T;
	}

	/**
	 * Run the research stage
	 */
	async runResearch(topic: string): Promise<StageResult<ResearchOutput>> {
		const startTime = Date.now();
		console.log("📚 Stage 1: Research...");

		// Step 1: Pre-fetch quotes from the database (no API required)
		console.log("   - Searching quote database...");
		let quoteResults: QuoteSearchResult | null = null;
		try {
			quoteResults = await searchQuotesComprehensive({
				topic,
				includeArabic: this.options.includeArabic,
				semanticLimit: 15,
				pairedLimit: 5,
				minStandalone: 4,
			});
			console.log(
				`   - Found ${quoteResults.semanticMatches.length} semantic matches, ${quoteResults.pairedQuotes.swedish.length + quoteResults.pairedQuotes.arabic.length} paired quotes`,
			);
		} catch (error) {
			console.log(`   - Quote search failed: ${error}`);
			// Continue without quotes - web research can still proceed
		}

		// Step 2: Build prompt with pre-fetched quotes
		const promptPath = join(this.promptsDir, "research.md");
		let systemPrompt = `Topic: ${topic}\nTarget word count: ${this.options.targetWordCount}\nInclude Arabic quotes: ${this.options.includeArabic}`;

		if (quoteResults) {
			systemPrompt += `\n\n# PRE-FETCHED QUOTES FROM DATABASE\n\n${formatQuotesForPrompt(quoteResults)}\n\nIMPORTANT: Use the quotes above. They have been pre-selected for relevance to your topic. Do NOT search for additional quotes - these are from your database.`;
		}

		// Step 3: Run Claude for web research (quotes already provided)
		const result = await this.runner.runJSON<ResearchOutput>({
			prompt: promptPath,
			systemPrompt,
			model: this.getModelId(),
			allowedTools: ["WebSearch", "Read"],
		});

		if (!result.success || !result.data) {
			return {
				success: false,
				error: result.error || "Research stage failed",
				duration: Date.now() - startTime,
			};
		}

		// Validate sources
		const validatedSources = result.data.sources.map((source) => {
			const validation = this.validator.validateSource(source.url);
			return {
				...source,
				credibility:
					validation.credibility === "rejected" ? ("low" as const) : validation.credibility,
			};
		});

		// Merge pre-fetched quotes with any Claude found
		const preSearchedQuotes = quoteResults ? quotesToResearchFormat(quoteResults) : [];
		const allQuotes = [
			...preSearchedQuotes,
			...result.data.quotes.filter(
				(q) => !preSearchedQuotes.some((pq) => pq.id === q.id || pq.text === q.text),
			),
		];

		const data = {
			...result.data,
			sources: validatedSources,
			quotes: allQuotes,
		};

		// Add sources to reference tracker
		for (const source of data.sources) {
			this.references.addReference({
				type: source.publication ? "media" : "web",
				title: source.title,
				url: source.url,
				author: source.author,
				publication: source.publication,
				date: source.date,
				credibility: source.credibility,
				accessDate: new Date().toISOString(),
			});
		}

		// Add quotes to reference tracker
		for (const quote of data.quotes) {
			this.references.addReference({
				type: "quote",
				title: quote.source || "Unknown",
				author: quote.author,
				credibility: "high",
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
		const startTime = Date.now();
		console.log("🔍 Stage 2: Fact-Checking...");

		const promptPath = join(this.promptsDir, "fact-checker.md");
		const systemPrompt = `Research data:\n${JSON.stringify(research, null, 2)}`;

		const result = await this.runner.runJSON<FactCheckOutput>({
			prompt: promptPath,
			systemPrompt,
			model: this.getModelId(),
			allowedTools: ["WebSearch", "Read"],
		});

		if (!result.success || !result.data) {
			return {
				success: false,
				error: result.error || "Fact-check stage failed",
				duration: Date.now() - startTime,
			};
		}

		const data = result.data;

		console.log(`   - Verified ${data.verifiedClaims.length} claims`);
		console.log(`   - Overall credibility: ${data.overallCredibility}/10`);

		// Check quality gate
		if (data.overallCredibility < 7) {
			console.log("   ❌ Credibility below threshold (7.0)");
			return {
				success: false,
				data,
				error: `Credibility score ${data.overallCredibility} below threshold 7.0`,
				duration: Date.now() - startTime,
			};
		}

		return {
			success: true,
			data,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Run the authoring stage
	 */
	async runAuthoring(
		research: ResearchOutput,
		factCheck: FactCheckOutput,
	): Promise<StageResult<DraftOutput>> {
		const startTime = Date.now();
		console.log("✍️  Stage 3: Authoring...");

		const promptPath = join(this.promptsDir, "author.md");

		// Prepare verified research
		const verifiedResearch = {
			...research,
			// Filter to verified facts only
			facts: research.facts.filter((fact) =>
				factCheck.verifiedClaims.some((vc) => vc.claim === fact.claim),
			),
		};

		const systemPrompt = `Verified research:\n${JSON.stringify(verifiedResearch, null, 2)}\n\nTarget word count: ${this.options.targetWordCount}`;

		const result = await this.runner.runJSON<DraftOutput>({
			prompt: promptPath,
			systemPrompt,
			model: this.getModelId(),
			allowedTools: ["Read"], // No web access during authoring
		});

		if (!result.success || !result.data) {
			return {
				success: false,
				error: result.error || "Authoring stage failed",
				duration: Date.now() - startTime,
			};
		}

		const data = result.data;

		console.log(`   - Draft complete: ${data.wordCount} words`);
		console.log(`   - Quotes integrated: ${data.quotesUsed.length}`);

		// Mark used quotes as used in reference tracker
		for (const quote of data.quotesUsed) {
			this.references.markAsUsed(quote.quoteId);
		}

		return {
			success: true,
			data,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Run the review stage
	 */
	async runReview(
		draft: DraftOutput,
		research: ResearchOutput,
	): Promise<StageResult<ReviewOutput>> {
		const startTime = Date.now();
		console.log("👁️  Stage 4: Quality Review...");

		const promptPath = join(this.promptsDir, "reviewer.md");
		const systemPrompt = `Draft article:\n${draft.body}\n\nQuotes used:\n${JSON.stringify(draft.quotesUsed, null, 2)}\n\nOriginal research summary:\n${research.summary}`;

		const result = await this.runner.runJSON<ReviewOutput>({
			prompt: promptPath,
			systemPrompt,
			model: this.getModelId(),
			allowedTools: ["Read"], // No web access during review
		});

		if (!result.success || !result.data) {
			return {
				success: false,
				error: result.error || "Review stage failed",
				duration: Date.now() - startTime,
			};
		}

		const data = result.data;

		console.log(`   - Quality Score: ${data.finalScore}/10`);
		console.log(`   - VERDICT: ${data.verdict.toUpperCase()}`);

		return {
			success: true,
			data,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Run the complete content production pipeline
	 */
	async produce(topic: string): Promise<ProductionResult> {
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
		if (!researchResult.success || !researchResult.data) {
			result.totalDuration = Date.now() - startTime;
			return result;
		}
		this.saveOutput(outputDir, "research.json", researchResult.data);

		// Stage 2: Fact-Check
		const factCheckResult = await this.runFactCheck(researchResult.data);
		result.stages.factCheck = factCheckResult;
		if (!factCheckResult.success || !factCheckResult.data) {
			result.totalDuration = Date.now() - startTime;
			return result;
		}
		this.saveOutput(outputDir, "fact-check.json", factCheckResult.data);

		// Stage 3: Authoring
		const authoringResult = await this.runAuthoring(researchResult.data, factCheckResult.data);
		result.stages.authoring = authoringResult;
		if (!authoringResult.success || !authoringResult.data) {
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

			if (!reviewResult.success || !reviewResult.data) {
				result.totalDuration = Date.now() - startTime;
				return result;
			}

			this.saveOutput(outputDir, "review.json", reviewResult.data);

			// Check verdict
			if (reviewResult.data.verdict === "publish") {
				// Success!
				const finalText = reviewResult.data.revisedText || currentDraft.body;
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
					quotesUsed: currentDraft.quotesUsed.length,
					revisionCount,
				});

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
export {
	formatQuotesForPrompt,
	quotesToResearchFormat,
	searchQuotesComprehensive,
} from "./quote-service.js";
export { ReferenceTracker } from "./reference-tracker.js";
export { SourceValidator } from "./source-validator.js";
