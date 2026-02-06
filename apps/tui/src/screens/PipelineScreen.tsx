import { StatusMessage } from "@inkjs/ui";
import { Box, Spacer, Text, useInput } from "ink";
import type React from "react";
import { PipelineProgress } from "../components/PipelineProgress.js";
import { StatusBar } from "../components/StatusBar.js";
import type { PipelineStatus } from "../types/index.js";

interface PipelineScreenProps {
	status: PipelineStatus;
	completed: boolean;
	success: boolean;
	error?: string;
	articleSlug?: string;
	wordCount?: number;
	qualityScore?: number;
	onBack: () => void;
}

export function PipelineScreen({
	status,
	completed,
	success,
	error,
	articleSlug,
	wordCount,
	qualityScore,
	onBack,
}: PipelineScreenProps): React.ReactElement {
	useInput((_input, key) => {
		if (key.escape || (completed && key.return)) {
			onBack();
		}
	});

	return (
		<Box flexDirection="column" paddingX={1}>
			{/* Header */}
			<Box
				marginBottom={1}
				borderStyle={completed ? (success ? "double" : "bold") : "single"}
				borderColor={completed ? (success ? "green" : "red") : "blue"}
				paddingX={2}
				justifyContent="center"
			>
				{completed ? (
					success ? (
						<Text bold color="green">
							✨ Production Complete!
						</Text>
					) : (
						<Text bold color="red">
							❌ Production Failed
						</Text>
					)
				) : (
					<Text bold color="blue">
						⚡ Producing Article...
					</Text>
				)}
			</Box>

			{/* Progress */}
			<Box flexDirection="column" flexGrow={1}>
				<PipelineProgress status={status} />

				{completed && error && (
					<Box marginTop={1}>
						<StatusMessage variant="error">{error}</StatusMessage>
					</Box>
				)}

				{completed && success && (
					<Box flexDirection="column" marginTop={1} gap={1}>
						<StatusMessage variant="success">Article published successfully!</StatusMessage>
						<Box flexDirection="column" paddingLeft={2}>
							{articleSlug && (
								<Text>
									<Text dimColor>Article:</Text> data/articles/{articleSlug}.md
								</Text>
							)}
							{wordCount && (
								<Text>
									<Text dimColor>Words:</Text> {wordCount.toLocaleString()}
								</Text>
							)}
							{qualityScore && (
								<Text>
									<Text dimColor>Quality:</Text> {qualityScore}/10
								</Text>
							)}
						</Box>
					</Box>
				)}
			</Box>

			<Spacer />

			{/* Status bar */}
			<StatusBar
				shortcuts={
					completed
						? [
								{ key: "Enter", label: "Back" },
								{ key: "Esc", label: "Back" },
							]
						: [{ key: "Esc", label: "Cancel" }]
				}
			/>
		</Box>
	);
}
