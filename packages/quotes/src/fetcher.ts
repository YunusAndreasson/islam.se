import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Find the project root (where this package is installed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..");
const SOURCES_DIR = join(PROJECT_ROOT, "data", "sources");

/**
 * Result of fetching a text from a URL
 */
export interface FetchResult {
	url: string;
	filename: string;
	text: string;
	cached: boolean;
}

/**
 * Strips Gutenberg headers and footers from the text.
 * Gutenberg texts typically have:
 * - Header ending with "*** START OF THE PROJECT GUTENBERG EBOOK..."
 * - Footer starting with "*** END OF THE PROJECT GUTENBERG EBOOK..."
 */
function stripGutenbergBoilerplate(text: string): string {
	// Patterns for start markers (case insensitive)
	const startPatterns = [
		/\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^\n]*\*{3}/i,
		/\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG[^\n]*\*{3}/i,
	];

	// Patterns for end markers (case insensitive)
	const endPatterns = [
		/\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^\n]*\*{3}/i,
		/\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG[^\n]*\*{3}/i,
	];

	let result = text;

	// Find and strip header
	for (const pattern of startPatterns) {
		const match = result.match(pattern);
		if (match?.index !== undefined) {
			result = result.slice(match.index + match[0].length);
			break;
		}
	}

	// Find and strip footer
	for (const pattern of endPatterns) {
		const match = result.match(pattern);
		if (match?.index !== undefined) {
			result = result.slice(0, match.index);
			break;
		}
	}

	return result.trim();
}

/**
 * Generates a filename from a URL using its hash and a readable portion
 */
function generateFilename(url: string): string {
	const hash = createHash("md5").update(url).digest("hex").slice(0, 8);

	// Try to extract book ID from Gutenberg URL
	const gutenbergMatch = url.match(/pg(\d+)\.txt/);
	if (gutenbergMatch) {
		return `gutenberg-${gutenbergMatch[1]}-${hash}.txt`;
	}

	// Fallback to hash-based filename
	return `source-${hash}.txt`;
}

/**
 * Fetches a text file from a URL.
 * - Caches the result in data/sources/
 * - Strips Gutenberg headers/footers automatically
 */
export async function fetchText(url: string): Promise<FetchResult> {
	// Ensure sources directory exists
	if (!existsSync(SOURCES_DIR)) {
		mkdirSync(SOURCES_DIR, { recursive: true });
	}

	const filename = generateFilename(url);
	const filepath = join(SOURCES_DIR, filename);

	// Check cache
	if (existsSync(filepath)) {
		const text = readFileSync(filepath, "utf-8");
		return { url, filename, text, cached: true };
	}

	// Fetch from URL
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	const rawText = await response.text();
	const text = stripGutenbergBoilerplate(rawText);

	// Cache the stripped text
	writeFileSync(filepath, text, "utf-8");

	return { url, filename, text, cached: false };
}

/**
 * Fetches multiple texts from URLs in parallel
 */
export async function fetchTexts(urls: string[]): Promise<FetchResult[]> {
	return Promise.all(urls.map(fetchText));
}
