/**
 * Ideation Service - Generates sophisticated article ideas with quote enrichment.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type FormattedQuoteWithId,
	findQuotesByFilter,
	findQuotesLocal,
	searchQuotesText,
} from "@islam-se/quotes";
import { ClaudeRunner } from "../claude-runner.js";
import {
	getIdeationCritiqueJsonSchema,
	getIdeationJsonSchema,
	IdeationCritiqueSchema,
	type IdeationCritiqueValidated,
	IdeationOutputSchema,
	type IdeationOutputValidated,
} from "../schemas.js";
import { createLogger, getModelId, saveOutput, slugify } from "../utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Core types
export interface Idea {
	id: number;
	title: string;
	thesis: string;
	angle: string;
	keywords: string[];
	score: number;
	difficulty: "standard" | "challenging" | "expert";
}

export interface EnrichedQuote {
	id: number;
	text: string;
	author: string;
	source?: string;
	relevanceScore: number;
}

export interface IdeaProductionStatus {
	status: "pending" | "in_progress" | "done" | "failed";
	producedAt?: string;
	articleSlug?: string;
	failedAt?: string;
	failureReason?: string;
}

export interface EnrichedIdea extends Idea {
	quotes: EnrichedQuote[];
	productionStatus?: IdeaProductionStatus;
}

export interface IdeationOutput {
	topic: string;
	ideas: Idea[];
	selectionGuidance: string;
}

export interface EnrichedIdeationOutput {
	topic: string;
	generatedAt: string;
	model: "opus" | "sonnet";
	batchVersion: number;
	previousVersions: string[];
	ideas: EnrichedIdea[];
	selectionGuidance: string;
}

export interface IdeationServiceOptions {
	outputDir: string;
	model?: "opus" | "sonnet";
	/** Suppress console output (for TUI mode) */
	quiet?: boolean;
}

export class IdeationService {
	private runner: ClaudeRunner;
	private logger: ReturnType<typeof createLogger>;
	private promptsDir: string;
	private options: Required<IdeationServiceOptions>;

	constructor(options: IdeationServiceOptions) {
		this.runner = new ClaudeRunner();
		// Adjusted path: services/ is one level deeper, so go up one more level
		this.promptsDir = join(__dirname, "../../prompts");
		this.options = {
			outputDir: options.outputDir,
			model: options.model ?? "opus",
			quiet: options.quiet ?? false,
		};
		this.logger = createLogger(this.options.quiet);
	}

