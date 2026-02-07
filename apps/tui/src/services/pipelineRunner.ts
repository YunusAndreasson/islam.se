import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ArticlePublisher,
	ContentOrchestrator,
	type EnrichedIdea,
	IdeationService,
	type PreviewChunk,
} from "@islam-se/orchestrator";
import type { PipelineStatus } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findOutputDir(): string {
	const candidates = [
		// From dist/services/ or src/services/ - go up to apps/, then sibling
		join(__dirname, "../../../content-producer/output"),
		join(__dirname, "../../..", "content-producer/output"),
		join(process.cwd(), "apps/content-producer/output"),
		join(process.cwd(), "output"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	// Traverse up from __dirname
	let dir = __dirname;
	for (let i = 0; i < 10; i++) {
		const outputPath = join(dir, "apps/content-producer/output");
		if (existsSync(outputPath)) {
			return outputPath;
		}
		const siblingPath = join(dir, "content-producer/output");
		if (existsSync(siblingPath)) {
			return siblingPath;
		}
		dir = dirname(dir);
	}

	return join(process.cwd(), "apps/content-producer/output");
}

const ARTICLES_DIR = findOutputDir();

export interface StageEvent {
	stage: "research" | "factCheck" | "authoring" | "review";
	status: "running" | "complete" | "failed";
	duration?: number;
	summary?: string;
	error?: string;
}

export interface PreviewEvent {
	stage: PreviewChunk["stage"];
	type: PreviewChunk["type"];
	content: string;
}

export class TuiPipelineRunner extends EventEmitter {
	private orchestrator: ContentOrchestrator;
	private startTime: number = 0;
	private stageStartTime: number = 0;
	private lastPreviewTime: number = 0;

	constructor() {
		super();
		this.orchestrator = new ContentOrchestrator({
			outputDir: ARTICLES_DIR,
			model: "opus",
			qualityThreshold: 7.5,
			maxRevisions: 2,
			quiet: true, // Suppress console output to prevent TUI glitching
			onPreview: (chunk) => {
				// Throttle preview events to max 1 every 2 seconds to prevent glitching
				const now = Date.now();
				const preview = chunk as PreviewEvent;

				// Only emit if 2 seconds have passed since last update
				if (now - this.lastPreviewTime >= 2000) {
					this.lastPreviewTime = now;
					this.emit("preview", preview);
				}
				// Otherwise just drop the update - we'll catch the next one
			},
		});
	}

	async produce(idea: EnrichedIdea, topicSlug?: string): Promise<void> {
		const topic = idea.thesis;
		this.startTime = Date.now();

		const initialStatus: PipelineStatus = {
			topic,
			ideaTitle: idea.title,
			currentStage: "research",
			stages: {
				research: { status: "pending" },
				factCheck: { status: "pending" },
				authoring: { status: "pending" },
				review: { status: "pending" },
			},
			logs: [],
			previews: [],
			startedAt: new Date(),
		};

		this.emit("start", initialStatus);

		// Stage 1: Research (use idea-aware method with thesis, angle, keywords)
		this.emitStage("research", "running");
		this.stageStartTime = Date.now();

		// Research finds the best material autonomously - ideation quotes served their validation purpose
		const research = await this.orchestrator.runResearchFromIdea({
			thesis: idea.thesis,
			angle: idea.angle,
			keywords: idea.keywords,
		});
		const researchDuration = Date.now() - this.stageStartTime;

		if (!(research.success && research.data)) {
			this.emitStage("research", "failed", researchDuration, undefined, research.error);
			this.emit("complete", { success: false, error: research.error });
			return;
		}

		const researchSummary = `${research.data.sources.length} sources, ${research.data.quotes.length} quotes`;
		this.emitStage("research", "complete", researchDuration, researchSummary);
		this.emit("log", `Research complete: ${researchSummary}`);

		// Stage 2: Fact-check
		this.emitStage("factCheck", "running");
		this.stageStartTime = Date.now();

		const factCheck = await this.orchestrator.runFactCheck(research.data);
		const factCheckDuration = Date.now() - this.stageStartTime;

		if (!(factCheck.success && factCheck.data)) {
			const detail = factCheck.data?.summary
				? `${factCheck.error}\n${factCheck.data.summary}`
				: factCheck.error;
			this.emitStage("factCheck", "failed", factCheckDuration, undefined, detail);
			this.emit("complete", { success: false, error: detail });
			return;
		}

		const factCheckSummary = `Score: ${factCheck.data.overallCredibility}/10`;
		this.emitStage("factCheck", "complete", factCheckDuration, factCheckSummary);
		this.emit("log", `Fact-check passed: ${factCheckSummary}`);

		// Stage 3: Authoring
		this.emitStage("authoring", "running");
		this.stageStartTime = Date.now();

		const draft = await this.orchestrator.runAuthoring(research.data, factCheck.data);
		const authoringDuration = Date.now() - this.stageStartTime;

		if (!(draft.success && draft.data)) {
			this.emitStage("authoring", "failed", authoringDuration, undefined, draft.error);
			this.emit("complete", { success: false, error: draft.error });
			return;
		}

		const wordCount = draft.data.wordCount ?? draft.data.body.split(/\s+/).length;
		const authoringSummary = `${wordCount} words`;
		this.emitStage("authoring", "complete", authoringDuration, authoringSummary);
		this.emit("log", `Draft complete: ${authoringSummary}`);

		// Stage 4: Review (with revision loop)
		let currentDraft = draft.data;
		let revisionCount = 0;
		const maxRevisions = 2;
		let finalText: string | undefined;
		let finalScore = 0;

		while (revisionCount <= maxRevisions) {
			this.emitStage("review", "running");
			this.stageStartTime = Date.now();

			const review = await this.orchestrator.runReview(currentDraft, research.data);
			const reviewDuration = Date.now() - this.stageStartTime;

			if (!(review.success && review.data)) {
				this.emitStage("review", "failed", reviewDuration, undefined, review.error);
				this.emit("complete", { success: false, error: review.error });
				return;
			}

			const reviewSummary = `${review.data.finalScore}/10 - ${review.data.verdict}`;

			if (review.data.verdict === "publish") {
				finalText = review.data.revisedText ?? currentDraft.body;
				finalScore = review.data.finalScore;
				this.emitStage("review", "complete", reviewDuration, reviewSummary);
				this.emit("log", `Review complete: ${reviewSummary}`);
				break;
			}

			if (review.data.verdict === "reject") {
				this.emitStage("review", "failed", reviewDuration, reviewSummary, "Article rejected");
				this.emit("complete", { success: false, error: "Article rejected by reviewer" });
				return;
			}

			// Verdict is "revise"
			if (revisionCount >= maxRevisions) {
				this.emit("log", `Max revisions (${maxRevisions}) reached`);
				finalText = review.data.revisedText ?? currentDraft.body;
				finalScore = review.data.finalScore;
				this.emitStage("review", "complete", reviewDuration, `${reviewSummary} (max revisions)`);
				break;
			}

			if (review.data.revisedText) {
				currentDraft = { ...currentDraft, body: review.data.revisedText };
				revisionCount++;
				this.emit("log", `Revision ${revisionCount} applied, re-reviewing...`);
			} else {
				this.emit("log", "Revisions requested but no revised text provided");
				finalText = currentDraft.body;
				finalScore = review.data.finalScore;
				this.emitStage("review", "complete", reviewDuration, reviewSummary);
				break;
			}
		}

		if (!finalText) {
			this.emit("complete", { success: false, error: "Review loop ended without output" });
			return;
		}

		// Save final article and publish
		const articleSlug = this.slugify(topic);
		const outputDir = join(ARTICLES_DIR, articleSlug);

		// Ensure output directory exists and save final.md
		if (!existsSync(outputDir)) {
			mkdirSync(outputDir, { recursive: true });
		}
		writeFileSync(join(outputDir, "final.md"), finalText, "utf-8");
		this.emit("log", `Saved final.md to ${outputDir}`);

		// Publish to web-accessible directory
		try {
			const publisher = new ArticlePublisher();
			publisher.publish(outputDir, articleSlug, {
				title: draft.data.title,
				wordCount,
				qualityScore: finalScore,
				sourceIdea: topicSlug ? { topic: topicSlug, ideaId: idea.id } : undefined,
			});
			this.emit("log", `Published to data/articles/${articleSlug}.md`);
		} catch (publishError) {
			this.emit("log", `Warning: Failed to publish article: ${publishError}`);
		}

		// Update idea status if topicSlug provided
		if (topicSlug) {
			try {
				const ideationService = new IdeationService({ outputDir: ARTICLES_DIR, quiet: true });
				ideationService.updateIdeaStatus(topicSlug, idea.id, {
					status: "done",
					producedAt: new Date().toISOString(),
					articleSlug,
				});
				this.emit("log", `Marked idea #${idea.id} as done`);
			} catch (statusError) {
				this.emit("log", `Warning: Failed to update idea status: ${statusError}`);
			}
		}

		const totalDuration = Date.now() - this.startTime;
		this.emit("complete", {
			success: true,
			outputDir,
			duration: totalDuration,
			articleSlug,
			wordCount,
			qualityScore: finalScore,
		});
	}

	private slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[åä]/g, "a")
			.replace(/[ö]/g, "o")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 50);
	}

	private emitStage(
		stage: StageEvent["stage"],
		status: StageEvent["status"],
		duration?: number,
		summary?: string,
		error?: string,
	): void {
		const event: StageEvent = { stage, status, duration, summary, error };
		this.emit("stage", event);
	}
}
