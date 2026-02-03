import { Box, Text, useInput } from "ink";
import type React from "react";
import type { EnrichedIdea } from "../types/index.js";

interface IdeaDetailScreenProps {
	idea: EnrichedIdea;
	onProduce: () => void;
	onBack: () => void;
}

function QuoteBlock({ quote }: { quote: EnrichedIdea["quotes"][number] }): React.ReactElement {
	return (
		<Box flexDirection="column" marginY={1} paddingLeft={2}>
			<Text italic color="gray">
				"{quote.text.slice(0, 200)}
				{quote.text.length > 200 ? "..." : ""}"
			</Text>
			<Text dimColor>
				{" "}
				— {quote.author}
				{quote.source ? `, ${quote.source}` : ""}
			</Text>
		</Box>
	);
}

export function IdeaDetailScreen({
	idea,
	onProduce,
	onBack,
}: IdeaDetailScreenProps): React.ReactElement {
	useInput((input, key) => {
		if (input === "p") {
			onProduce();
		}
		if (key.escape) {
			onBack();
		}
	});

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Idea #{idea.id}
				</Text>
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
						<QuoteBlock key={quote.text} quote={quote} />
					))}
					{idea.quotes.length > 3 && (
						<Box paddingLeft={2}>
							<Text dimColor>... and {idea.quotes.length - 3} more</Text>
						</Box>
					)}
				</Box>
			)}

			<Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
				<Text dimColor>[p] Produce article [Esc] Back</Text>
			</Box>
		</Box>
	);
}
