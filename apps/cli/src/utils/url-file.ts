import { readFileSync, writeFileSync } from "node:fs";

/**
 * Mark a URL as done in the file by prefixing its line with "# DONE "
 */
export function markUrlAsDone(filePath: string, url: string): void {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const updatedLines = lines.map((line) => {
		if (line.trim() === url) {
			return `# DONE ${line}`;
		}
		return line;
	});
	writeFileSync(filePath, updatedLines.join("\n"), "utf-8");
}

/**
 * Parse URL file and return pending/done URLs
 */
export function parseUrlFile(filePath: string): {
	pending: string[];
	done: string[];
	total: number;
} {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split("\n");

	const pending: string[] = [];
	const done: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Check for done marker
		if (trimmed.startsWith("# DONE ")) {
			const url = trimmed.slice(7).trim();
			if (url.startsWith("http")) {
				done.push(url);
			}
		} else if (trimmed.startsWith("http")) {
			pending.push(trimmed);
		}
	}

	return { pending, done, total: pending.length + done.length };
}

/**
 * Reset done markers in a URL file
 */
export function resetUrlFile(filePath: string): void {
	const content = readFileSync(filePath, "utf-8");
	const resetContent = content.replace(/^# DONE /gm, "");
	writeFileSync(filePath, resetContent, "utf-8");
}
