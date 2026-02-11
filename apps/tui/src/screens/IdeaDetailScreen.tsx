import { Box, Text, useInput } from "ink";
import type React from "react";
import { QuoteBlock } from "../components/QuoteBlock.js";
import { ScreenLayout } from "../components/ScreenLayout.js";
import type { EnrichedIdea } from "../types/index.js";

interface IdeaDetailScreenProps {
	idea: EnrichedIdea;
	topicName?: string;
	onProduce: () => void;
	onBack: () => void;
}

export function IdeaDetailScreen({
	idea,
	topicName,
	onProduce,
	onBack,
}: IdeaDetailScreenProps): React.ReactElement {
	const status = idea.productionStatus;
	const isDone = status?.status === "done";

	useInput((input, key) => {
		if (input === "p") {
			onProduce();
		}
		if (input === "q" || key.escape) {
			onBack();
		}
	});

	return (
		<ScreenLayout
			shortcuts={[
				{ key: "p", label: isDone ? "Re-produce" : "Produce" },
				{ key: "q", label: "Back" },
			]}
			breadcrumb={topicName ? `Ideas > ${topicName} > #${idea.id}` : `Ideas > #${idea.id}`}
		>
			<Box marginBottom={1} gap={2}>
				<Text bold color="#06b6d4">
					Idea #{idea.id}
				</Text>
				{idea.score != null && (
					<Text bold color={idea.score >= 8 ? "#22c55e" : idea.score >= 6 ? "#eab308" : "#ef4444"}>
						Score: {idea.score}/10
					</Text>
				)}
				{idea.difficulty && <Text dimColor>[{idea.difficulty}]</Text>}
				{isDone && (
					<Text color="green">
						✓ Published{status.articleSlug ? ` as ${status.articleSlug}` : ""}
					</Text>
				)}
				{status?.status === "in_progress" && <Text color="yellow">◐ In progress</Text>}
				{status?.status === "failed" && (
					<Text color="red">✗ Failed{status.failureReason ? `: ${status.failureReason}` : ""}</Text>
				)}
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Title:</Text>
				<Box paddingLeft={2}>
					<Text>{idea.title}</Text>
				</Box>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Thesis:</Text>
				<Box paddingLeft={2}>
					<Text wrap="wrap">{idea.thesis}</Text>
				</Box>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Angle:</Text>
				<Box paddingLeft={2}>
					<Text wrap="wrap">{idea.angle}</Text>
				</Box>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold>Keywords:</Text>
				<Box paddingLeft={2}>
					<Text color="yellow">{idea.keywords.join(", ")}</Text>
				</Box>
			</Box>

			{idea.quotes && idea.quotes.length > 0 && (
				<Box flexDirection="column" marginBottom={1}>
					<Text bold>Related Quotes ({idea.quotes.length}):</Text>
					{idea.quotes.slice(0, 3).map((quote) => (
						<Box key={quote.text} marginY={1}>
							<QuoteBlock text={quote.text} author={quote.author} source={quote.source} />
						</Box>
					))}
					{idea.quotes.length > 3 && (
						<Box paddingLeft={2}>
							<Text dimColor>... and {idea.quotes.length - 3} more</Text>
						</Box>
					)}
				</Box>
			)}

			{isDone && status.producedAt && (
				<Box flexDirection="column" marginBottom={1}>
					<Text bold>Production Info:</Text>
					<Box paddingLeft={2} flexDirection="column">
						<Text dimColor>Produced: {new Date(status.producedAt).toLocaleString()}</Text>
						{status.articleSlug && (
							<Text dimColor>Article: data/articles/{status.articleSlug}.md</Text>
						)}
					</Box>
				</Box>
			)}
		</ScreenLayout>
	);
}
