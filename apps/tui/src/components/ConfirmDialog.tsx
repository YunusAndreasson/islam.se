import { ConfirmInput } from "@inkjs/ui";
import { Box, Text } from "ink";
import type React from "react";

interface ConfirmDialogProps {
	message: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	message,
	onConfirm,
	onCancel,
}: ConfirmDialogProps): React.ReactElement {
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
				⚠️ Confirm
			</Text>
			<Text>{message}</Text>
			<Box gap={1}>
				<Text dimColor>Press</Text>
				<Text color="green" bold>
					Y
				</Text>
				<Text dimColor>to confirm or</Text>
				<Text color="red" bold>
					N
				</Text>
				<Text dimColor>to cancel</Text>
			</Box>
			<ConfirmInput onConfirm={onConfirm} onCancel={onCancel} />
		</Box>
	);
}
