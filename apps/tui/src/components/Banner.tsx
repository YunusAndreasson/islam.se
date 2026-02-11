import { Box, Text } from "ink";
import React from "react";

const ASCII_LINES = [
	"`7MMF'  .M\"\"\"bgd `7MMF'              db      `7MMM.     ,MMF'",
	'  MM   ,MI    "Y   MM               ;MM:       MMMb    dPMM  ',
	"  MM   `MMb.       MM              ,V^MM.      M YM   ,M MM  ",
	"  MM     `YMMNq.   MM             ,M  `MM      M  Mb  M' MM  ",
	"  MM   .     `MM   MM      ,      AbmmmqMA     M  YM.P'  MM  ",
	"  MM   Mb     dM   MM     ,M     A'     VML    M  `YM'   MM  ",
	'.JMML. P"Ybmmd"  .JMMmmmmMMM   .AMA.   .AMMA..JML. `\'  .JMML.',
];

const UNDERLINE = "_______________________________________________________________";
const SUBTITLE = "   ::: c o n t e n t   s t u d i o  :::  e s t   2 0 2 5 :::";

type RGB = [number, number, number];

const GRADIENT_STOPS: RGB[] = [
	[21, 94, 117], // #155e75 dark teal
	[8, 145, 178], // #0891b2 teal
	[6, 182, 212], // #06b6d4 cyan
	[34, 211, 238], // #22d3ee bright cyan
	[186, 230, 253], // #bae6fd ice
];

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
	return [
		Math.round(a[0] + (b[0] - a[0]) * t),
		Math.round(a[1] + (b[1] - a[1]) * t),
		Math.round(a[2] + (b[2] - a[2]) * t),
	];
}

function rgbToHex([r, g, b]: RGB): string {
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function gradientColor(t: number): string {
	const segments = GRADIENT_STOPS.length - 1;
	const segment = Math.min(Math.floor(t * segments), segments - 1);
	const localT = t * segments - segment;
	// biome-ignore lint/style/noNonNullAssertion: indices always in bounds
	return rgbToHex(lerpRGB(GRADIENT_STOPS[segment]!, GRADIENT_STOPS[segment + 1]!, localT));
}

const CONTENT_WIDTH = 62;

function GradientLine({
	text,
	verticalShift,
}: {
	text: string;
	verticalShift: number;
}): React.ReactElement {
	const chars: React.ReactElement[] = [];
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === " ") {
			chars.push(<Text key={i}> </Text>);
		} else {
			const t = Math.max(0, Math.min(1, i / CONTENT_WIDTH));
			const shifted = Math.max(0, Math.min(1, t + verticalShift * 0.06));
			chars.push(
				<Text key={i} color={gradientColor(shifted)}>
					{ch}
				</Text>,
			);
		}
	}
	return <Text>{chars}</Text>;
}

export const Banner = React.memo(function Banner(): React.ReactElement {
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text> </Text>
			{ASCII_LINES.map((line, i) => (
				<GradientLine key={line} text={line} verticalShift={i} />
			))}
			<Text color="#0891b2">{UNDERLINE}</Text>
			<Text> </Text>
			<Text color="yellow">{SUBTITLE}</Text>
			<Text color="#0891b2">{UNDERLINE}</Text>
		</Box>
	);
});
