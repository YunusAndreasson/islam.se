import { EventEmitter } from "node:events";
import {
	ContentOrchestrator,
	type EnrichedIdea,
	type IdeaBrief,
	type PreviewChunk,
	type StageProgress,
} from "@islam-se/orchestrator";
import { findOutputDir } from "../utils/paths.js";

const ARTICLES_DIR = findOutputDir();

export type { StageProgress as StageEvent };

export interface PreviewEvent {
	stage: PreviewChunk["stage"];
	type: PreviewChunk["type"];
	content: string;
}

export class TuiPipelineRunner extends EventEmitter {
	private lastPreviewTime: number = 0;

	async produce(
		idea: EnrichedIdea,
		topicSlug?: string,
		options?: { resume?: boolean },
	): Promise<void> {
		// Build IdeaBrief from enriched idea
		const ideaBrief: IdeaBrief = {
			title: idea.title,
			thesis: idea.thesis,
			angle: idea.angle,
			keywords: idea.keywords,
			difficulty: idea.difficulty,
			seedQuotes: idea.quotes
				?.filter((q) => q.relevanceScore >= 0.6)
				.map((q) => ({ text: q.text, author: q.author, source: q.source })),
		};

		const orchestrator = new ContentOrchestrator({
			outputDir: ARTICLES_DIR,
			model: "opus",
			qualityThreshold: 7.5,
			maxRevisions: 2,
			quiet: true,
			onPreview: (chunk) => {
				// Throttle preview events to max 1 every 2 seconds
				const now = Date.now();
				if (now - this.lastPreviewTime >= 2000) {
					this.lastPreviewTime = now;
					this.emit("preview", {
						stage: chunk.stage,
						type: chunk.type,
						content: chunk.content,
					} satisfies PreviewEvent);
				}
			},
			onStageChange: (progress: StageProgress) => {
				this.emit("stage", progress);
				if (progress.status === "complete" && progress.summary) {
					this.emit("log", `${progress.stage} complete: ${progress.summary}`);
				} else if (progress.status === "failed" && progress.error) {
					this.emit("log", `${progress.stage} failed: ${progress.error}`);
				}
			},
		});

		const ideaContext = topicSlug ? { topicSlug, ideaId: idea.id } : undefined;
		const result = await orchestrator.produce(
			`${idea.title}: ${idea.thesis}`,
			ideaContext,
			ideaBrief,
			{ resume: options?.resume },
		);

		if (result.success) {
			const reviewData = result.stages.review?.data;
			const draftData = result.stages.authoring?.data;
			const draftWordCount = draftData
				? (draftData.wordCount ?? draftData.body.split(/\s+/).length)
				: undefined;
			this.emit("complete", {
				success: true,
				outputDir: result.outputDir,
				duration: result.totalDuration,
				articleSlug: result.publishedSlug,
				wordCount: draftWordCount,
				qualityScore: reviewData?.finalScore,
			});
		} else {
			// Find the first failed stage for error reporting
			const failedStage = (["research", "factCheck", "authoring", "review"] as const).find(
				(s) => result.stages[s] && !result.stages[s]?.success,
			);
			const error = failedStage ? result.stages[failedStage]?.error : "Pipeline failed";
			this.emit("complete", { success: false, error });
		}
	}
}
