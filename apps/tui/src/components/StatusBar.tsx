import { Box, Text } from "ink";
import type React from "react";

interface Shortcut {
	key: string;
	label: string;
}

interface StatusBarProps {
	shortcuts: Shortcut[];
	title?: string;
}

export function StatusBar({ shortcuts, title }: StatusBarProps): React.ReactElement {
	return (
		<Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
			<Box gap={2}>
				{shortcuts.map((shortcut, i) => (
					<Box key={shortcut.key} gap={1}>
						<Text backgroundColor="gray" color="white">
							{" "}
							{shortcut.key}{" "}
						</Text>
						<Text dimColor>{shortcut.label}</Text>
						{i < shortcuts.length - 1 && <Text dimColor>│</Text>}
					</Box>
				))}
			</Box>
			{title && (
				<Text dimColor italic>
					{title}
				</Text>
			)}
		</Box>
	);
}
