import { TextInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";
import { useState } from "react";
import type { CategorySummary } from "../types/index.js";
import { SelectableList } from "./SelectableList.js";

interface CategoryPickerDialogProps {
	currentCategory: string;
	categories: CategorySummary[];
	onSelect: (category: string) => void;
	onCancel: () => void;
}

interface PickerItem {
	id: string;
	label: string;
	isNew: boolean;
}

export function CategoryPickerDialog({
	currentCategory,
	categories,
	onSelect,
	onCancel,
}: CategoryPickerDialogProps): React.ReactElement {
	const [isCreating, setIsCreating] = useState(false);

	// Build list: all categories except current, plus "New category..."
	const items: PickerItem[] = categories
		.filter((c) => c.name !== currentCategory)
		.map((c) => ({
			id: c.name,
			label: c.name === "" ? "📥 Inkorg" : `📁 ${c.displayName}`,
			isNew: false,
		}));
	items.push({ id: "__new__", label: "✨ New category...", isNew: true });

	const handleSelect = (item: PickerItem) => {
		if (item.isNew) {
			setIsCreating(true);
		} else {
			onSelect(item.id);
		}
	};

	const handleNewSubmit = (value: string) => {
		const trimmed = value.trim();
		if (trimmed) {
			onSelect(trimmed);
		} else {
			setIsCreating(false);
		}
	};

	return (
		<Box
			flexDirection="column"
			borderStyle="double"
			borderColor="yellow"
			paddingX={2}
			paddingY={1}
			gap={1}
		>
			<Text bold color="yellow">
				Move to category
			</Text>

			{isCreating ? (
				<Box flexDirection="column" gap={1}>
					<Text>Enter new category name:</Text>
					<Box>
						<Text color="#06b6d4">{"❯ "}</Text>
						<TextInput placeholder="Category name..." onSubmit={handleNewSubmit} />
					</Box>
					<Text dimColor>[Enter] Confirm | [Esc] Cancel</Text>
				</Box>
			) : (
				<SelectableList
					items={items}
					renderItem={(item, focused) => (
						<Box gap={1}>
							<Text
								backgroundColor={focused ? "#06b6d4" : undefined}
								color={focused ? "#000" : undefined}
								bold={focused}
							>
								{focused ? "❯" : " "} {item.label}
							</Text>
						</Box>
					)}
					onSelect={handleSelect}
					onBack={onCancel}
					maxVisible={10}
				/>
			)}
		</Box>
	);
}
