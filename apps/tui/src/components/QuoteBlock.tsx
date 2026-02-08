import { Box, Text } from "ink";
import type React from "react";
import { truncate } from "../utils/format.js";

interface QuoteBlockProps {
	text: string;
	author: string;
	source?: string;
	maxLength?: number;
}

export function QuoteBlock({
	text,
	author,
	source,
	maxLength = 200,
}: QuoteBlockProps): React.ReactElement {
	return (
		<Box flexDirection="column" paddingLeft={2}>
			<Text italic dimColor wrap="wrap">
				"{truncate(text, maxLength)}"
			</Text>
			<Text dimColor>
				— {author}
				{source ? `, ${source}` : ""}
			</Text>
		</Box>
	);
}
