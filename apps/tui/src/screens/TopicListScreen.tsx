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

	return (
		<Box gap={1}>
			<Text
				backgroundColor={focused ? "cyan" : undefined}
				color={focused ? "black" : undefined}
				bold={focused}
			>
				{focused ? "❯" : " "} {topic.name}
			</Text>
			<Spacer />
			<Text dimColor>
				{doneCount}/{topic.ideaCount} done
			</Text>
			<Text color={statusColor}>{statusIcon}</Text>
		</Box>
	);
}

const ASCII_BANNER = [
	"                                                                                  ",
	"        `7MMF'  .M\"\"\"bgd `7MMF'              db      `7MMM.     ,MMF'             ",
	'          MM   ,MI    "Y   MM               ;MM:       MMMb    dPMM               ',
	"          MM   `MMb.       MM              ,V^MM.      M YM   ,M MM               ",
	"          MM     `YMMNq.   MM             ,M  `MM      M  Mb  M' MM               ",
	"          MM   .     `MM   MM      ,      AbmmmqMA     M  YM.P'  MM               ",
	"          MM   Mb     dM   MM     ,M     A'     VML    M  `YM'   MM               ",
	'        .JMML. P"Ybmmd"  .JMMmmmmMMM   .AMA.   .AMMA..JML. `\'  .JMML.             ',
	"        _______________________________________________________________          ",
	"                                                                                  ",
	"           ::: c o n t e n t   s t u d i o  :::  e s t   2 0 2 5 :::             ",
	"        _______________________________________________________________          ",
];

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
			{/* ASCII Banner */}
			<Box flexDirection="column" marginBottom={1}>
				<Text> </Text>
				<Text color="cyan">{ASCII_BANNER[1]}</Text>
				<Text color="cyan">{ASCII_BANNER[2]}</Text>
				<Text color="cyanBright">{ASCII_BANNER[3]}</Text>
				<Text color="cyanBright">{ASCII_BANNER[4]}</Text>
				<Text color="white">{ASCII_BANNER[5]}</Text>
				<Text color="white">{ASCII_BANNER[6]}</Text>
				<Text color="cyan">{ASCII_BANNER[7]}</Text>
				<Text color="gray">{ASCII_BANNER[8]}</Text>
				<Text> </Text>
				<Text color="yellow">{ASCII_BANNER[10]}</Text>
				<Text color="gray">{ASCII_BANNER[11]}</Text>
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
						renderItem={(topic, focused) => (
							<TopicRow topic={topic} focused={focused} doneCount={topic.doneCount} />
						)}
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
			/>
		</Box>
	);
}
