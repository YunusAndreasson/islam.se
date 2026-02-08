import { Box, Text, useInput } from "ink";
import type React from "react";
import { ScreenLayout } from "../components/ScreenLayout.js";
import { SelectableList } from "../components/SelectableList.js";
import type { CategorySummary } from "../types/index.js";
import { fixedWidth } from "../utils/format.js";

interface ArticleCategoryScreenProps {
	categories: CategorySummary[];
	onSelectCategory: (category: CategorySummary) => void;
	onBack: () => void;
}

function CategoryRow({
	category,
	focused,
}: {
	category: CategorySummary;
	focused: boolean;
}): React.ReactElement {
	const icon = category.name === "" ? "📥" : "📁";

	const countLabel = `${category.count}`.padStart(3);

	return (
		<Box>
			<Text
				backgroundColor={focused ? "#06b6d4" : undefined}
				color={focused ? "#000" : undefined}
				bold={focused}
			>
				{focused ? "❯" : " "} {icon} {fixedWidth(category.displayName, 40)}
			</Text>
			<Text dimColor> {countLabel} {category.count === 1 ? "article " : "articles"}</Text>
		</Box>
	);
}

export function ArticleCategoryScreen({
	categories,
	onSelectCategory,
	onBack,
}: ArticleCategoryScreenProps): React.ReactElement {
	const totalArticles = categories.reduce((sum, c) => sum + c.count, 0);

	useInput((input) => {
		if (input === "q") {
			onBack();
		}
	});

	return (
		<ScreenLayout
			shortcuts={[
				{ key: "j/k", label: "Navigate" },
				{ key: "Enter", label: "Open" },
				{ key: "q", label: "Back" },
			]}
			breadcrumb="Articles"
		>
			<Box marginBottom={1} gap={1}>
				<Text bold color="#06b6d4">
					📄 Articles
				</Text>
				<Text dimColor>({totalArticles} total)</Text>
			</Box>

			{categories.length === 0 ? (
				<Box padding={2}>
					<Text color="yellow">No articles published yet.</Text>
				</Box>
			) : (
				<SelectableList
					items={categories}
					renderItem={(category, focused) => <CategoryRow category={category} focused={focused} />}
					onSelect={onSelectCategory}
					onBack={onBack}
					maxVisible={15}
				/>
			)}
		</ScreenLayout>
	);
}