	/**
	 * Ensure output directory exists
	 */
	private ensureOutputDir(topicSlug: string): string {
		const dir = join(this.options.outputDir, "ideas", topicSlug);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	/**
	 * Archive existing ideation.json before writing a new batch.
	 * Returns the new batch version number and list of previous version filenames.
	 */
	private archiveExistingBatch(dir: string): { batchVersion: number; previousVersions: string[] } {
		const ideationPath = join(dir, "ideation.json");
		if (!existsSync(ideationPath)) {
			return { batchVersion: 1, previousVersions: [] };
		}

		// Read existing batch to get its version info
		let existingVersion = 1;
		let existingPrevious: string[] = [];
		try {
			const existing: EnrichedIdeationOutput = JSON.parse(readFileSync(ideationPath, "utf-8"));
			existingVersion = existing.batchVersion ?? 1;
			existingPrevious = existing.previousVersions ?? [];
		} catch {
			// Malformed file, treat as v1
		}

		// Rename current to versioned filename
		const versionedName = `ideation.v${existingVersion}.json`;
		renameSync(ideationPath, join(dir, versionedName));
		this.logger.log(`   - Archived existing batch as ${versionedName}`);

		return {
			batchVersion: existingVersion + 1,
			previousVersions: [...existingPrevious, versionedName],
		};
	}

	/**
	 * Item 1: Search the quote DB for seed quotes to inspire ideation
	 */
	async getSeedQuotes(topic: string): Promise<FormattedQuoteWithId[]> {
		try {
			const [sv, ar, en] = await Promise.all([
				findQuotesLocal(topic, { limit: 4, language: "sv", diverse: true, minStandalone: 4 }),
				findQuotesLocal(topic, { limit: 4, language: "ar", diverse: true, minStandalone: 4 }),
				findQuotesLocal(topic, { limit: 3, language: "en", diverse: true, minStandalone: 4 }),
			]);
			return [...sv, ...ar, ...en];
		} catch {
			return [];
		}
	}

	/**
	 * Item 5: Load previously generated ideas to avoid repetition.
	 * Loads ALL batches (current + versioned) across all topics.
	 */
	loadPreviousIdeas(): string[] {
		const ideasDir = join(this.options.outputDir, "ideas");
		if (!existsSync(ideasDir)) return [];

		const summaries: string[] = [];
		try {
			const topicDirs = readdirSync(ideasDir, { withFileTypes: true }).filter((d) =>
				d.isDirectory(),
			);

			for (const dir of topicDirs) {
				const topicPath = join(ideasDir, dir.name);

				// Load all ideation files: ideation.json + ideation.v*.json
				const files = readdirSync(topicPath).filter(
					(f) => f === "ideation.json" || /^ideation\.v\d+\.json$/.test(f),
				);

				for (const file of files) {
					try {
						const data: EnrichedIdeationOutput = JSON.parse(
							readFileSync(join(topicPath, file), "utf-8"),
						);
						for (const idea of data.ideas) {
							summaries.push(`${idea.title}: ${idea.thesis}`);
						}
					} catch {
						// Skip malformed files
					}
				}
			}
		} catch {
			// Directory read failed
		}
		return summaries;
	}

	/**
	 * Build system prompt with seed quotes and previous ideas context
	 */
	private buildSystemPrompt(
		topic: string,
		seedQuotes: FormattedQuoteWithId[],
		previousIdeas: string[],
	): string {
		const parts: string[] = [`Topic: ${topic}`];

		if (seedQuotes.length > 0) {
			const quotesBlock = seedQuotes
				.map((q, i) => `${i + 1}. "${q.text}" — ${q.attribution}`)
				.join("\n");
			parts.push(
				`\n## SEED QUOTES FROM DATABASE\nThe following quotes are available in the database for this topic. Use them as inspiration.\n\n${quotesBlock}`,
			);
		}

		if (previousIdeas.length > 0) {
			// Limit to last 30 ideas to avoid overwhelming the prompt
			const recentIdeas = previousIdeas.slice(-30);
			const ideasBlock = recentIdeas.map((s) => `- ${s}`).join("\n");
			parts.push(`\n## PREVIOUSLY GENERATED IDEAS (avoid similar angles)\n${ideasBlock}`);
		}

		return parts.join("\n");
	}

	/**
	 * Generate sophisticated article ideas for a topic
	 */
	async generateIdeas(
		topic: string,
		context?: { seedQuotes?: FormattedQuoteWithId[]; previousIdeas?: string[] },
	): Promise<{
		success: boolean;
		data?: IdeationOutput;
		error?: string;
		duration?: number;
	}> {
		const startTime = Date.now();

		const promptPath = join(this.promptsDir, "ideator.md");
		const systemPrompt = this.buildSystemPrompt(
			topic,
			context?.seedQuotes ?? [],
			context?.previousIdeas ?? [],
		);

		const result = await this.runner.runJSON<IdeationOutputValidated>(
			{
				prompt: promptPath,
				systemPrompt,
				model: getModelId(this.options.model),
				jsonSchema: getIdeationJsonSchema(),
				effort: "high",
				maxBudgetUsd: 1.0,
				fallbackModel: "sonnet",
				noSessionPersistence: true,
				skipPermissions: true,
			},
			IdeationOutputSchema,
		);

		if (!(result.success && result.data)) {
			return {
				success: false,
				error: result.error || "Ideation failed",
				duration: Date.now() - startTime,
			};
		}

		return {
			success: true,
			data: result.data,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Convert a FormattedQuoteWithId to an EnrichedQuote
	 */
	private toEnrichedQuote(q: FormattedQuoteWithId): EnrichedQuote {
		const authorMatch = q.attribution.replace(/^—\s*/, "").split(/[,،]/);
		return {
			id: q.id,
			text: q.text,
			author: authorMatch[0]?.trim() || "Unknown",
			source: authorMatch[1]?.trim(),
			relevanceScore: q.score,
		};
	}

	/**
	 * Known authors in the quote DB (used to detect author keywords)
	 */
	private static readonly KNOWN_AUTHORS = new Set([
		"strindberg",
		"ellen key",
		"viktor rydberg",
		"lagerlöf",
		"selma lagerlöf",
		"swedenborg",
		"fredrika bremer",
		"hjalmar bergman",
		"victoria benedictsson",
		"heidenstam",
		"dan andersson",
		"hjalmar söderberg",
		"almqvist",
		"tegnér",
		"ibn al-jawzi",
		"ibn qayyim",
		"ibn taymiyyah",
		"al-ghazali",
		"al-nawawi",
		"ibn khaldun",
		"ibn hazm",
		"ibn battuta",
		"al-suyuti",
		"al-shafi'i",
		"al-mawardi",
	]);

	/**
	 * Known works in the quote DB (used to detect work-title keywords)
	 */
	private static readonly KNOWN_WORKS = new Set([
		"inferno",
		"röda rummet",
		"hemsöborna",
		"bannlyst",
		"lifslinjer",
		"barnets århundrade",
		"den siste atenaren",
		"hávamál",
		"völuspá",
		"edda",
		"talbis iblis",
		"muqaddimah",
		"ihya",
		"madarij",
		"njál",
	]);

	/**
	 * Classify keywords into authors, works, and thematic terms
	 */
	private classifyKeywords(keywords: string[]): {
		authors: string[];
		works: string[];
		themes: string[];
	} {
		const authors: string[] = [];
		const works: string[] = [];
		const themes: string[] = [];

		for (const kw of keywords) {
			const lower = kw.toLowerCase();
			if (IdeationService.KNOWN_AUTHORS.has(lower)) {
				authors.push(kw);
			} else if (IdeationService.KNOWN_WORKS.has(lower)) {
				works.push(kw);
			} else {
				themes.push(kw);
			}
		}
		return { authors, works, themes };
	}

	/**
	 * Score a text-search quote based on how well it matches the idea's keywords.
	 * Base score 0.75, boosted by matching work title or multiple keyword hits.
	 */
	private scoreTextResult(q: FormattedQuoteWithId, keywords: string[]): number {
		let score = 0.75;
		const source = q.attribution.toLowerCase();

		for (const kw of keywords) {
			const lower = kw.toLowerCase();
			// Boost if quote's work title matches a keyword
			if (source.includes(lower)) {
				score += 0.08;
			}
			// Boost if quote text contains the keyword
			if (q.text.toLowerCase().includes(lower)) {
				score += 0.04;
			}
		}

		return Math.min(score, 0.95);
	}

	/**
	 * Per-keyword search — hybrid semantic (thesis) + targeted text/filter (keywords).
	 * Detects author/work pairs and searches specifically for those combinations.
	 */
	private async searchQuotesForIdea(idea: Idea): Promise<EnrichedQuote[]> {
		const seen = new Set<number>();
		const candidates: EnrichedQuote[] = [];

		const addCandidate = (q: FormattedQuoteWithId, score?: number) => {
			if (seen.has(q.id)) return;
			seen.add(q.id);
			const enriched = this.toEnrichedQuote(q);
			if (score !== undefined) enriched.relevanceScore = score;
			candidates.push(enriched);
		};

		// 1. Semantic search on thesis (captures conceptual angle)
		try {
			const semanticResults = await findQuotesLocal(idea.thesis, {
				limit: 6,
				diverse: true,
				minStandalone: 3,
			});
			for (const q of semanticResults) {
				addCandidate(q); // Keeps real semantic score (typically 0.83-0.90)
			}
		} catch {
			// Semantic search failed
		}

		// 2. Classify keywords to search smarter
		const { authors, works, themes } = this.classifyKeywords(idea.keywords);

		// 3. Author+work targeted search — if we know both, get quotes from that specific work
		for (const author of authors) {
			try {
				const results = findQuotesByFilter({
					author,
					limit: 6,
					minStandalone: 3,
				});
				for (const q of results) {
					addCandidate(q, this.scoreTextResult(q, idea.keywords));
				}
			} catch {
				// Filter search failed
			}
		}

		// 4. Work-title text search (for works not tied to a specific author keyword)
		for (const work of works) {
			try {
				const results = searchQuotesText(work, { limit: 4, minStandalone: 3 });
				for (const q of results) {
					addCandidate(q, this.scoreTextResult(q, idea.keywords));
				}
			} catch {
				// Work search failed
			}
		}

		// 5. Thematic text search (non-author, non-work keywords)
		for (const theme of themes) {
			try {
				const results = searchQuotesText(theme, { limit: 3, minStandalone: 3 });
				for (const q of results) {
					addCandidate(q, this.scoreTextResult(q, idea.keywords));
				}
			} catch {
				// Theme search failed
			}
		}

		// Sort by relevance score descending
		return candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);
	}

	/**
	 * Item 2: Apply author diversity across all ideas' quotes.
	 * Caps any single author to max 2 ideas. Processes higher-scored ideas first.
	 */
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: diversity algorithm with nested scoring
	private applyAuthorDiversity(
		ideas: { idea: EnrichedIdea; candidates: EnrichedQuote[] }[],
		quotesPerIdea: number,
	): EnrichedIdea[] {
		// Process ideas by score descending so best ideas get first pick
		const sorted = [...ideas].sort((a, b) => (b.idea.score || 0) - (a.idea.score || 0));
		const authorUsage = new Map<string, number>();
		const result: EnrichedIdea[] = [];

		for (const { idea, candidates } of sorted) {
			const selectedQuotes: EnrichedQuote[] = [];

			// First pass: pick quotes from underused authors
			for (const candidate of candidates) {
				if (selectedQuotes.length >= quotesPerIdea) break;
				const usage = authorUsage.get(candidate.author) ?? 0;
				if (usage >= 2) continue;
				selectedQuotes.push(candidate);
			}

			// Fallback: if diversity filtering was too aggressive, fill remaining
			if (selectedQuotes.length < quotesPerIdea) {
				for (const candidate of candidates) {
					if (selectedQuotes.length >= quotesPerIdea) break;
					if (selectedQuotes.some((q) => q.id === candidate.id)) continue;
					selectedQuotes.push(candidate);
				}
			}

			// Update author usage counts
			for (const q of selectedQuotes) {
				authorUsage.set(q.author, (authorUsage.get(q.author) ?? 0) + 1);
			}

			result.push({ ...idea, quotes: selectedQuotes });
		}

		// Restore original order (by idea ID)
		return result.sort((a, b) => a.id - b.id);
	}

	/**
	 * Enrich ideas with quotes from the database.
	 * Uses per-keyword search (item 3) and author diversity (item 2).
	 */
	async enrichIdeasWithQuotes(ideas: Idea[], quotesPerIdea = 2): Promise<EnrichedIdea[]> {
		const ideasWithCandidates: { idea: EnrichedIdea; candidates: EnrichedQuote[] }[] = [];

		for (const idea of ideas) {
			try {
				const candidates = await this.searchQuotesForIdea(idea);
				ideasWithCandidates.push({
					idea: { ...idea, quotes: [] },
					candidates,
				});
			} catch {
				ideasWithCandidates.push({
					idea: { ...idea, quotes: [] },
					candidates: [],
				});
			}
		}

		return this.applyAuthorDiversity(ideasWithCandidates, quotesPerIdea);
	}

	/**
	 * Item 4: Self-critique pass — review batch and replace weak ideas
	 */
	async critiqueAndRefine(
		topic: string,
		ideas: Idea[],
		context?: { seedQuotes?: FormattedQuoteWithId[]; previousIdeas?: string[] },
	): Promise<Idea[]> {
		const promptPath = join(this.promptsDir, "ideation-critique.md");

		// Build system prompt with the ideas to critique
		const ideasBlock = ideas
			.map(
				(idea) =>
					`#${idea.id} [score:${idea.score}, ${idea.difficulty}] "${idea.title}"\n  Thesis: ${idea.thesis}\n  Angle: ${idea.angle}\n  Keywords: ${idea.keywords.join(", ")}`,
			)
			.join("\n\n");

		const systemParts: string[] = [`Topic: ${topic}`, `\n## IDEAS TO REVIEW\n${ideasBlock}`];

		if (context?.seedQuotes && context.seedQuotes.length > 0) {
			const quotesBlock = context.seedQuotes
				.map((q, i) => `${i + 1}. "${q.text}" — ${q.attribution}`)
				.join("\n");
			systemParts.push(`\n## AVAILABLE QUOTES\n${quotesBlock}`);
		}

		if (context?.previousIdeas && context.previousIdeas.length > 0) {
			const recentIdeas = context.previousIdeas.slice(-30);
			systemParts.push(
				`\n## PREVIOUSLY GENERATED IDEAS (replacements should also avoid these)\n${recentIdeas.map((s) => `- ${s}`).join("\n")}`,
			);
		}

		const result = await this.runner.runJSON<IdeationCritiqueValidated>(
			{
				prompt: promptPath,
				systemPrompt: systemParts.join("\n"),
				model: getModelId(this.options.model),
				jsonSchema: getIdeationCritiqueJsonSchema(),
				effort: "high",
				maxBudgetUsd: 0.5,
				fallbackModel: "sonnet",
				noSessionPersistence: true,
				skipPermissions: true,
			},
			IdeationCritiqueSchema,
		);

		if (!(result.success && result.data) || result.data.replacements.length === 0) {
			if (result.data) {
				this.logger.log(`   - Critique: ${result.data.analysis}`);
			}
			return ideas;
		}

		const critique = result.data;
		this.logger.log(`   - Critique: ${critique.analysis}`);
		this.logger.log(`   - Replacing ${critique.replacements.length} weak ideas`);

		// Apply replacements
		const refined = [...ideas];
		for (const replacement of critique.replacements) {
			const idx = refined.findIndex((i) => i.id === replacement.replacesId);
			if (idx !== -1) {
				refined[idx] = {
					id: replacement.replacesId,
					title: replacement.title,
					thesis: replacement.thesis,
					angle: replacement.angle,
					keywords: replacement.keywords,
					score: replacement.score,
					difficulty: replacement.difficulty,
				};
			}
		}

		return refined;
	}

	/**
	 * Run complete ideation flow with all 5 improvements:
	 * 1. Seed quotes from DB
	 * 2. Author-diverse enrichment
	 * 3. Per-keyword search
	 * 4. Self-critique pass
	 * 5. Cross-batch deduplication
	 */
	async ideate(
		topic: string,
		options: { skipQuotes?: boolean; skipCritique?: boolean } = {},
	): Promise<{
		success: boolean;
		data?: EnrichedIdeationOutput;
		outputDir?: string;
		error?: string;
		duration?: number;
	}> {
		const startTime = Date.now();
		const topicSlug = slugify(topic);
		const outputDir = this.ensureOutputDir(topicSlug);

		// Step 1: Load previous ideas for deduplication (item 5)
		const previousIdeas = this.loadPreviousIdeas();
		if (previousIdeas.length > 0) {
			this.logger.log(`   - Loaded ${previousIdeas.length} previous ideas for deduplication`);
		}

		// Step 2: Get seed quotes from DB (item 1)
		this.logger.log("   - Searching for seed quotes...");
		const seedQuotes = await this.getSeedQuotes(topic);
		if (seedQuotes.length > 0) {
			this.logger.log(`   - Found ${seedQuotes.length} seed quotes across languages`);
		}

		// Step 3: Generate ideas with context (items 1, 5)
		this.logger.log("   - Generating sophisticated ideas...");
		const ideaResult = await this.generateIdeas(topic, { seedQuotes, previousIdeas });

		if (!(ideaResult.success && ideaResult.data)) {
			return {
				success: false,
				error: ideaResult.error || "Idea generation failed",
				duration: Date.now() - startTime,
			};
		}

		let ideas = ideaResult.data.ideas;
		this.logger.log(`   - Generated ${ideas.length} ideas`);

		// Step 4: Self-critique and refine (item 4)
		if (!options.skipCritique) {
			this.logger.log("   - Running self-critique...");
			ideas = await this.critiqueAndRefine(topic, ideas, { seedQuotes, previousIdeas });
		}

		// Step 5: Enrich with quotes using per-keyword search + author diversity (items 2, 3)
		let enrichedIdeas: EnrichedIdea[];

		if (options.skipQuotes) {
			enrichedIdeas = ideas.map((idea) => ({ ...idea, quotes: [] }));
		} else {
			this.logger.log("   - Enriching with quotes (per-keyword + author diversity)...");
			enrichedIdeas = await this.enrichIdeasWithQuotes(ideas);
			const totalQuotes = enrichedIdeas.reduce((sum, idea) => sum + idea.quotes.length, 0);
			this.logger.log(`   - Attached ${totalQuotes} quotes to ${enrichedIdeas.length} ideas`);
		}

		// Step 6: Archive existing batch (if any) and build new output
		const { batchVersion, previousVersions } = this.archiveExistingBatch(outputDir);

		const output: EnrichedIdeationOutput = {
			topic: ideaResult.data.topic,
			generatedAt: new Date().toISOString(),
			model: this.options.model,
			batchVersion,
			previousVersions,
			ideas: enrichedIdeas,
			selectionGuidance: ideaResult.data.selectionGuidance,
		};

		saveOutput(outputDir, "ideation.json", output);

		return {
			success: true,
			data: output,
			outputDir,
			duration: Date.now() - startTime,
		};
	}

	/**
	 * Save a selected idea to file
	 */
	saveSelectedIdea(topicSlug: string, idea: EnrichedIdea): string {
		const dir = join(this.options.outputDir, "ideas", topicSlug);
		const filepath = join(dir, "selected-idea.json");
		writeFileSync(
			filepath,
			JSON.stringify(
				{
					selectedAt: new Date().toISOString(),
					idea,
				},
				null,
				2,
			),
			"utf-8",
		);
		return filepath;
	}

	/**
	 * Update the production status of an idea in ideation.json
	 */
	updateIdeaStatus(topicSlug: string, ideaId: number, status: IdeaProductionStatus): boolean {
		const ideationPath = join(this.options.outputDir, "ideas", topicSlug, "ideation.json");

		if (!existsSync(ideationPath)) {
			this.logger.warn(`Ideation file not found: ${ideationPath}`);
			return false;
		}

		try {
			const data: EnrichedIdeationOutput = JSON.parse(readFileSync(ideationPath, "utf-8"));
			const idea = data.ideas.find((i) => i.id === ideaId);

			if (!idea) {
				this.logger.warn(`Idea ${ideaId} not found in ${topicSlug}`);
				return false;
			}

			idea.productionStatus = status;
			writeFileSync(ideationPath, JSON.stringify(data, null, 2), "utf-8");
			return true;
		} catch (error) {
			this.logger.warn(`Failed to update idea status: ${error}`);
			return false;
		}
	}

	/**
	 * Get the output directory path for a topic
	 */
	getOutputDir(topic: string): string {
		const topicSlug = slugify(topic);
		return join(this.options.outputDir, "ideas", topicSlug);
	}

	/**
	 * Get a topic slug from text
	 */
	getSlug(text: string): string {
		return slugify(text);
	}
}
