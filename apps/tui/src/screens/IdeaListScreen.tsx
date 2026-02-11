import { Box, Text, useStdout } from "ink";
import React, { useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { QuoteBlock } from "../components/QuoteBlock.js";
import { ScreenLayout } from "../components/ScreenLayout.js";
import { SelectableList } from "../components/SelectableList.js";
import type { EnrichedIdea, QueuedIdea } from "../types/index.js";
import { truncate } from "../utils/format.js";

interface IdeaListScreenProps {
	topicName: string;
	topicSlug: string;
	ideas: EnrichedIdea[];
	selectionGuidance?: string;
	batchQueue: QueuedIdea[];
	onSelectIdea: (idea: EnrichedIdea) => void;
	onProduceIdea: (idea: EnrichedIdea) => void;
	onToggleBatchQueue: (idea: EnrichedIdea) => void;
	onStartBatch: () => void;
	onDeleteIdea: (idea: EnrichedIdea) => void;
	onBack: () => void;
}

function scoreColor(score: number | undefined): string | undefined {
	if (!score) return undefined;
	if (score >= 8) return "#22c55e";
	if (score >= 6) return "#eab308";
	return "#ef4444";
}

function IdeaRow({
	idea,
	focused,
	selected,
}: {
	idea: EnrichedIdea;
	focused: boolean;
	selected: boolean;
}): React.ReactElement {
	const isDone = idea.productionStatus?.status === "done";
	const prefix = focused ? "❯" : isDone ? "✓" : " ";
	const selectMarker = selected ? "*" : " ";
	return (
		<Box>
			<Text color={selected ? "#06b6d4" : undefined}>{selectMarker}</Text>
			<Text color={!focused && isDone ? "green" : undefined}>{prefix}</Text>
			<Text
				color={focused ? "#000" : scoreColor(idea.score)}
				backgroundColor={focused ? "#06b6d4" : undefined}
			>
				{" "}
				{String(idea.score).padStart(2)}
			</Text>
			<Text
				backgroundColor={focused ? "#06b6d4" : selected ? "#164e63" : undefined}
				color={focused ? "#000" : isDone ? "gray" : undefined}
				bold={focused}
				wrap="truncate-end"
			>
				{" "}
				{String(idea.id).padStart(2)}. {idea.title}
			</Text>
		</Box>
	);
}

const IdeaPreview = React.memo(
	function IdeaPreview({ idea }: { idea: EnrichedIdea }): React.ReactElement {
		const status = idea.productionStatus;
		const isDone = status?.status === "done";
		return (
			<Box flexDirection="column" paddingX={1}>
				<Box marginBottom={1} gap={2}>
					<Text bold color="#06b6d4">
						Idea #{idea.id}
					</Text>
					{idea.score != null && (
						<Text bold color={scoreColor(idea.score)}>
							{idea.score}/10
						</Text>
					)}
					{idea.difficulty && <Text dimColor>[{idea.difficulty}]</Text>}
					{isDone && (
						<Text color="green">
							✓ Published{status.articleSlug ? ` as ${status.articleSlug}` : ""}
						</Text>
					)}
					{status?.status === "failed" && <Text color="red">✗ Failed</Text>}
				</Box>

				<Box flexDirection="column" marginBottom={1}>
					<Text bold>Title</Text>
					<Text dimColor wrap="wrap">
						{idea.title}
					</Text>
				</Box>

				<Box flexDirection="column" marginBottom={1}>
					<Text bold>Thesis</Text>
					<Text dimColor wrap="wrap">
						{idea.thesis}
					</Text>
				</Box>

				<Box flexDirection="column" marginBottom={1}>
					<Text bold>Angle</Text>
					<Text dimColor wrap="wrap">
						{idea.angle}
					</Text>
				</Box>

				<Box flexDirection="column" marginBottom={1}>
					<Text bold>Keywords</Text>
					<Text color="yellow" wrap="wrap">
						{idea.keywords.join(", ")}
					</Text>
				</Box>

				{idea.quotes && idea.quotes.length > 0 && (
					<Box flexDirection="column">
						<Text bold>Quotes ({idea.quotes.length})</Text>
						{idea.quotes.slice(0, 2).map((quote) => (
							<Box key={quote.id} marginTop={1}>
								<QuoteBlock
									text={quote.text}
									author={quote.author}
									source={quote.source}
									maxLength={120}
								/>
							</Box>
						))}
						{idea.quotes.length > 2 && <Text dimColor>... and {idea.quotes.length - 2} more</Text>}
					</Box>
				)}
			</Box>
		);
	},
	(prev, next) => prev.idea.id === next.idea.id,
);

export function IdeaListScreen({
	topicName,
	topicSlug,
	ideas,
	selectionGuidance,
	batchQueue,
	onSelectIdea,
	onProduceIdea,
	onToggleBatchQueue,
	onStartBatch,
	onDeleteIdea,
	onBack,
}: IdeaListScreenProps): React.ReactElement {
	const { stdout } = useStdout();
	// Banner(13) + border(2) + breadcrumb(2) + statusbar(2) + header(2) + guidance(~2) + scroll indicators(2) = 25
	const listRows = Math.max(5, (stdout.rows ?? 24) - 25);

	// Sort by score descending (highest first); old ideas without scores go last
	const sortedIdeas = useMemo(
		() => [...ideas].sort((a, b) => (b.score || 0) - (a.score || 0)),
		[ideas],
	);

	const [focusedIdea, setFocusedIdea] = useState<EnrichedIdea | null>(sortedIdeas[0] ?? null);
	const [pendingDelete, setPendingDelete] = useState<EnrichedIdea | null>(null);

	const isQueued = (ideaId: number) =>
		batchQueue.some((q) => q.topicSlug === topicSlug && q.idea.id === ideaId);

	const handleKey = (input: string, idea: EnrichedIdea) => {
		if (input === "q") {
			onBack();
		} else if (input === " ") {
			onToggleBatchQueue(idea);
		} else if (input === "b" && batchQueue.length > 0) {
			onStartBatch();
		} else if (input === "p") {
			onProduceIdea(idea);
		} else if (input === "d" || input === "x") {
			setPendingDelete(idea);
		}
	};

	const handleConfirmDelete = () => {
		if (pendingDelete) {
			onDeleteIdea(pendingDelete);
			setPendingDelete(null);
		}
	};

	const handleCancelDelete = () => {
		setPendingDelete(null);
	};

	const shortcuts = pendingDelete
		? [
				{ key: "Y", label: "Confirm" },
				{ key: "N", label: "Cancel" },
			]
		: [
				{ key: "j/k", label: "Navigate" },
				{ key: "Space", label: "Queue" },
				{ key: "b", label: batchQueue.length > 0 ? `Batch ${batchQueue.length}` : "Batch" },
				{ key: "Enter", label: "Details" },
				{ key: "p", label: "Produce" },
				{ key: "d", label: "Delete" },
				{ key: "q", label: "Back" },
			];

	return (
		<ScreenLayout shortcuts={shortcuts} breadcrumb={`Ideas > ${topicName}`} fullWidth>
			{pendingDelete ? (
				<ConfirmDialog
					message={`Delete idea #${pendingDelete.id}: "${truncate(pendingDelete.title, 50)}"?`}
					onConfirm={handleConfirmDelete}
					onCancel={handleCancelDelete}
				/>
			) : (
				<>
					{/* Header */}
					<Box marginBottom={1} gap={1}>
						<Text bold color="#06b6d4">
							📝 {topicName}
						</Text>
						<Text dimColor>({ideas.length} ideas)</Text>
						{batchQueue.length > 0 && <Text color="yellow">[{batchQueue.length} queued]</Text>}
					</Box>

					{/* Selection guidance */}
					{selectionGuidance && (
						<Box marginBottom={1} paddingX={1}>
							<Text italic dimColor wrap="wrap">
								{selectionGuidance}
							</Text>
						</Box>
					)}

					{/* Main content: split view */}
					<Box flexDirection="row" flexGrow={1}>
						{/* Left: Idea list */}
						<Box flexDirection="column" width="50%" paddingRight={1}>
							<SelectableList
								items={sortedIdeas}
								renderItem={(idea, focused) => (
									<IdeaRow idea={idea} focused={focused} selected={isQueued(idea.id)} />
								)}
								onSelect={onSelectIdea}
								onBack={onBack}
								onKey={handleKey}
								onFocusChange={setFocusedIdea}
								maxVisible={listRows}
							/>
						</Box>

						{/* Right: Idea preview */}
						<Box flexDirection="column" width="50%" minHeight={16} overflowY="hidden">
							{focusedIdea ? (
								<IdeaPreview idea={focusedIdea} />
							) : (
								<Box padding={2}>
									<Text dimColor italic>
										No idea selected
									</Text>
								</Box>
							)}
						</Box>
					</Box>
				</>
			)}
		</ScreenLayout>
	);
}
