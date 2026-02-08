import { Marked } from "marked";
// @ts-expect-error -- marked-terminal has no type definitions
import { markedTerminal } from "marked-terminal";

const instanceCache = new Map<number, Marked>();

function getMarked(width: number): Marked {
	let instance = instanceCache.get(width);
	if (!instance) {
		instance = new Marked(markedTerminal({ reflowText: true, width }));
		instanceCache.set(width, instance);
	}
	return instance;
}

export function renderMarkdown(content: string, width = 80): string {
	return getMarked(width).parse(content) as string;
}
