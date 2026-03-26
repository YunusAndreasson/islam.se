import { Box, Text, useApp, useStdout } from "ink";
import { useCallback, useEffect, useState } from "react";
import { ArticleCategoryScreen } from "./screens/ArticleCategoryScreen.js";
import { ArticleListScreen } from "./screens/ArticleListScreen.js";
import { ArticleReadScreen } from "./screens/ArticleReadScreen.js";
import { BatchPipelineScreen } from "./screens/BatchPipelineScreen.js";
import { HomeScreen } from "./screens/HomeScreen.js";
import { IdeaDetailScreen } from "./screens/IdeaDetailScreen.js";
import { IdeaListScreen } from "./screens/IdeaListScreen.js";
import { PipelineScreen } from "./screens/PipelineScreen.js";
import { TopicListScreen } from "./screens/TopicListScreen.js";
import {
	loadArticleContent,
	loadArticlesByCategory,
	loadCategories,
	setArticleCategory,
	unpublishArticle,
} from "./services/articleLoader.js";
import { deleteIdea, loadIdeation, loadTopics } from "./services/ideaLoader.js";
import {
	type PreviewEvent,
	type StageEvent,
	TuiPipelineRunner,
} from "./services/pipelineRunner.js";
import type {
	AppState,
	BatchItemResult,
	BatchStatus,
	CategorySummary,
	EnrichedIdea,
	PipelineStatus,
	PublishedArticle,
	QueuedIdea,
	TopicSummary,
} from "./types/index.js";

interface PipelineOutcome {
	completed: boolean;
	success: boolean;
	error?: string;
	articleSlug?: string;
	wordCount?: number;
	qualityScore?: number;
}

const initialPipelineOutcome: PipelineOutcome = {
	completed: false,
	success: false,
};

const initialState: AppState = {
	screen: "home",
	selectedTopic: null,
	selectedIdeaId: null,
	topics: [],
	currentIdeas: null,
	currentIdeation: null,
	pipelineStatus: null,
	batchQueue: [],
	batchStatus: null,
	error: null,
	selectedCategory: null,
	selectedArticleSlug: null,
	articleCategories: [],
	categoryArticles: [],
	articleContent: null,
};

