import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeRunOptions } from "./claude-runner.js";

/**
 * Generate a URL-safe slug from text
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[åä]/g, "a")
		.replace(/[ö]/g, "o")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);
}

/**
 * Get model ID for Claude CLI
 */
export function getModelId(model: "opus" | "sonnet"): ClaudeRunOptions["model"] {
	return model === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-5-20250929";
}

/**
 * Create a logger that respects quiet mode
 */
export function createLogger(quiet: boolean) {
	return {
		log: (msg: string) => {
			if (!quiet) console.log(msg);
		},
		warn: (msg: string) => {
			if (!quiet) console.warn(msg);
		},
	};
}

/**
 * Save stage output to file
 */
export function saveOutput(dir: string, filename: string, data: unknown): void {
	const filepath = join(dir, filename);
	if (typeof data === "string") {
		writeFileSync(filepath, data, "utf-8");
	} else {
		writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
	}
}

/**
 * Load stage output from file
 */
export function loadOutput<T>(dir: string, filename: string): T | null {
	const filepath = join(dir, filename);
	if (!existsSync(filepath)) {
		return null;
	}
	const content = readFileSync(filepath, "utf-8");
	if (filename.endsWith(".json")) {
		return JSON.parse(content) as T;
	}
	return content as T;
}

/**
 * MCP tools allowed during the research stage
 */
export const RESEARCH_ALLOWED_TOOLS = [
	"mcp__quotes__search_quotes",
	"mcp__quotes__search_by_filter",
	"mcp__quotes__search_text",
	"mcp__quotes__get_inventory",
	"mcp__quotes__bulk_search",
	"mcp__quotes__search_quran",
	"mcp__quotes__search_books",
	"mcp__quotes__fetch_wikipedia",
	"WebSearch",
	"WebFetch",
	"Read",
];
