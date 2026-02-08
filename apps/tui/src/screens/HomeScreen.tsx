import { Box, Text, useInput } from "ink";
import type React from "react";
import { ScreenLayout } from "../components/ScreenLayout.js";
import { SelectableList } from "../components/SelectableList.js";

interface HomeScreenProps {
	onSelectIdeas: () => void;
	onSelectArticles: () => void;
	onQuit: () => void;
}

interface MenuItem {
	id: string;
	label: string;
	icon: string;
	description: string;
}

const MENU_ITEMS: MenuItem[] = [
	{ id: "ideas", label: "Ideas", icon: "💡", description: "Browse topics and produce articles" },
	{ id: "articles", label: "Articles", icon: "📄", description: "Manage published articles" },
];

function MenuRow({ item, focused }: { item: MenuItem; focused: boolean }): React.ReactElement {
	return (
		<Box gap={1}>
			<Text
				backgroundColor={focused ? "#06b6d4" : undefined}
				color={focused ? "#000" : undefined}
				bold={focused}
			>
				{focused ? "❯" : " "} {item.icon} {item.label}
			</Text>
			<Text dimColor>— {item.description}</Text>
		</Box>
	);
}

export function HomeScreen({
	onSelectIdeas,
	onSelectArticles,
	onQuit,
}: HomeScreenProps): React.ReactElement {
	useInput((input) => {
		if (input === "q") {
			onQuit();
		}
	});

	const handleSelect = (item: MenuItem) => {
		if (item.id === "ideas") onSelectIdeas();
		else if (item.id === "articles") onSelectArticles();
	};

	return (
		<ScreenLayout
			shortcuts={[
				{ key: "j/k", label: "Navigate" },
				{ key: "Enter", label: "Select" },
				{ key: "q", label: "Quit" },
			]}
		>
			<Box marginBottom={1}>
				<Text bold>Main Menu</Text>
			</Box>

			<SelectableList
				items={MENU_ITEMS}
				renderItem={(item, focused) => <MenuRow item={item} focused={focused} />}
				onSelect={handleSelect}
				maxVisible={5}
			/>
		</ScreenLayout>
	);
}
