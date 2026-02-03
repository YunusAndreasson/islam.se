import type { EnrichedIdea, EnrichedIdeationOutput } from "@islam-se/orchestrator";

export type { EnrichedIdea, EnrichedIdeationOutput };

export type Screen = "topics" | "ideas" | "detail" | "pipeline";

export interface TopicSummary {
	slug: string;
	name: string;
	ideaCount: number;
	articleStatus: ArticleStatus;
	generatedAt: string;
}

export interface ArticleStatus {
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
}

export type StageStatus = "pending" | "running" | "complete" | "failed";

export interface StageInfo {
	status: StageStatus;
	duration?: number;
	summary?: string;
	error?: string;
}

export interface PipelineStatus {
	topic: string;
	ideaTitle: string;
	currentStage: "research" | "factCheck" | "authoring" | "review" | "complete" | "failed";
	stages: {
		research: StageInfo;
		factCheck: StageInfo;
		authoring: StageInfo;
		review: StageInfo;
	};
	logs: string[];
	startedAt: Date;
}

export interface AppState {
	screen: Screen;
	selectedTopic: string | null;
	selectedIdeaId: number | null;
	topics: TopicSummary[];
	currentIdeas: EnrichedIdea[] | null;
	currentIdeation: EnrichedIdeationOutput | null;
	pipelineStatus: PipelineStatus | null;
	error: string | null;
}
