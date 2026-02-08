import { Box, Text } from "ink";
import type React from "react";
import { formatDate } from "../utils/format.js";

interface ArticleMetaProps {
	publishedAt: string;
	wordCount: number;
	qualityScore?: number;
}

export function ArticleMeta({
	publishedAt,
	wordCount,
	qualityScore,
}: ArticleMetaProps): React.ReactElement {
	return (
		<Box gap={2}>
			<Text dimColor>{formatDate(publishedAt)}</Text>
			<Text dimColor>{wordCount} words</Text>
			{qualityScore != null && <Text color="yellow">Score: {qualityScore.toFixed(1)}</Text>}
		</Box>
	);
}
