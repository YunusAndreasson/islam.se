import { Box, Text } from "ink";
import type React from "react";
import { Banner } from "./Banner.js";
import type { Shortcut } from "./StatusBar.js";
import { StatusBar } from "./StatusBar.js";

interface ScreenLayoutProps {
	children: React.ReactNode;
	shortcuts: Shortcut[];
	statusTitle?: string;
	breadcrumb?: string;
	fullWidth?: boolean;
}

export function ScreenLayout({
	children,
	shortcuts,
	statusTitle,
	breadcrumb,
}: ScreenLayoutProps): React.ReactElement {
	return (
		<Box flexDirection="column" paddingLeft={1}>
			<Banner />

			<Box
				flexDirection="column"
				flexGrow={1}
				borderStyle="round"
				borderColor="#155e75"
				paddingX={1}
			>
				{breadcrumb && (
					<Box marginBottom={1}>
						<Text dimColor>{breadcrumb}</Text>
					</Box>
				)}

				{children}
			</Box>

			<Box marginTop={1}>
				<StatusBar shortcuts={shortcuts} title={statusTitle} />
			</Box>
		</Box>
	);
}
