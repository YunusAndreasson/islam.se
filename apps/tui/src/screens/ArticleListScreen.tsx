import { Box, Text } from "ink";
import React, { useMemo, useState } from "react";
import { ArticleMeta } from "../components/ArticleMeta.js";
import { CategoryPickerDialog } from "../components/CategoryPickerDialog.js";
import { ConfirmDialog } from "../components/ConfirmDialog.js";
import { ScreenLayout } from "../components/ScreenLayout.js";
import { SelectableList } from "../components/SelectableList.js";
import { loadArticleContent } from "../services/articleLoader.js";
import type { CategorySummary, PublishedArticle } from "../types/index.js";
import { formatDate, truncate } from "../utils/format.js";
import { renderMarkdown } from "../utils/renderMarkdown.js";

interface ArticleListScreenProps {
	categoryName: string;
	articles: PublishedArticle[];
	categories: CategorySummary[];
	onReadArticle: (article: PublishedArticle) => void;
	onMoveArticle: (slug: string, category: string) => void;
	onUnpublishArticle: (slug: string) => void;
	onBack: () => void;
}

function ArticleRow({
	article,
	focused,
}: {
	article: PublishedArticle;
	focused: boolean;
}): React.ReactElement {
	const score = article.qualityScore ? article.qualityScore.toFixed(1).padStart(4) : "  —";

	return (
		<Box>
			<Text
				backgroundColor={focused ? "#06b6d4" : undefined}
				color={focused ? "#000" : undefined}
				bold={focused}
				wrap="truncate-end"
			>
				{focused ? "❯" : " "} {article.title}
			</Text>
			<Text dimColor> {formatDate(article.publishedAt)}</Text>
			<Text color="yellow"> {score}</Text>
		</Box>
	);
}

const ArticlePreview = React.memo(function ArticlePreview({
	article,
}: {
	article: PublishedArticle;
}): React.ReactElement {
	const preview = useMemo(() => {
		const content = loadArticleContent(article.slug);
		if (!content) return "(Could not load content)";
		const rendered = renderMarkdown(content, 60);
		return rendered.split("\n").slice(0, 20).join("\n");
	}, [article.slug]);

	return (
		<Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="#0891b2">
			<Box flexDirection="column" marginBottom={1}>
				<Text bold color="#06b6d4">
					{article.title}
				</Text>
				<ArticleMeta
					publishedAt={article.publishedAt}
					wordCount={article.wordCount}
					qualityScore={article.qualityScore}
				/>
			</Box>
			<Text>{preview}</Text>
		</Box>
	);
});

export function ArticleListScreen({
	categoryName,
	articles,
	categories,
	onReadArticle,
	onMoveArticle,
	onUnpublishArticle,
	onBack,
}: ArticleListScreenProps): React.ReactElement {
	const [focusedArticle, setFocusedArticle] = useState<PublishedArticle | null>(
		articles[0] ?? null,
	);
	const [pendingUnpublish, setPendingUnpublish] = useState<PublishedArticle | null>(null);
	const [showCategoryPicker, setShowCategoryPicker] = useState<PublishedArticle | null>(null);

	const handleKey = (input: string, article: PublishedArticle) => {
		if (input === "q") {
			onBack();
		} else if (input === "m") {
			setShowCategoryPicker(article);
		} else if (input === "u") {
			setPendingUnpublish(article);
		}
	};

	const handleConfirmUnpublish = () => {
		if (pendingUnpublish) {
			onUnpublishArticle(pendingUnpublish.slug);
			setPendingUnpublish(null);
		}
	};

	const handleCategorySelect = (category: string) => {
		if (showCategoryPicker) {
			onMoveArticle(showCategoryPicker.slug, category);
			setShowCategoryPicker(null);
		}
	};

	const displayName = categoryName === "" ? "Inkorg" : categoryName;
	const isDialog = !!(pendingUnpublish || showCategoryPicker);

	const shortcuts = isDialog
		? [{ key: "Y/N", label: "Confirm/Cancel" }]
		: [
				{ key: "j/k", label: "Navigate" },
				{ key: "Enter", label: "Read" },
				{ key: "m", label: "Move" },
				{ key: "u", label: "Unpublish" },
				{ key: "q", label: "Back" },
			];

	return (
		<ScreenLayout shortcuts={shortcuts} breadcrumb={`Articles > ${displayName}`} fullWidth>
			{pendingUnpublish ? (
				<ConfirmDialog
					message={`Unpublish "${truncate(pendingUnpublish.title, 50)}"?`}
					onConfirm={handleConfirmUnpublish}
					onCancel={() => setPendingUnpublish(null)}
				/>
			) : showCategoryPicker ? (
				<CategoryPickerDialog
					currentCategory={showCategoryPicker.category || ""}
					categories={categories}
					onSelect={handleCategorySelect}
					onCancel={() => setShowCategoryPicker(null)}
				/>
			) : (
				<>
					<Box marginBottom={1} gap={1}>
						<Text bold color="#06b6d4">
							{categoryName === "" ? "📥 Inkorg" : `📁 ${categoryName}`}
						</Text>
						<Text dimColor>({articles.length} articles)</Text>
					</Box>

					<Box flexDirection="row" flexGrow={1}>
						<Box flexDirection="column" width="50%" paddingRight={1}>
							{articles.length === 0 ? (
								<Box padding={2}>
									<Text dimColor italic>
										No articles in this category
									</Text>
								</Box>
							) : (
								<SelectableList
									items={articles}
									renderItem={(article, focused) => (
										<ArticleRow article={article} focused={focused} />
									)}
									onSelect={onReadArticle}
									onBack={onBack}
									onKey={handleKey}
									onFocusChange={setFocusedArticle}
									maxVisible={12}
								/>
							)}
						</Box>

						<Box flexDirection="column" width="50%" overflowY="hidden">
							{focusedArticle ? (
								<ArticlePreview article={focusedArticle} />
							) : (
								<Box padding={2}>
									<Text dimColor italic>
										No article selected
									</Text>
								</Box>
							)}
						</Box>
					</Box>
				</>
			)}
		</ScreenLayout>
	);
}
