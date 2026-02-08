import { Box, Text } from "ink";
import type React from "react";

export interface Shortcut {
	key: string;
	label: string;
}

interface StatusBarProps {
	shortcuts: Shortcut[];
	title?: string;
}

export function StatusBar({ shortcuts, title }: StatusBarProps): React.ReactElement {
	return (
		<Box gap={2}>
			{shortcuts.map((shortcut) => (
				<Box key={shortcut.key} gap={1}>
					<Text backgroundColor="#0891b2" color="#000" bold>
						{" "}
						{shortcut.key}{" "}
					</Text>
					<Text dimColor>{shortcut.label}</Text>
				</Box>
			))}
			{title && (
				<Text dimColor italic>
					{title}
				</Text>
			)}
		</Box>
	);
}
