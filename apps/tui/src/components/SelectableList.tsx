import { Box, Text, useFocus, useInput } from "ink";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface SelectableListProps<T> {
	items: T[];
	renderItem: (item: T, focused: boolean, index: number) => React.ReactNode;
	onSelect: (item: T, index: number) => void;
	onBack?: () => void;
	onKey?: (input: string, item: T, index: number) => void;
	onFocusChange?: (item: T, index: number) => void;
	maxVisible?: number;
	isActive?: boolean;
}

export function SelectableList<T>({
	items,
	renderItem,
	onSelect,
	onBack,
	onKey,
	onFocusChange,
	maxVisible = 10,
	isActive = true,
}: SelectableListProps<T>): React.ReactElement {
	const { isFocused } = useFocus({ autoFocus: true, isActive });
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Clamp selectedIndex if items change
	useEffect(() => {
		if (selectedIndex >= items.length && items.length > 0) {
			setSelectedIndex(items.length - 1);
		}
	}, [items.length, selectedIndex]);

	// Notify parent of initial focus on mount only
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally runs only on mount
	useEffect(() => {
		const firstItem = items[0];
		if (onFocusChange && firstItem) {
			onFocusChange(firstItem, 0);
		}
	}, []);

	const handleNavigation = useCallback(
		(newIndex: number) => {
			setSelectedIndex(newIndex);
			const item = items[newIndex];
			if (onFocusChange && item) {
				onFocusChange(item, newIndex);
			}
		},
		[items, onFocusChange],
	);

	const handleSelect = useCallback(() => {
		const item = items[selectedIndex];
		if (item) {
			onSelect(item, selectedIndex);
		}
	}, [items, selectedIndex, onSelect]);

	const handleCustomKey = useCallback(
		(input: string) => {
			const item = items[selectedIndex];
			if (onKey && item) {
				onKey(input, item, selectedIndex);
			}
		},
		[items, selectedIndex, onKey],
	);

	useInput(
		(input, key) => {
			if (!isFocused || items.length === 0) return;

			if (key.upArrow || (key.ctrl && input === "p")) {
				handleNavigation(Math.max(0, selectedIndex - 1));
			} else if (key.downArrow || (key.ctrl && input === "n")) {
				handleNavigation(Math.min(items.length - 1, selectedIndex + 1));
			} else if (key.return) {
				handleSelect();
			} else if (key.escape && onBack) {
				onBack();
			} else if (onKey) {
				handleCustomKey(input);
			}
		},
		{ isActive: isFocused },
	);

	if (items.length === 0) {
		return (
			<Box paddingY={1}>
				<Text dimColor italic>
					No items
				</Text>
			</Box>
		);
	}

	// Calculate visible window with smart scrolling
	const halfWindow = Math.floor(maxVisible / 2);
	let startIndex = Math.max(0, selectedIndex - halfWindow);
	const endIndex = Math.min(items.length, startIndex + maxVisible);
	if (endIndex - startIndex < maxVisible) {
		startIndex = Math.max(0, endIndex - maxVisible);
	}

	const visibleItems = items.slice(startIndex, endIndex);
	const showTopIndicator = startIndex > 0;
	const showBottomIndicator = endIndex < items.length;

	return (
		<Box flexDirection="column">
			{showTopIndicator && (
				<Text color="gray">
					{"  "}↑ {startIndex} more
				</Text>
			)}
			{visibleItems.map((item, i) => {
				const actualIndex = startIndex + i;
				return (
					<Box key={actualIndex}>
						{renderItem(item, actualIndex === selectedIndex, actualIndex)}
					</Box>
				);
			})}
			{showBottomIndicator && (
				<Text color="gray">
					{"  "}↓ {items.length - endIndex} more
				</Text>
			)}
		</Box>
	);
}
