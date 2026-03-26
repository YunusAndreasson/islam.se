import { ProgressBar } from "@inkjs/ui";
import { Box, Text, useInput, useStdout } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import { ScreenLayout } from "../components/ScreenLayout.js";
import type { BatchStatus, PipelineStatus, StageInfo } from "../types/index.js";
import { fixedWidth, truncate } from "../utils/format.js";

// --- Shared helpers ---

const SPINNER_FRAMES = ["◐", "◓", "◑", "◒"];

function SlowSpinner(): React.ReactElement {
	const [frame, setFrame] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => {
			setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
		}, 500);
		return () => clearInterval(interval);
	}, []);
	return <Text color="#06b6d4">{SPINNER_FRAMES[frame]}</Text>;
}

function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

// --- Compact stage trail for the active item ---

const STAGES = [
	"research",
	"factCheck",
	"authoring",
	"review",
	"polish",
	"language",
	"swedishVoice",
] as const;
const STAGE_ICONS: Record<(typeof STAGES)[number], string> = {
	research: "📚",
	factCheck: "🔍",
	authoring: "✍️",
	review: "👁️",
	polish: "🖊️",
	language: "🇸🇪",
	swedishVoice: "🗣️",
};

function stageChar(info: StageInfo): string {
	switch (info.status) {
		case "complete":
			return "✓";
		case "running":
			return "~";
		case "failed":
			return "✗";
		default:
			return "·";
	}
}

function stageColor(info: StageInfo): string {
	switch (info.status) {
		case "complete":
			return "green";
		case "running":
			return "#06b6d4";
		case "failed":
			return "red";
		default:
			return "gray";
	}
}

function CompactStageTrail({ pipeline }: { pipeline: PipelineStatus }): React.ReactElement {
	return (
		<Box gap={0}>
			{STAGES.map((stage) => {
				const info = pipeline.stages[stage];
				return (
					<Box key={stage} gap={0}>
						<Text>{STAGE_ICONS[stage]}</Text>
						<Text color={stageColor(info)}>{stageChar(info)} </Text>
					</Box>
				);
			})}
		</Box>
	);
}

// --- Elapsed timer ---

function ElapsedTimer({ since }: { since: Date }): React.ReactElement {
	const [elapsed, setElapsed] = useState(() => Date.now() - since.getTime());
	useEffect(() => {
		const interval = setInterval(() => {
			setElapsed(Date.now() - since.getTime());
		}, 5000);
		return () => clearInterval(interval);
	}, [since]);
	return <Text dimColor>{formatDuration(elapsed)}</Text>;
}

// --- Main screen ---

interface BatchPipelineScreenProps {
	batchStatus: BatchStatus;
	completed: boolean;
	onBack: () => void;
}

