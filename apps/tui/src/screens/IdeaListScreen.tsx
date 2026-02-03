import { Box, Spacer, Text } from "ink";
import type React from "react";
import { useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { SelectableList } from "../components/SelectableList.js";
import { StatusBar } from "../components/StatusBar.js";
import type { EnrichedIdea } from "../types/index.js";

interface IdeaListScreenProps {
	topicName: string;
	ideas: EnrichedIdea[];
	onSelectIdea: (idea: EnrichedIdea) => void;
	onProduceIdea: (idea: EnrichedIdea) => void;
	onDeleteIdea: (idea: EnrichedIdea) => void;
	onBack: () => void;
}

function IdeaRow({ idea, focused }: { idea: EnrichedIdea; focused: boolean }): React.ReactElement {
	const isDone = idea.productionStatus?.status === "done";

	return (
		<Box gap={1}>
			<Text
				backgroundColor={focused ? "blue" : undefined}
				color={focused ? "white" : isDone ? "gray" : undefined}
				bold={focused}
			>
				{focused ? "❯ " : "  "}
				{String(idea.id).padStart(2)}. {idea.title}
			</Text>
			{isDone && <Text color="green">✓</Text>}
		</Box>
	);
}

function IdeaPreview({ idea }: { idea: EnrichedIdea }): React.ReactElement {
	const status = idea.productionStatus;

	return (
		<Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="cyan" gap={1}>
			<Box gap={2}>
				<Text bold color="cyan">
					#{idea.id} Preview
				</Text>
				{status?.status === "done" && (
					<Text color="green">
						✓ Published{status.articleSlug ? ` as ${status.articleSlug}` : ""}
					</Text>
				)}
				{status?.status === "failed" && <Text color="red">✗ Failed</Text>}
			</Box>

			<Box flexDirection="column">
				<Text bold>Thesis</Text>
				<Text wrap="wrap" dimColor>
					{idea.thesis}
				</Text>
			</Box>

			<Box flexDirection="column">
				<Text bold>Angle</Text>
				<Text wrap="wrap" dimColor>
					{idea.angle}
				</Text>
			</Box>

			<Box flexDirection="column">
				<Text bold>Keywords</Text>
				<Text color="yellow">{idea.keywords.join(" • ")}</Text>
			</Box>

			{idea.quotes && idea.quotes.length > 0 && (
				<Box flexDirection="column">
					<Text bold>Quotes ({idea.quotes.length})</Text>
					{idea.quotes.slice(0, 2).map((quote) => (
						<Box key={quote.id} flexDirection="column" paddingLeft={1} marginTop={1}>
							<Text italic dimColor wrap="wrap">
								"{quote.text.slice(0, 120)}
								{quote.text.length > 120 ? "…" : ""}"
							</Text>
							<Text dimColor>— {quote.author}</Text>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}

export function IdeaListScreen({
	topicName,
	ideas,
	onSelectIdea,
	onProduceIdea,
	onDeleteIdea,
	onBack,
}: IdeaListScreenProps): React.ReactElement {
	const [focusedIdea, setFocusedIdea] = useState<EnrichedIdea | null>(ideas[0] ?? null);
	const [pendingDelete, setPendingDelete] = useState<EnrichedIdea | null>(null);

	const handleKey = (input: string, idea: EnrichedIdea) => {
		if (input === "p") {
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

	// Show confirmation dialog
	if (pendingDelete) {
		return (
			<Box flexDirection="column" paddingX={1}>
				<ConfirmDialog
					message={`Delete idea #${pendingDelete.id}: "${pendingDelete.title.slice(0, 50)}${pendingDelete.title.length > 50 ? "…" : ""}"?`}
					onConfirm={handleConfirmDelete}
					onCancel={handleCancelDelete}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" paddingX={1}>
			{/* Header */}
			<Box marginBottom={1} gap={1}>
				<Text bold color="cyan">
					📝 {topicName}
				</Text>
				<Text dimColor>({ideas.length} ideas)</Text>
			</Box>

			{/* Main content: split view */}
			<Box flexDirection="row" flexGrow={1}>
				{/* Left: Idea list */}
				<Box flexDirection="column" width="40%" paddingRight={1}>
					<SelectableList
						items={ideas}
						renderItem={(idea, focused) => <IdeaRow idea={idea} focused={focused} />}
						onSelect={onSelectIdea}
						onBack={onBack}
						onKey={handleKey}
						onFocusChange={setFocusedIdea}
						maxVisible={12}
					/>
				</Box>

				{/* Right: Idea preview */}
				<Box flexDirection="column" width="60%">
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

			<Spacer />

			{/* Status bar */}
			<StatusBar
				shortcuts={[
					{ key: "↑↓", label: "Navigate" },
					{ key: "Enter", label: "Details" },
					{ key: "p", label: "Produce" },
					{ key: "d", label: "Delete" },
					{ key: "Esc", label: "Back" },
				]}
			/>
		</Box>
	);
}
