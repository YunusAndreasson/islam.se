import { Box, Text, useApp, useStdout } from "ink";
import { useCallback, useEffect, useState } from "react";
import { IdeaDetailScreen } from "./screens/IdeaDetailScreen.js";
import { IdeaListScreen } from "./screens/IdeaListScreen.js";
import { PipelineScreen } from "./screens/PipelineScreen.js";
import { TopicListScreen } from "./screens/TopicListScreen.js";
import { deleteIdea, loadIdeation, loadTopics } from "./services/ideaLoader.js";
import { type StageEvent, TuiPipelineRunner } from "./services/pipelineRunner.js";
import type {
	AppState,
	EnrichedIdea,
	PipelineStatus,
	Screen,
	TopicSummary,
} from "./types/index.js";

const initialState: AppState = {
	screen: "topics",
	selectedTopic: null,
	selectedIdeaId: null,
	topics: [],
	currentIdeas: null,
	currentIdeation: null,
	pipelineStatus: null,
	error: null,
};

export function App(): React.ReactElement {
	const { exit } = useApp();
	const { stdout } = useStdout();
	const [state, setState] = useState<AppState>(initialState);
	const [pipelineCompleted, setPipelineCompleted] = useState(false);
	const [pipelineSuccess, setPipelineSuccess] = useState(false);
	const [pipelineError, setPipelineError] = useState<string | undefined>();
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

	const _navigateTo = useCallback((screen: Screen) => {
		setState((s) => ({ ...s, screen }));
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
		(idea: EnrichedIdea) => {
			setPipelineCompleted(false);
			setPipelineSuccess(false);
			setPipelineError(undefined);

			const initialStatus: PipelineStatus = {
				topic: idea.thesis,
				ideaTitle: idea.title,
				currentStage: "research",
				stages: {
					research: { status: "pending" },
					factCheck: { status: "pending" },
					authoring: { status: "pending" },
					review: { status: "pending" },
				},
				logs: [],
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

			runner.on("log", (message: string) => {
				setState((s) => {
					if (!s.pipelineStatus) return s;
					return {
						...s,
						pipelineStatus: {
							...s.pipelineStatus,
							logs: [...s.pipelineStatus.logs, message],
						},
					};
				});
			});

			runner.on("complete", (result: { success: boolean; error?: string }) => {
				setPipelineCompleted(true);
				setPipelineSuccess(result.success);
				setPipelineError(result.error);

				// Reload topics and ideas to update status
				const topics = loadTopics();
				if (state.selectedTopic) {
					const ideation = loadIdeation(state.selectedTopic);
					setState((s) => ({
						...s,
						topics,
						currentIdeation: ideation ?? s.currentIdeation,
						currentIdeas: ideation?.ideas ?? s.currentIdeas,
					}));
				} else {
					setState((s) => ({ ...s, topics }));
				}
			});

			// Pass topicSlug so the idea can be marked as done
			runner.produce(idea, state.selectedTopic ?? undefined).catch((err) => {
				setPipelineCompleted(true);
				setPipelineSuccess(false);
				setPipelineError(err instanceof Error ? err.message : "Unknown error");
			});
		},
		[state.selectedTopic],
	);

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

				// Also update topic list to reflect new idea count
				const topics = loadTopics();
				setState((s) => ({ ...s, topics }));
			}
		},
		[state.selectedTopic],
	);

	const handleBack = useCallback(() => {
		switch (state.screen) {
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
		}
	}, [state.screen]);

	const selectedIdea = state.currentIdeas?.find((i) => i.id === state.selectedIdeaId);

	// Render current screen in fullscreen container
	const renderScreen = () => {
		switch (state.screen) {
			case "topics":
				return (
					<TopicListScreen topics={state.topics} onSelectTopic={handleSelectTopic} onQuit={exit} />
				);

			case "ideas":
				if (!(state.currentIdeation && state.currentIdeas)) {
					return <Text color="red">No ideas loaded</Text>;
				}
				return (
					<IdeaListScreen
						topicName={state.currentIdeation.topic}
						ideas={state.currentIdeas}
						onSelectIdea={handleSelectIdea}
						onProduceIdea={handleProduceIdea}
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
						completed={pipelineCompleted}
						success={pipelineSuccess}
						error={pipelineError}
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
