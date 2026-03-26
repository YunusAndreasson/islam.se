import type {
	EnrichedIdea,
	EnrichedIdeationOutput,
	PublishedArticle,
} from "@islam-se/orchestrator";

export type { EnrichedIdea, EnrichedIdeationOutput, PublishedArticle };

export type Screen =
	| "home"
	| "topics"
	| "ideas"
	| "detail"
	| "pipeline"
	| "batchPipeline"
	| "articleCategories"
	| "articleList"
	| "articleRead";

export interface CategorySummary {
	name: string;
	displayName: string;
	count: number;
}

export interface TopicSummary {
	slug: string;
	name: string;
	ideaCount: number;
	doneCount: number;
	batchVersion: number;
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

export interface PreviewSnippet {
	stage:
		| "research"
		| "factCheck"
		| "authoring"
		| "review"
		| "polish"
		| "deepen"
		| "ground"
		| "language"
		| "swedishVoice";
	type: "text" | "tool_use" | "tool_result";
	content: string;
	timestamp: number;
}

export interface PipelineStatus {
	topic: string;
	ideaTitle: string;
	currentStage:
		| "research"
		| "factCheck"
		| "authoring"
		| "review"
		| "polish"
		| "deepen"
		| "ground"
		| "language"
		| "swedishVoice"
		| "complete"
		| "failed";
	stages: {
		research: StageInfo;
		factCheck: StageInfo;
		authoring: StageInfo;
		review: StageInfo;
		polish: StageInfo;
		deepen: StageInfo;
		ground: StageInfo;
		language: StageInfo;
		swedishVoice: StageInfo;
	};
	logs: string[];
	previews: PreviewSnippet[];
	startedAt: Date;
}

export interface QueuedIdea {
	idea: EnrichedIdea;
	topicSlug: string;
	topicName: string;
}

export interface BatchItemResult {
	ideaId: number;
	ideaTitle: string;
	success: boolean;
	error?: string;
	articleSlug?: string;
	wordCount?: number;
	qualityScore?: number;
	duration: number;
}

export interface BatchStatus {
	items: QueuedIdea[];
	currentIndex: number;
	results: BatchItemResult[];
	startedAt: Date;
	currentPipelineStatus: PipelineStatus | null;
}

export interface AppState {
	screen: Screen;
	selectedTopic: string | null;
	selectedIdeaId: number | null;
	topics: TopicSummary[];
	currentIdeas: EnrichedIdea[] | null;
	currentIdeation: EnrichedIdeationOutput | null;
	pipelineStatus: PipelineStatus | null;
	batchQueue: QueuedIdea[];
	batchStatus: BatchStatus | null;
	error: string | null;
	// Article management
	selectedCategory: string | null;
	selectedArticleSlug: string | null;
	articleCategories: CategorySummary[];
	categoryArticles: PublishedArticle[];
	articleContent: string | null;
}
