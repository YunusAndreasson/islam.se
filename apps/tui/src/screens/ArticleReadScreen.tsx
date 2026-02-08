import { Box, Text, useInput, useStdout } from "ink";
import type React from "react";
import { useMemo, useState } from "react";
import { ArticleMeta } from "../components/ArticleMeta.js";
import { ScreenLayout } from "../components/ScreenLayout.js";
import type { PublishedArticle } from "../types/index.js";
import { truncate } from "../utils/format.js";
import { renderMarkdown } from "../utils/renderMarkdown.js";

interface ArticleReadScreenProps {
	article: PublishedArticle;
	categoryName?: string;
	content: string;
	onBack: () => void;
}

export function ArticleReadScreen({
	article,
	categoryName,
	content,
	onBack,
}: ArticleReadScreenProps): React.ReactElement {
	const { stdout } = useStdout();
	const terminalHeight = stdout?.rows ?? 24;
	const terminalWidth = stdout?.columns ?? 80;
	const viewHeight = terminalHeight - 18; // banner + header + breadcrumb + statusbar + padding

	const [scrollOffset, setScrollOffset] = useState(0);

	const lines = useMemo(() => {
		const rendered = renderMarkdown(content, Math.min(terminalWidth - 4, 100));
		return rendered.split("\n");
	}, [content, terminalWidth]);

	const maxScroll = Math.max(0, lines.length - viewHeight);

	useInput((input, key) => {
		if (input === "q" || key.escape) {
			onBack();
		} else if (input === "j" || key.downArrow) {
			setScrollOffset((s) => Math.min(s + 1, maxScroll));
		} else if (input === "k" || key.upArrow) {
			setScrollOffset((s) => Math.max(s - 1, 0));
		} else if (input === "d") {
			setScrollOffset((s) => Math.min(s + Math.floor(viewHeight / 2), maxScroll));
		} else if (input === "u") {
			setScrollOffset((s) => Math.max(s - Math.floor(viewHeight / 2), 0));
		} else if (input === "g") {
			setScrollOffset(0);
		} else if (input === "G") {
			setScrollOffset(maxScroll);
		}
	});

	const visibleLines = lines.slice(scrollOffset, scrollOffset + viewHeight);
	const position =
		lines.length > viewHeight
			? `${scrollOffset + 1}-${Math.min(scrollOffset + viewHeight, lines.length)}/${lines.length}`
			: `${lines.length} lines`;

	const displayCategory = categoryName || article.category || "";
	const titleShort = truncate(article.title, 60);
	const breadcrumb = displayCategory
		? `Articles > ${displayCategory} > ${titleShort}`
		: `Articles > ${titleShort}`;

	return (
		<ScreenLayout
			shortcuts={[
				{ key: "j/k", label: "Scroll" },
				{ key: "d/u", label: "Page" },
				{ key: "g/G", label: "Top/Bottom" },
				{ key: "q", label: "Back" },
			]}
			statusTitle={position}
			breadcrumb={breadcrumb}
		>
			{/* Header */}
			<Box marginBottom={1} gap={2}>
				<Text bold color="#06b6d4">
					{article.title}
				</Text>
			</Box>
			<Box marginBottom={1}>
				<ArticleMeta
					publishedAt={article.publishedAt}
					wordCount={article.wordCount}
					qualityScore={article.qualityScore}
				/>
			</Box>

			{/* Content */}
			<Box flexDirection="column" height={viewHeight}>
				{visibleLines.map((line, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: scroll view lines keyed by offset
					<Text key={scrollOffset + i}>{line}</Text>
				))}
			</Box>
		</ScreenLayout>
	);
}
