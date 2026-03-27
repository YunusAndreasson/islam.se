import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeRunOptions } from "./claude-runner.js";

/**
 * Generate a URL-safe slug from text.
 * Handles Swedish characters and falls back to a hash for non-Latin text (e.g. Arabic).
 */
export function slugify(text: string): string {
	let slug = text
		.toLowerCase()
		.replace(/[åä]/g, "a")
		.replace(/[ö]/g, "o")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

	// Truncate at word boundary (hyphen) within limit, never leave trailing hyphen
	if (slug.length > 50) {
		const lastHyphen = slug.lastIndexOf("-", 50);
		slug = lastHyphen > 10 ? slug.slice(0, lastHyphen) : slug.slice(0, 50);
	}
	slug = slug.replace(/-$/, "");

	// Fallback for text with no Latin characters (e.g. Arabic topics)
	if (!slug) {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
		}
		slug = `topic-${Math.abs(hash).toString(36)}`;
	}

	return slug;
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
 * Format milliseconds as a human-readable duration (e.g. "2m 30s", "45s")
 */
export function formatDuration(ms: number): string {
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Swedish authors in the quote database, ordered by quote count.
 * Used to vary which authors are suggested in prompts so the pipeline
 * doesn't always gravitate toward Strindberg/Lagerlöf/Söderberg.
 */
const SWEDISH_AUTHORS = [
	"August Strindberg",
	"Ellen Key",
	"Hjalmar Söderberg",
	"Viktor Rydberg",
	"Johan Ludvig Runeberg",
	"Hjalmar Bergman",
	"Zacharias Topelius",
	"August Blanche",
	"Erik Gustaf Geijer",
	"Karin Boye",
	"Selma Lagerlöf",
	"Fredrika Bremer",
	"Carl von Linné",
	"Gustaf af Geijerstam",
	"Minna Canth",
	"Victoria Benedictsson",
	"Per Hallström",
	"Ester Blenda Nordström",
	"Oscar Levertin",
	"Verner von Heidenstam",
	"Dan Andersson",
	"Anne Charlotte Leffler",
	"C. J. L. Almqvist",
	"Albert Engström",
	"Esaias Tegnér",
];

/**
 * Pick N random Swedish authors from the database pool.
 * Always includes 1 from the top 5 (well-known) and the rest from the wider pool,
 * to balance recognizability with variety.
 */
export function pickSwedishAuthors(count = 4): string[] {
	// Fisher-Yates shuffle on a copy
	const pool = [...SWEDISH_AUTHORS];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const tmp = pool[i] as string;
		pool[i] = pool[j] as string;
		pool[j] = tmp;
	}
	// Ensure at least 1 top-5 author (well-known) ends up in the pick
	const top5 = new Set(SWEDISH_AUTHORS.slice(0, 5));
	const fromTop = pool.filter((a) => top5.has(a));
	const fromRest = pool.filter((a) => !top5.has(a));
	const result: string[] = [];
	if (fromTop.length > 0) result.push(fromTop[0] as string);
	for (const a of fromRest) {
		if (result.length >= count) break;
		result.push(a);
	}
	return result;
}

/**
 * MCP tools allowed during the research stage
 */
export const RESEARCH_ALLOWED_TOOLS = [
	"mcp__quotes__search_quotes",
	"mcp__quotes__search_by_filter",
	"mcp__quotes__search_text",
	"mcp__quotes__get_quote_by_id",
	"mcp__quotes__get_inventory",
	"mcp__quotes__bulk_search",
	"mcp__quotes__search_quran",
	"mcp__quotes__search_books",
	"mcp__quotes__fetch_wikipedia",
	"WebSearch",
	"WebFetch",
	"Read",
];
