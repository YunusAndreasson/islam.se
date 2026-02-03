/**
 * Ideation Service - Generates sophisticated article ideas with quote enrichment.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type FormattedQuoteWithId, findQuotesLocal } from "@islam-se/quotes";
import { ClaudeRunner, type ClaudeRunOptions } from "../claude-runner.js";
import {
	getIdeationJsonSchema,
	IdeationOutputSchema,
	type IdeationOutputValidated,
} from "../schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Core types
export interface Idea {
	id: number;
	title: string;
	thesis: string;
	angle: string;
	keywords: string[];
}

export interface EnrichedQuote {
	id: number;
	text: string;
	author: string;
	source?: string;
	relevanceScore: number;
}

export interface EnrichedIdea extends Idea {
	quotes: EnrichedQuote[];
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
	ideas: EnrichedIdea[];
	selectionGuidance: string;
}

export interface IdeationServiceOptions {
	outputDir: string;
	model?: "opus" | "sonnet";
}

export class IdeationService {
	private runner: ClaudeRunner;
	private promptsDir: string;
	private options: Required<IdeationServiceOptions>;

	constructor(options: IdeationServiceOptions) {
		this.runner = new ClaudeRunner();
		// Adjusted path: services/ is one level deeper, so go up one more level
		this.promptsDir = join(__dirname, "../../prompts");
		this.options = {
			outputDir: options.outputDir,
			model: options.model ?? "opus",
		};
	}

	/**
	 * Generate a URL-safe slug from text
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
		const dir = join(this.options.outputDir, "ideas", topicSlug);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		return dir;
	}

	/**
	 * Save output to file
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
	 * Load output from file
	 */
	loadOutput<T>(dir: string, filename: string): T | null {
		const filepath = join(dir, filename);
		if (!existsSync(filepath)) {
			return null;
		}
		const content = readFileSync(filepath, "utf-8");
		return JSON.parse(content);
	}

	/**
	 * Generate sophisticated article ideas for a topic
	 */
	async generateIdeas(topic: string): Promise<{
		success: boolean;
		data?: IdeationOutput;
		error?: string;
		duration?: number;
	}> {
		const startTime = Date.now();

		const promptPath = join(this.promptsDir, "ideator.md");
		const systemPrompt = `Topic: ${topic}`;

		const result = await this.runner.runJSON<IdeationOutputValidated>(
			{
				prompt: promptPath,
				systemPrompt,
				model: this.getModelId(),
				allowedTools: [],
				jsonSchema: getIdeationJsonSchema(),
				maxBudgetUsd: 1.0,
				fallbackModel: "sonnet",
				noSessionPersistence: true,
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
	 * Enrich ideas with quotes from the database
	 */
	async enrichIdeasWithQuotes(ideas: Idea[], quotesPerIdea = 2): Promise<EnrichedIdea[]> {
		const enrichedIdeas: EnrichedIdea[] = [];

		for (const idea of ideas) {
			// Use thesis + keywords for better semantic matching
			// The thesis captures the core argument; keywords target specific terms
			// Avoid using the full title which contains Swedish filler words
			const searchQuery = `${idea.thesis} ${idea.keywords.join(" ")}`;

			try {
				// Search for relevant quotes with higher threshold
				const quotes = await findQuotesLocal(searchQuery, {
					limit: quotesPerIdea * 3, // Fetch extra to filter by quality
					minStandalone: 3,
					diverse: true,
				});

				// Filter for higher relevance and select top quotes
				const enrichedQuotes: EnrichedQuote[] = quotes
					.filter((q: FormattedQuoteWithId) => q.score >= 0.85) // Higher threshold
					.slice(0, quotesPerIdea)
					.map((q: FormattedQuoteWithId) => {
						// Extract author from attribution
						const authorMatch = q.attribution.replace(/^—\s*/, "").split(/[,،]/);
						const author = authorMatch[0]?.trim() || "Unknown";
						const source = authorMatch[1]?.trim();

						return {
							id: q.id,
							text: q.text,
							author,
							source,
							relevanceScore: q.score,
						};
					});

				// If high-threshold filtering returned too few, fall back to top results
				if (enrichedQuotes.length < quotesPerIdea) {
					const fallbackQuotes = quotes
						.slice(0, quotesPerIdea)
						.filter((q: FormattedQuoteWithId) => !enrichedQuotes.some((eq) => eq.id === q.id))
						.map((q: FormattedQuoteWithId) => {
							const authorMatch = q.attribution.replace(/^—\s*/, "").split(/[,،]/);
							return {
								id: q.id,
								text: q.text,
								author: authorMatch[0]?.trim() || "Unknown",
								source: authorMatch[1]?.trim(),
								relevanceScore: q.score,
							};
						});
					enrichedQuotes.push(...fallbackQuotes.slice(0, quotesPerIdea - enrichedQuotes.length));
				}

				enrichedIdeas.push({
					...idea,
					quotes: enrichedQuotes,
				});
			} catch {
				// If quote search fails, add idea without quotes
				enrichedIdeas.push({
					...idea,
					quotes: [],
				});
			}
		}

		return enrichedIdeas;
	}

	/**
	 * Run complete ideation flow: generate ideas and enrich with quotes
	 */
	async ideate(
		topic: string,
		options: { skipQuotes?: boolean } = {},
	): Promise<{
		success: boolean;
		data?: EnrichedIdeationOutput;
		outputDir?: string;
		error?: string;
		duration?: number;
	}> {
		const startTime = Date.now();
		const topicSlug = this.slugify(topic);
		const outputDir = this.ensureOutputDir(topicSlug);

		// Step 1: Generate ideas
		console.log("   - Generating sophisticated ideas...");
		const ideaResult = await this.generateIdeas(topic);

		if (!(ideaResult.success && ideaResult.data)) {
			return {
				success: false,
				error: ideaResult.error || "Idea generation failed",
				duration: Date.now() - startTime,
			};
		}

		const rawIdeas = ideaResult.data;
		console.log(`   - Generated ${rawIdeas.ideas.length} ideas`);

		// Step 2: Enrich with quotes (unless skipped)
		let enrichedIdeas: EnrichedIdea[];

		if (options.skipQuotes) {
			// Add empty quotes array to each idea
			enrichedIdeas = rawIdeas.ideas.map((idea) => ({
				...idea,
				quotes: [],
			}));
		} else {
			console.log("   - Enriching with quotes...");
			enrichedIdeas = await this.enrichIdeasWithQuotes(rawIdeas.ideas);
			const totalQuotes = enrichedIdeas.reduce((sum, idea) => sum + idea.quotes.length, 0);
			console.log(`   - Attached ${totalQuotes} quotes to ${enrichedIdeas.length} ideas`);
		}

		// Step 3: Build output
		const output: EnrichedIdeationOutput = {
			topic: rawIdeas.topic,
			generatedAt: new Date().toISOString(),
			model: this.options.model,
			ideas: enrichedIdeas,
			selectionGuidance: rawIdeas.selectionGuidance,
		};

		// Step 4: Save output
		this.saveOutput(outputDir, "ideation.json", output);

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
	 * Get the output directory path for a topic
	 */
	getOutputDir(topic: string): string {
		const topicSlug = this.slugify(topic);
		return join(this.options.outputDir, "ideas", topicSlug);
	}
}

// Export standalone functions for simpler usage
export async function generateIdeas(
	topic: string,
	model: "opus" | "sonnet" = "opus",
): Promise<{
	success: boolean;
	data?: IdeationOutput;
	error?: string;
}> {
	const service = new IdeationService({ outputDir: "./output", model });
	return service.generateIdeas(topic);
}

export async function enrichIdeasWithQuotes(
	ideas: Idea[],
	quotesPerIdea = 2,
): Promise<EnrichedIdea[]> {
	const service = new IdeationService({ outputDir: "./output" });
	return service.enrichIdeasWithQuotes(ideas, quotesPerIdea);
}
