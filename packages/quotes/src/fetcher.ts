import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

// Find the project root (where this package is installed)
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..");
const SOURCES_DIR = join(PROJECT_ROOT, "data", "sources");
const FETCH_TIMEOUT_MS = 30000;

/**
 * Checks if a path/URL refers to a local file
 */
function isLocalFile(urlOrPath: string): boolean {
	return (
		urlOrPath.startsWith("file://") ||
		urlOrPath.startsWith("/") ||
		urlOrPath.startsWith("./") ||
		urlOrPath.startsWith("../") ||
		// Windows absolute paths
		/^[a-zA-Z]:[\\/]/.test(urlOrPath)
	);
}

/**
 * Resolves a local file path from a file:// URL or relative path
 */
function resolveLocalPath(urlOrPath: string): string {
	if (urlOrPath.startsWith("file://")) {
		// Handle file:// URLs
		const path = urlOrPath.slice(7); // Remove 'file://'
		// If path is relative (doesn't start with /), resolve from PROJECT_ROOT
		if (!path.startsWith("/")) {
			return join(PROJECT_ROOT, path);
		}
		return path;
	}

	// Handle relative paths
	if (!isAbsolute(urlOrPath)) {
		return join(PROJECT_ROOT, urlOrPath);
	}

	return urlOrPath;
}

/**
 * Metadata extracted from text
 */
export interface TextMetadata {
	author?: string;
	title?: string;
}

/**
 * Result of fetching a text from a URL
 */
export interface FetchResult {
	url: string;
	filename: string;
	text: string;
	cached: boolean;
	metadata?: TextMetadata;
}

/**
 * Known metadata for sources that can't be auto-detected
 */
const KNOWN_METADATA: Record<string, TextMetadata> = {
	// Runeberg.org sources
	"livslinjer/1": { author: "Ellen Key", title: "Lifslinjer, Första delen" },
	"livslinjer/2-1": { author: "Ellen Key", title: "Lifslinjer, Andra delen" },
	"livslinjer/3": { author: "Ellen Key", title: "Lifslinjer, Tredje delen" },
	fbremer: { author: "Fredrika Bremer", title: "Fredrika Bremers Brev" },
	barnets: { author: "Ellen Key", title: "Barnets århundrade" },
	detgaran1: { author: "Selma Lagerlöf", title: "Det går an, Del 1" },
	detgaran2: { author: "Selma Lagerlöf", title: "Det går an, Del 2" },
	sveddrom44: { author: "Unknown", title: "Svenska Drömmar 1944" },
	// OpenITI sources
	"0911Suyuti.Itqan": { author: "Jalal al-Din al-Suyuti", title: "Al-Itqan fi Ulum al-Quran" },
	// Archive.org sources
	"Ibn-Khaldun": { author: "Ibn Khaldun", title: "The Muqaddimah" },
	"Ibn-Battuta": { author: "Ibn Battuta", title: "Travels in Asia and Africa 1325-1354" },
};

/**
 * Extracts metadata from URL-based known sources
 */
function extractKnownMetadata(url: string): TextMetadata | null {
	for (const [key, metadata] of Object.entries(KNOWN_METADATA)) {
		if (url.includes(key)) {
			return metadata;
		}
	}
	return null;
}

/**
 * Extracts metadata (author, title) from Gutenberg header
 */
function extractGutenbergMetadata(text: string): TextMetadata {
	const metadata: TextMetadata = {};

	// Try to find Title: and Author: lines in the header
	// Gutenberg format: "Title: Book Name" and "Author: Author Name"
	const titleMatch = text.match(/^Title:\s*(.+?)$/m);
	if (titleMatch?.[1]) {
		metadata.title = titleMatch[1].trim();
	}

	const authorMatch = text.match(/^Author:\s*(.+?)$/m);
	if (authorMatch?.[1]) {
		metadata.author = authorMatch[1].trim();
	}

	// Check for Translator: if no Author: (common for translations)
	if (!metadata.author) {
		const translatorMatch = text.match(/^Translator:\s*(.+?)$/m);
		if (translatorMatch?.[1]) {
			metadata.author = `${translatorMatch[1].trim()} (translator)`;
		}
	}

	// Alternative patterns for Swedish Gutenberg texts
	if (!metadata.title) {
		const altTitleMatch = text.match(/Titel:\s*(.+?)$/m);
		if (altTitleMatch?.[1]) {
			metadata.title = altTitleMatch[1].trim();
		}
	}

	if (!metadata.author) {
		const altAuthorMatch = text.match(/Författare:\s*(.+?)$/m);
		if (altAuthorMatch?.[1]) {
			metadata.author = altAuthorMatch[1].trim();
		}
	}

	// Runeberg.org Swedish pattern: "AF AUTHOR NAME" (means "by")
	if (!metadata.author) {
		const afMatch = text.match(/\n\s*AF\s+([A-ZÅÄÖ][A-ZÅÄÖ\s]+)\s*\n/);
		if (afMatch?.[1]) {
			// Convert from ALL CAPS to Title Case
			const name = afMatch[1]
				.toLowerCase()
				.split(" ")
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(" ");
			metadata.author = name;
		}
	}

	return metadata;
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
 * Fetches a text file from a URL or local file path.
 * - Supports file:// URLs and relative/absolute local paths
 * - Caches remote results in data/sources/
 * - Strips Gutenberg headers/footers automatically (for remote files)
 */
export async function fetchText(url: string): Promise<FetchResult> {
	// Handle local files
	if (isLocalFile(url)) {
		const localPath = resolveLocalPath(url);

		if (!existsSync(localPath)) {
			throw new Error(`Local file not found: ${localPath}`);
		}

		const text = readFileSync(localPath, "utf-8");
		const filename = basename(localPath);

		return { url, filename, text, cached: true };
	}

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

	// Fetch from URL with timeout
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	let response: Response;
	try {
		response = await fetch(url, { signal: controller.signal });
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s: ${url}`);
		}
		throw error;
	} finally {
		clearTimeout(timeout);
	}
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	const rawText = await response.text();

	// Extract metadata: first try known sources, then parse headers
	let metadata = extractKnownMetadata(url);
	if (!(metadata?.author || metadata?.title)) {
		metadata = extractGutenbergMetadata(rawText);
	}

	const text = stripGutenbergBoilerplate(rawText);

	// Cache the stripped text
	writeFileSync(filepath, text, "utf-8");

	return { url, filename, text, cached: false, metadata };
}

/**
 * Fetches multiple texts from URLs in parallel
 */
export async function fetchTexts(urls: string[]): Promise<FetchResult[]> {
	return Promise.all(urls.map(fetchText));
}

/**
 * Extracts metadata from URL and optional text header
 * Used for fixing existing database entries
 */
export function extractMetadataFromUrl(url: string, headerText?: string): TextMetadata {
	// First try known sources
	const known = extractKnownMetadata(url);
	if (known && (known.author || known.title)) {
		return known;
	}

	// Then try to parse header text if provided
	if (headerText) {
		return extractGutenbergMetadata(headerText);
	}

	return {};
}
