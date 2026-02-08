import { Box, Text, useInput, useStdout } from "ink";
import type React from "react";
import { ScreenLayout } from "../components/ScreenLayout.js";
import { SelectableList } from "../components/SelectableList.js";
import type { TopicSummary } from "../types/index.js";
import { fixedWidth } from "../utils/format.js";

interface TopicListScreenProps {
	topics: TopicSummary[];
	batchQueueSize: number;
	onSelectTopic: (topic: TopicSummary) => void;
	onStartBatch: () => void;
	onBack: () => void;
}

function TopicRow({
	topic,
	focused,
	doneCount,
}: {
	topic: TopicSummary;
	focused: boolean;
	doneCount: number;
}): React.ReactElement {
	// Status indicator based on completion
	let statusIcon: string;
	let statusColor: string;
	if (doneCount === topic.ideaCount) {
		statusIcon = "✓";
		statusColor = "green";
	} else if (doneCount > 0) {
		statusIcon = "◐";
		statusColor = "yellow";
	} else {
		statusIcon = "○";
		statusColor = "gray";
	}

	const progress = `${doneCount}/${topic.ideaCount}`.padStart(5);
	const versionLabel = topic.batchVersion > 1 ? ` v${topic.batchVersion}` : "";

	return (
		<Box>
			<Text
				backgroundColor={focused ? "#06b6d4" : undefined}
				color={focused ? "#000" : undefined}
				bold={focused}
			>
				{focused ? "❯" : " "} {fixedWidth(topic.name, 60)}
			</Text>
			<Text dimColor> {progress} done</Text>
			<Text color={statusColor}> {statusIcon}</Text>
			{versionLabel && <Text dimColor>{versionLabel}</Text>}
		</Box>
	);
}

export function TopicListScreen({
	topics,
	batchQueueSize,
	onSelectTopic,
	onStartBatch,
	onBack,
}: TopicListScreenProps): React.ReactElement {
	const { stdout } = useStdout();
	// Banner(13) + border(2) + breadcrumb(2) + statusbar(2) + legend(2) + header(2) + scroll indicators(2) = 25
	const listRows = Math.max(5, (stdout.rows ?? 24) - 25);

	useInput((input, key) => {
		if (input === "b" && batchQueueSize > 0) {
			onStartBatch();
		} else if (input === "q" || key.escape) {
			onBack();
		}
	});

	const shortcuts = [
		{ key: "j/k", label: "Navigate" },
		{ key: "Enter", label: "Select" },
		{ key: "b", label: batchQueueSize > 0 ? `Batch ${batchQueueSize}` : "Batch" },
		{ key: "q", label: "Back" },
	];

	return (
		<ScreenLayout shortcuts={shortcuts} breadcrumb="Ideas">
			{/* Legend */}
			<Box marginBottom={1} gap={2}>
				<Text dimColor>Status:</Text>
				<Box gap={1}>
					<Text color="green">✓</Text>
					<Text dimColor>Published</Text>
				</Box>
				<Box gap={1}>
					<Text color="yellow">◐</Text>
					<Text dimColor>In progress</Text>
				</Box>
				<Box gap={1}>
					<Text color="gray">○</Text>
					<Text dimColor>Not started</Text>
				</Box>
			</Box>

			{/* Topics list */}
			<Box marginBottom={1} gap={1}>
				<Text bold>Topics</Text>
				<Text dimColor>({topics.length})</Text>
				{batchQueueSize > 0 && <Text color="yellow">[{batchQueueSize} queued]</Text>}
			</Box>

			{topics.length === 0 ? (
				<Box flexDirection="column" padding={2} gap={1}>
					<Text color="yellow">No topics with ideas found.</Text>
					<Text dimColor>Generate ideas with:</Text>
					<Text color="#06b6d4"> pnpm produce ideate &lt;topic&gt;</Text>
				</Box>
			) : (
				<SelectableList
					items={topics}
					renderItem={(topic, focused) => (
						<TopicRow topic={topic} focused={focused} doneCount={topic.doneCount} />
					)}
					onSelect={onSelectTopic}
					maxVisible={listRows}
				/>
			)}
		</ScreenLayout>
	);
}
