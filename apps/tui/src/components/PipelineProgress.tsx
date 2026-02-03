import { ProgressBar, Spinner } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";
import type { PipelineStatus, StageInfo } from "../types/index.js";

const STAGES = ["research", "factCheck", "authoring", "review"] as const;
const STAGE_LABELS: Record<(typeof STAGES)[number], string> = {
	research: "Research",
	factCheck: "Fact-Check",
	authoring: "Authoring",
	review: "Review",
};

const STAGE_ICONS: Record<(typeof STAGES)[number], string> = {
	research: "📚",
	factCheck: "🔍",
	authoring: "✍️",
	review: "👁️",
};

function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

function StageIndicator({
	stage,
	info,
}: {
	stage: (typeof STAGES)[number];
	info: StageInfo;
}): React.ReactElement {
	const icon = STAGE_ICONS[stage];
	let statusIcon: React.ReactNode;
	let color: string;

	switch (info.status) {
		case "complete":
			statusIcon = <Text color="green">✓</Text>;
			color = "green";
			break;
		case "running":
			statusIcon = <Spinner />;
			color = "cyan";
			break;
		case "failed":
			statusIcon = <Text color="red">✗</Text>;
			color = "red";
			break;
		default:
			statusIcon = <Text color="gray">○</Text>;
			color = "gray";
	}

	const duration = info.duration ? formatDuration(info.duration) : "";
	const summary = info.summary ?? "";

	return (
		<Box gap={1}>
			<Box width={3}>{statusIcon}</Box>
			<Text color={color}>
				{icon} {STAGE_LABELS[stage]}
			</Text>
			{summary && <Text dimColor>— {summary}</Text>}
			{duration && <Text dimColor>({duration})</Text>}
			{info.error && (
				<Text color="red" dimColor>
					{info.error}
				</Text>
			)}
		</Box>
	);
}

interface PipelineProgressProps {
	status: PipelineStatus;
}

export function PipelineProgress({ status }: PipelineProgressProps): React.ReactElement {
	const elapsed = Date.now() - status.startedAt.getTime();

	// Calculate overall progress (0-100)
	const completedStages = STAGES.filter((s) => status.stages[s].status === "complete").length;
	const runningStage = STAGES.find((s) => status.stages[s].status === "running");
	const progress = Math.round((completedStages / STAGES.length) * 100 + (runningStage ? 12.5 : 0));

	return (
		<Box flexDirection="column" gap={1}>
			<Box flexDirection="column">
				<Text bold>Topic:</Text>
				<Text wrap="wrap" dimColor>
					{status.ideaTitle}
				</Text>
			</Box>

			<Box flexDirection="column" gap={0}>
				{STAGES.map((stage) => (
					<StageIndicator key={stage} stage={stage} info={status.stages[stage]} />
				))}
			</Box>

			<Box flexDirection="column" gap={0}>
				<Box gap={1}>
					<Text dimColor>Progress:</Text>
					<Box width={30}>
						<ProgressBar value={progress} />
					</Box>
					<Text dimColor>{progress}%</Text>
				</Box>
				<Text dimColor>Elapsed: {formatDuration(elapsed)}</Text>
			</Box>

			{status.logs.length > 0 && (
				<Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
					<Text bold dimColor>
						Recent logs:
					</Text>
					{status.logs.slice(-3).map((log) => (
						<Text key={log} dimColor>
							{log}
						</Text>
					))}
				</Box>
			)}
		</Box>
	);
}
