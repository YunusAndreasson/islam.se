import { ProgressBar } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import type { PipelineStatus, StageInfo } from "../types/index.js";

// Slow spinner that updates every 500ms instead of 80ms to reduce screen flashing
const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];
function SlowSpinner(): React.ReactElement {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => {
			setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
		}, 500);
		return () => clearInterval(interval);
	}, []);
	return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
}

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
			statusIcon = <SlowSpinner />;
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
		<Box flexDirection="column">
			<Box gap={1}>
				<Box width={3}>{statusIcon}</Box>
				<Text color={color}>
					{icon} {STAGE_LABELS[stage]}
				</Text>
				{summary && <Text dimColor>— {summary}</Text>}
				{duration && <Text dimColor>({duration})</Text>}
			</Box>
			{info.error && (
				<Box paddingLeft={4}>
					<Text color="red" wrap="wrap">
						⚠ {info.error}
					</Text>
				</Box>
			)}
		</Box>
	);
}

interface PipelineProgressProps {
	status: PipelineStatus;
}

export function PipelineProgress({ status }: PipelineProgressProps): React.ReactElement {
	// Use state for elapsed time with throttled updates to prevent glitching
	const [elapsed, setElapsed] = useState(() => Date.now() - status.startedAt.getTime());

	useEffect(() => {
		const interval = setInterval(() => {
			setElapsed(Date.now() - status.startedAt.getTime());
		}, 5000); // Update every 5 seconds to reduce flicker

		return () => clearInterval(interval);
	}, [status.startedAt]);

	// Calculate overall progress (0-100)
	const completedStages = STAGES.filter((s) => status.stages[s].status === "complete").length;
	const runningStage = STAGES.find((s) => status.stages[s].status === "running");
	const progress = Math.round((completedStages / STAGES.length) * 100 + (runningStage ? 12.5 : 0));

	// Get last 3 logs with stable indices for keys
	const recentLogs = status.logs.slice(-3);
	const logStartIndex = Math.max(0, status.logs.length - 3);

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

			{/* Live preview - quotes, findings, and generated text from Claude */}
			{status.previews.length > 0 && (
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor="cyan"
					paddingX={1}
					minHeight={8}
				>
					<Text bold color="cyan">
						💭 Live Output
					</Text>
					{status.previews.slice(-6).map((preview, i) => {
						const icon = preview.type === "tool_result" ? "📜" : "✍️";
						const color = preview.type === "tool_result" ? "yellow" : "white";
						return (
							<Box key={preview.timestamp + i} paddingLeft={1} marginTop={i > 0 ? 0 : 0}>
								<Text color={color} wrap="wrap">
									{icon} {preview.content}
								</Text>
							</Box>
						);
					})}
				</Box>
			)}
		</Box>
	);
}
