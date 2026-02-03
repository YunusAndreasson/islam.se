import { Spinner } from "@inkjs/ui";
import { Box, Spacer, Text, useInput } from "ink";
import type React from "react";
import { SelectableList } from "../components/SelectableList.js";
import { StatusBar } from "../components/StatusBar.js";
import type { TopicSummary } from "../types/index.js";

interface TopicListScreenProps {
	topics: TopicSummary[];
	onSelectTopic: (topic: TopicSummary) => void;
	onQuit: () => void;
	isLoading?: boolean;
}

function TopicRow({
	topic,
	focused,
}: {
	topic: TopicSummary;
	focused: boolean;
}): React.ReactElement {
	// Status indicator
	let statusIcon: string;
	let statusColor: string;
	if (topic.articleStatus.stages.final) {
		statusIcon = "✓";
		statusColor = "green";
	} else if (topic.articleStatus.exists) {
		statusIcon = "◐";
		statusColor = "yellow";
	} else {
		statusIcon = "○";
		statusColor = "gray";
	}

	return (
		<Box gap={1}>
			<Text
				backgroundColor={focused ? "blue" : undefined}
				color={focused ? "white" : undefined}
				bold={focused}
			>
				{focused ? "❯" : " "} {topic.name}
			</Text>
			<Spacer />
			<Text dimColor>{topic.ideaCount} ideas</Text>
			<Text color={statusColor}>{statusIcon}</Text>
		</Box>
	);
}

export function TopicListScreen({
	topics,
	onSelectTopic,
	onQuit,
	isLoading = false,
}: TopicListScreenProps): React.ReactElement {
	useInput((input) => {
		if (input === "q") {
			onQuit();
		}
	});

	return (
		<Box flexDirection="column" paddingX={1}>
			{/* Header */}
			<Box
				marginBottom={1}
				borderStyle="double"
				borderColor="cyan"
				paddingX={2}
				paddingY={0}
				justifyContent="center"
			>
				<Text bold color="cyan">
					🕌 Islam.se Content Studio
				</Text>
			</Box>

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
			<Box flexDirection="column" flexGrow={1}>
				<Box marginBottom={1}>
					<Text bold>Topics</Text>
					<Text dimColor> ({topics.length})</Text>
				</Box>

				{isLoading ? (
					<Box padding={2}>
						<Spinner label="Loading topics..." />
					</Box>
				) : topics.length === 0 ? (
					<Box flexDirection="column" padding={2} gap={1}>
						<Text color="yellow">No topics with ideas found.</Text>
						<Text dimColor>Generate ideas with:</Text>
						<Text color="cyan"> pnpm produce ideate &lt;topic&gt;</Text>
					</Box>
				) : (
					<SelectableList
						items={topics}
						renderItem={(topic, focused) => <TopicRow topic={topic} focused={focused} />}
						onSelect={onSelectTopic}
						maxVisible={15}
					/>
				)}
			</Box>

			<Spacer />

			{/* Status bar */}
			<StatusBar
				shortcuts={[
					{ key: "↑↓", label: "Navigate" },
					{ key: "Enter", label: "Select" },
					{ key: "q", label: "Quit" },
				]}
				title="Islam.se TUI v0.1"
			/>
		</Box>
	);
}