export function BatchPipelineScreen({
	batchStatus,
	completed,
	onBack,
}: BatchPipelineScreenProps): React.ReactElement {
	const { stdout } = useStdout();
	const terminalWidth = stdout?.columns ?? 80;
	const progressBarWidth = Math.max(15, Math.floor(terminalWidth * 0.3));

	useInput((input, key) => {
		if (completed && (input === "q" || key.escape || key.return)) {
			onBack();
		}
	});

	const { items, currentIndex, results } = batchStatus;
	const total = items.length;
	const successCount = results.filter((r) => r.success).length;
	const failCount = results.filter((r) => !r.success).length;
	const batchProgress = Math.round((results.length / total) * 100);

	return (
		<ScreenLayout
			shortcuts={completed ? [{ key: "q", label: "Back" }] : []}
			breadcrumb="Batch Production"
		>
			{/* Header */}
			<Box
				marginBottom={1}
				borderStyle={completed ? (failCount === total ? "bold" : "double") : "single"}
				borderColor={completed ? (failCount === total ? "red" : "green") : "#06b6d4"}
				paddingX={2}
				justifyContent="center"
			>
				{completed ? (
					<Text bold color={failCount === total ? "red" : "green"}>
						Batch Complete — {successCount} produced
						{failCount > 0 ? `, ${failCount} failed` : ""}
					</Text>
				) : (
					<Box gap={1}>
						<SlowSpinner />
						<Text bold color="#06b6d4">
							Producing {currentIndex + 1} of {total}
						</Text>
					</Box>
				)}
			</Box>

			{/* Queue list — one compact line per item */}
			<Box flexDirection="column">
				{items.map((item, i) => {
					const result = results[i];
					const isCurrent = i === currentIndex && !completed;
					const pipeline = isCurrent ? batchStatus.currentPipelineStatus : null;

					// Completed item
					if (result) {
						return (
							<Box key={`${item.topicSlug}:${item.idea.id}`}>
								<Text color={result.success ? "green" : "red"}>{result.success ? "✓" : "✗"}</Text>
								<Text dimColor> {String(i + 1).padStart(2)}. </Text>
								<Text color={result.success ? undefined : "red"}>
									{fixedWidth(item.idea.title, 55)}
								</Text>
								<Text dimColor> {fixedWidth(item.topicName, 20)}</Text>
								{result.success ? (
									<Text dimColor>
										{" "}
										{String(result.wordCount ?? 0).padStart(5)}w{" "}
										{(result.qualityScore ?? 0).toFixed(1)}/10 ({formatDuration(result.duration)})
									</Text>
								) : (
									<Text color="red"> {truncate(result.error ?? "Failed", 30)}</Text>
								)}
							</Box>
						);
					}

					// Active item
					if (isCurrent) {
						return (
							<Box key={`${item.topicSlug}:${item.idea.id}`}>
								<SlowSpinner />
								<Text dimColor> {String(i + 1).padStart(2)}. </Text>
								<Text bold color="#06b6d4">
									{fixedWidth(item.idea.title, 55)}
								</Text>
								<Text dimColor> {fixedWidth(item.topicName, 20)}</Text>
								{pipeline && <Text> </Text>}
								{pipeline && <CompactStageTrail pipeline={pipeline} />}
							</Box>
						);
					}

					// Pending item
					return (
						<Box key={`${item.topicSlug}:${item.idea.id}`}>
							<Text color="gray">○</Text>
							<Text dimColor> {String(i + 1).padStart(2)}. </Text>
							<Text color="gray">{fixedWidth(item.idea.title, 55)}</Text>
							<Text dimColor> {fixedWidth(item.topicName, 20)}</Text>
						</Box>
					);
				})}
			</Box>

			{/* Overall batch progress bar */}
			<Box marginTop={1} gap={1}>
				<Text dimColor>Batch:</Text>
				<Box width={progressBarWidth}>
					<ProgressBar value={batchProgress} />
				</Box>
				<Text dimColor>
					{results.length}/{total}
				</Text>
				<Text dimColor>•</Text>
				<ElapsedTimer since={batchStatus.startedAt} />
			</Box>

			{/* Live preview for the active item */}
			{!completed && batchStatus.currentPipelineStatus?.previews?.length ? (
				<Box
					flexDirection="column"
					marginTop={1}
					borderStyle="round"
					borderColor="#0891b2"
					paddingX={1}
				>
					<Text bold color="#06b6d4">
						💭 Live Output
					</Text>
					{batchStatus.currentPipelineStatus.previews.slice(-5).map((preview) => {
						const icon = preview.type === "tool_result" ? "📜" : "✍️";
						const color = preview.type === "tool_result" ? "yellow" : "white";
						return (
							<Box key={preview.timestamp} paddingLeft={1}>
								<Text color={color} wrap="wrap">
									{icon} {preview.content}
								</Text>
							</Box>
						);
					})}
				</Box>
			) : null}

			{/* Completion totals */}
			{completed && (
				<Box marginTop={1} flexDirection="column">
					<Box gap={2}>
						{successCount > 0 && (
							<Text color="green">
								{successCount} article{successCount === 1 ? "" : "s"} published
							</Text>
						)}
						{failCount > 0 && <Text color="red">{failCount} failed</Text>}
					</Box>
					<Text dimColor>
						Total time: {formatDuration(Date.now() - batchStatus.startedAt.getTime())}
					</Text>
				</Box>
			)}
		</ScreenLayout>
	);
}