export function App(): React.ReactElement {
	const { exit } = useApp();
	const { stdout } = useStdout();
	const [state, setState] = useState<AppState>(initialState);
	const [pipelineOutcome, setPipelineOutcome] = useState<PipelineOutcome>(initialPipelineOutcome);
	const [lastPipelineIdea, setLastPipelineIdea] = useState<{
		idea: EnrichedIdea;
		topicSlug?: string;
	} | null>(null);
	const [terminalHeight, setTerminalHeight] = useState(stdout?.rows ?? 24);

	// Track terminal size changes
	useEffect(() => {
		const handleResize = () => {
			if (stdout?.rows) {
				setTerminalHeight(stdout.rows);
			}
		};
		stdout?.on("resize", handleResize);
		return () => {
			stdout?.off("resize", handleResize);
		};
	}, [stdout]);

	// Load topics on mount
	useEffect(() => {
		const topics = loadTopics();
		setState((s) => ({ ...s, topics }));
	}, []);

	// --- Shared reload helpers ---

	const reloadTopicsAndIdeas = useCallback(() => {
		setState((s) => {
			const topics = loadTopics();
			if (s.selectedTopic) {
				const ideation = loadIdeation(s.selectedTopic);
				return {
					...s,
					topics,
					currentIdeation: ideation ?? s.currentIdeation,
					currentIdeas: ideation?.ideas ?? s.currentIdeas,
				};
			}
			return { ...s, topics };
		});
	}, []);

	const reloadArticleData = useCallback(() => {
		setState((s) => {
			const categories = loadCategories();
			const articles =
				s.selectedCategory === null ? [] : loadArticlesByCategory(s.selectedCategory);
			return { ...s, articleCategories: categories, categoryArticles: articles };
		});
	}, []);

	// --- Ideas navigation ---

	const handleSelectIdeas = useCallback(() => {
		const topics = loadTopics();
		setState((s) => ({ ...s, screen: "topics", topics }));
	}, []);

	const handleSelectTopic = useCallback((topic: TopicSummary) => {
		const ideation = loadIdeation(topic.slug);
		if (ideation) {
			setState((s) => ({
				...s,
				selectedTopic: topic.slug,
				currentIdeation: ideation,
				currentIdeas: ideation.ideas,
				screen: "ideas",
			}));
		}
	}, []);

	const handleSelectIdea = useCallback((idea: EnrichedIdea) => {
		setState((s) => ({
			...s,
			selectedIdeaId: idea.id,
			screen: "detail",
		}));
	}, []);

	const handleProduceIdea = useCallback(
		(idea: EnrichedIdea, options?: { resume?: boolean }) => {
			setPipelineOutcome(initialPipelineOutcome);
			setLastPipelineIdea({ idea, topicSlug: state.selectedTopic ?? undefined });

			const initialStatus: PipelineStatus = {
				topic: idea.thesis,
				ideaTitle: idea.title,
				currentStage: "research",
				stages: {
					research: { status: "pending" },
					factCheck: { status: "pending" },
					authoring: { status: "pending" },
					review: { status: "pending" },
					polish: { status: "pending" },
					language: { status: "pending" },
					swedishVoice: { status: "pending" },
				},
				logs: [],
				previews: [],
				startedAt: new Date(),
			};

			setState((s) => ({
				...s,
				pipelineStatus: initialStatus,
				screen: "pipeline",
			}));

			// Start pipeline
			const runner = new TuiPipelineRunner();

			runner.on("stage", (event: StageEvent) => {
				setState((s) => {
					if (!s.pipelineStatus) return s;
					return {
						...s,
						pipelineStatus: {
							...s.pipelineStatus,
							currentStage: event.stage,
							stages: {
								...s.pipelineStatus.stages,
								[event.stage]: {
									status: event.status,
									duration: event.duration,
									summary: event.summary,
									error: event.error,
								},
							},
						},
					};
				});
			});

			// Batch log updates to reduce re-renders (flush every 500ms)
			let logBuffer: string[] = [];
			let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
			const flushLogs = () => {
				logFlushTimer = null;
				if (logBuffer.length === 0) return;
				const batch = logBuffer;
				logBuffer = [];
				setState((s) => {
					if (!s.pipelineStatus) return s;
					return {
						...s,
						pipelineStatus: {
							...s.pipelineStatus,
							logs: [...s.pipelineStatus.logs, ...batch].slice(-100),
						},
					};
				});
			};
			runner.on("log", (message: string) => {
				logBuffer.push(message);
				if (!logFlushTimer) {
					logFlushTimer = setTimeout(flushLogs, 500);
				}
			});

			runner.on("preview", (event: PreviewEvent) => {
				setState((s) => {
					if (!s.pipelineStatus) return s;
					// Keep last 15 previews for a richer view
					const newPreview = {
						stage: event.stage,
						type: event.type,
						content: event.content,
						timestamp: Date.now(),
					};
					const previews = [...s.pipelineStatus.previews, newPreview].slice(-15);
					return {
						...s,
						pipelineStatus: {
							...s.pipelineStatus,
							previews,
						},
					};
				});
			});

			runner.on(
				"complete",
				(result: {
					success: boolean;
					error?: string;
					articleSlug?: string;
					wordCount?: number;
					qualityScore?: number;
				}) => {
					setPipelineOutcome({
						completed: true,
						success: result.success,
						error: result.error,
						articleSlug: result.articleSlug,
						wordCount: result.wordCount,
						qualityScore: result.qualityScore,
					});
					reloadTopicsAndIdeas();
				},
			);

			// Pass topicSlug so the idea can be marked as done
			runner
				.produce(idea, state.selectedTopic ?? undefined, { resume: options?.resume })
				.catch((err) => {
					setPipelineOutcome({
						completed: true,
						success: false,
						error: err instanceof Error ? err.message : "Unknown error",
					});
				});
		},
		[state.selectedTopic, reloadTopicsAndIdeas],
	);

	const handleRetryPipeline = useCallback(() => {
		if (!lastPipelineIdea) return;
		handleProduceIdea(lastPipelineIdea.idea, { resume: true });
	}, [lastPipelineIdea, handleProduceIdea]);

	const handleDeleteIdea = useCallback(
		(idea: EnrichedIdea) => {
			if (!state.selectedTopic) return;

			const updatedIdeation = deleteIdea(state.selectedTopic, idea.id);
			if (updatedIdeation) {
				setState((s) => ({
					...s,
					currentIdeation: updatedIdeation,
					currentIdeas: updatedIdeation.ideas,
				}));
				reloadTopicsAndIdeas();
			}
		},
		[state.selectedTopic, reloadTopicsAndIdeas],
	);

	// --- Batch queue & production ---

	const handleToggleBatchQueue = useCallback(
		(idea: EnrichedIdea) => {
			const topicSlug = state.selectedTopic;
			const topicName = state.currentIdeation?.topic;
			if (!(topicSlug && topicName)) return;

			setState((s) => {
				const idx = s.batchQueue.findIndex(
					(q) => q.topicSlug === topicSlug && q.idea.id === idea.id,
				);
				if (idx >= 0) {
					const next = [...s.batchQueue];
					next.splice(idx, 1);
					return { ...s, batchQueue: next };
				}
				return { ...s, batchQueue: [...s.batchQueue, { idea, topicSlug, topicName }] };
			});
		},
		[state.selectedTopic, state.currentIdeation?.topic],
	);

	const handleStartBatch = useCallback(() => {
		const items = state.batchQueue;
		if (items.length === 0) return;

		const batch: BatchStatus = {
			items,
			currentIndex: 0,
			results: [],
			startedAt: new Date(),
			currentPipelineStatus: null,
		};

		setState((s) => ({ ...s, batchStatus: batch, batchQueue: [], screen: "batchPipeline" }));

		// Helper: update currentPipelineStatus inside batchStatus without deep nesting
		const updatePipeline = (fn: (ps: PipelineStatus) => PipelineStatus) => {
			setState((s) => {
				if (!s.batchStatus?.currentPipelineStatus) return s;
				return {
					...s,
					batchStatus: {
						...s.batchStatus,
						currentPipelineStatus: fn(s.batchStatus.currentPipelineStatus),
					},
				};
			});
		};

		const runBatch = async () => {
			for (let i = 0; i < items.length; i++) {
				const { idea, topicSlug } = items[i] as QueuedIdea;
				const itemStart = Date.now();

				setState((s) => {
					if (!s.batchStatus) return s;
					return {
						...s,
						batchStatus: {
							...s.batchStatus,
							currentIndex: i,
							currentPipelineStatus: {
								topic: idea.thesis,
								ideaTitle: idea.title,
								currentStage: "research",
								stages: {
									research: { status: "pending" },
									factCheck: { status: "pending" },
									authoring: { status: "pending" },
									review: { status: "pending" },
									polish: { status: "pending" },
									language: { status: "pending" },
									swedishVoice: { status: "pending" },
								},
								logs: [],
								previews: [],
								startedAt: new Date(),
							},
						},
					};
				});

				const result = await new Promise<BatchItemResult>((resolve) => {
					const runner = new TuiPipelineRunner();

					runner.on("stage", (event: StageEvent) => {
						updatePipeline((ps) => ({
							...ps,
							currentStage: event.stage,
							stages: {
								...ps.stages,
								[event.stage]: {
									status: event.status,
									duration: event.duration,
									summary: event.summary,
									error: event.error,
								},
							},
						}));
					});

					let batchLogBuf: string[] = [];
					let batchLogTimer: ReturnType<typeof setTimeout> | null = null;
					runner.on("log", (message: string) => {
						batchLogBuf.push(message);
						if (!batchLogTimer) {
							batchLogTimer = setTimeout(() => {
								batchLogTimer = null;
								const batch = batchLogBuf;
								batchLogBuf = [];
								updatePipeline((ps) => ({ ...ps, logs: [...ps.logs, ...batch].slice(-100) }));
							}, 500);
						}
					});

					runner.on("preview", (event: PreviewEvent) => {
						updatePipeline((ps) => ({
							...ps,
							previews: [
								...ps.previews,
								{
									stage: event.stage,
									type: event.type,
									content: event.content,
									timestamp: Date.now(),
								},
							].slice(-15),
						}));
					});

					runner.on(
						"complete",
						(r: {
							success: boolean;
							error?: string;
							articleSlug?: string;
							wordCount?: number;
							qualityScore?: number;
						}) => {
							resolve({
								ideaId: idea.id,
								ideaTitle: idea.title,
								success: r.success,
								error: r.error,
								articleSlug: r.articleSlug,
								wordCount: r.wordCount,
								qualityScore: r.qualityScore,
								duration: Date.now() - itemStart,
							});
						},
					);

					runner.produce(idea, topicSlug).catch((err) => {
						resolve({
							ideaId: idea.id,
							ideaTitle: idea.title,
							success: false,
							error: err instanceof Error ? err.message : "Unknown error",
							duration: Date.now() - itemStart,
						});
					});
				});

				setState((s) => {
					if (!s.batchStatus) return s;
					return {
						...s,
						batchStatus: {
							...s.batchStatus,
							results: [...s.batchStatus.results, result],
							currentPipelineStatus: null,
						},
					};
				});
			}

			reloadTopicsAndIdeas();
		};

		runBatch().catch(() => {
			// Individual items already catch their own errors —
			// this only fires if setState itself throws, which shouldn't happen
		});
	}, [state.batchQueue, reloadTopicsAndIdeas]);

	// --- Articles navigation ---

	const handleSelectArticles = useCallback(() => {
		const categories = loadCategories();
		setState((s) => ({
			...s,
			screen: "articleCategories",
			articleCategories: categories,
		}));
	}, []);

	const handleSelectCategory = useCallback((category: CategorySummary) => {
		const articles = loadArticlesByCategory(category.name);
		setState((s) => ({
			...s,
			screen: "articleList",
			selectedCategory: category.name,
			categoryArticles: articles,
		}));
	}, []);

	const handleReadArticle = useCallback((article: PublishedArticle) => {
		const content = loadArticleContent(article.slug);
		setState((s) => ({
			...s,
			screen: "articleRead",
			selectedArticleSlug: article.slug,
			articleContent: content,
		}));
	}, []);

	const handleMoveArticle = useCallback(
		(slug: string, category: string) => {
			setArticleCategory(slug, category);
			reloadArticleData();
		},
		[reloadArticleData],
	);

	const handleUnpublishArticle = useCallback(
		(slug: string) => {
			unpublishArticle(slug);
			reloadArticleData();
		},
		[reloadArticleData],
	);

	// --- Back navigation ---

	const handleBack = useCallback(() => {
		switch (state.screen) {
			case "topics":
				setState((s) => ({ ...s, screen: "home" }));
				break;
			case "ideas":
				setState((s) => ({
					...s,
					screen: "topics",
					selectedTopic: null,
					currentIdeas: null,
					currentIdeation: null,
				}));
				break;
			case "detail":
				setState((s) => ({ ...s, screen: "ideas", selectedIdeaId: null }));
				break;
			case "pipeline":
				setState((s) => ({
					...s,
					screen: "ideas",
					pipelineStatus: null,
				}));
				break;
			case "batchPipeline":
				setState((s) => ({
					...s,
					screen: "topics",
					batchStatus: null,
					selectedTopic: null,
					currentIdeas: null,
					currentIdeation: null,
				}));
				break;
			case "articleCategories":
				setState((s) => ({ ...s, screen: "home" }));
				break;
			case "articleList":
				setState((s) => ({
					...s,
					screen: "articleCategories",
					selectedCategory: null,
					categoryArticles: [],
				}));
				break;
			case "articleRead":
				setState((s) => ({
					...s,
					screen: "articleList",
					selectedArticleSlug: null,
					articleContent: null,
				}));
				break;
		}
	}, [state.screen]);

	const selectedIdea = state.currentIdeas?.find((i) => i.id === state.selectedIdeaId);
	const selectedArticle = state.categoryArticles.find((a) => a.slug === state.selectedArticleSlug);

	// Render current screen in fullscreen container
	const renderScreen = () => {
		switch (state.screen) {
			case "home":
				return (
					<HomeScreen
						onSelectIdeas={handleSelectIdeas}
						onSelectArticles={handleSelectArticles}
						onQuit={exit}
					/>
				);

			case "topics":
				return (
					<TopicListScreen
						topics={state.topics}
						batchQueueSize={state.batchQueue.length}
						onSelectTopic={handleSelectTopic}
						onStartBatch={handleStartBatch}
						onBack={handleBack}
					/>
				);

			case "ideas":
				if (!(state.currentIdeation && state.currentIdeas)) {
					return <Text color="red">No ideas loaded</Text>;
				}
				return (
					<IdeaListScreen
						topicName={state.currentIdeation.topic}
						topicSlug={state.selectedTopic ?? ""}
						ideas={state.currentIdeas}
						selectionGuidance={state.currentIdeation.selectionGuidance}
						batchQueue={state.batchQueue}
						onSelectIdea={handleSelectIdea}
						onProduceIdea={handleProduceIdea}
						onToggleBatchQueue={handleToggleBatchQueue}
						onStartBatch={handleStartBatch}
						onDeleteIdea={handleDeleteIdea}
						onBack={handleBack}
					/>
				);

			case "detail":
				if (!selectedIdea) {
					return <Text color="red">No idea selected</Text>;
				}
				return (
					<IdeaDetailScreen
						idea={selectedIdea}
						topicName={state.currentIdeation?.topic}
						onProduce={() => handleProduceIdea(selectedIdea)}
						onBack={handleBack}
					/>
				);

			case "pipeline":
				if (!state.pipelineStatus) {
					return <Text color="red">No pipeline running</Text>;
				}
				return (
					<PipelineScreen
						status={state.pipelineStatus}
						completed={pipelineOutcome.completed}
						success={pipelineOutcome.success}
						error={pipelineOutcome.error}
						articleSlug={pipelineOutcome.articleSlug}
						wordCount={pipelineOutcome.wordCount}
						qualityScore={pipelineOutcome.qualityScore}
						onBack={handleBack}
						onRetry={handleRetryPipeline}
					/>
				);

			case "batchPipeline":
				if (!state.batchStatus) {
					return <Text color="red">No batch running</Text>;
				}
				return (
					<BatchPipelineScreen
						batchStatus={state.batchStatus}
						completed={state.batchStatus.results.length === state.batchStatus.items.length}
						onBack={handleBack}
					/>
				);

			case "articleCategories":
				return (
					<ArticleCategoryScreen
						categories={state.articleCategories}
						onSelectCategory={handleSelectCategory}
						onBack={handleBack}
					/>
				);

			case "articleList":
				return (
					<ArticleListScreen
						categoryName={state.selectedCategory ?? ""}
						articles={state.categoryArticles}
						categories={state.articleCategories}
						onReadArticle={handleReadArticle}
						onMoveArticle={handleMoveArticle}
						onUnpublishArticle={handleUnpublishArticle}
						onBack={handleBack}
					/>
				);

			case "articleRead":
				if (!(selectedArticle && state.articleContent)) {
					return <Text color="red">No article content</Text>;
				}
				return (
					<ArticleReadScreen
						article={selectedArticle}
						categoryName={state.selectedCategory ?? undefined}
						content={state.articleContent}
						onBack={handleBack}
					/>
				);

			default:
				return <Text color="red">Unknown screen</Text>;
		}
	};

	return (
		<Box flexDirection="column" height={terminalHeight}>
			{renderScreen()}
		</Box>
	);
}
