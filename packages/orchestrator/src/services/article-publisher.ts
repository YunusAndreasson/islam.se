/**
 * Article Publisher - Manages publishing articles to web-accessible directory
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PublishedArticle {
	slug: string;
	title: string;
	publishedAt: string;
	sourceIdea?: {
		topic: string;
		ideaId: number;
	};
	wordCount: number;
	qualityScore?: number;
	category?: string;
}

export interface ArticleIndex {
	updatedAt: string;
	articles: PublishedArticle[];
}

/**
 * Find the project data directory
 */
function findDataDir(): string {
	// Try environment variable first
	if (process.env.ISLAM_DATA_DIR && existsSync(process.env.ISLAM_DATA_DIR)) {
		return process.env.ISLAM_DATA_DIR;
	}

	// Try relative paths from this file's location
	const candidates = [
		join(__dirname, "../../../../data"), // From dist/services/ or src/services/
		join(__dirname, "../../../data"),
		join(process.cwd(), "data"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	// Traverse up looking for data directory
	let dir = __dirname;
	for (let i = 0; i < 10; i++) {
		const dataPath = join(dir, "data");
		if (existsSync(dataPath)) {
			return dataPath;
		}
		dir = dirname(dir);
	}

	// Default fallback
	return join(process.cwd(), "data");
}

export class ArticlePublisher {
	private articlesDir: string;
	private indexPath: string;

	constructor(dataDir?: string) {
		const baseDir = dataDir || findDataDir();
		this.articlesDir = join(baseDir, "articles");
		this.indexPath = join(this.articlesDir, "index.json");
		this.ensureDir();
	}

	/**
	 * Ensure articles directory exists
	 */
	private ensureDir(): void {
		if (!existsSync(this.articlesDir)) {
			mkdirSync(this.articlesDir, { recursive: true });
		}
	}

	/**
	 * Load the article index
	 */
	private loadIndex(): ArticleIndex {
		if (!existsSync(this.indexPath)) {
			return { updatedAt: new Date().toISOString(), articles: [] };
		}
		try {
			return JSON.parse(readFileSync(this.indexPath, "utf-8"));
		} catch {
			return { updatedAt: new Date().toISOString(), articles: [] };
		}
	}

	/**
	 * Save the article index
	 */
	private saveIndex(index: ArticleIndex): void {
		index.updatedAt = new Date().toISOString();
		writeFileSync(this.indexPath, JSON.stringify(index, null, 2), "utf-8");
	}

	/**
	 * Extract title from markdown content
	 */
	private extractTitle(markdown: string): string {
		// Try to find H1 header
		const h1Match = markdown.match(/^#\s+(.+)$/m);
		if (h1Match?.[1]) {
			return h1Match[1].trim();
		}

		// Try to find first line of content
		const lines = markdown.split("\n").filter((l) => l.trim());
		const firstLine = lines[0];
		if (firstLine) {
			return firstLine.replace(/^#+\s*/, "").slice(0, 100);
		}

		return "Untitled";
	}

	/**
	 * Count words in markdown
	 */
	private countWords(markdown: string): number {
		// Remove markdown syntax and count words
		const text = markdown
			.replace(/```[\s\S]*?```/g, "") // Remove code blocks
			.replace(/`[^`]+`/g, "") // Remove inline code
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Extract link text
			.replace(/[#*_~>\-|]/g, " "); // Remove markdown chars

		return text.split(/\s+/).filter((w) => w.length > 0).length;
	}

	/**
	 * Publish an article to the web-accessible directory
	 */
	publish(
		outputDir: string,
		slug: string,
		metadata?: Partial<Omit<PublishedArticle, "slug" | "publishedAt">>,
	): PublishedArticle {
		const finalPath = join(outputDir, "final.md");

		if (!existsSync(finalPath)) {
			throw new Error(`Final article not found at ${finalPath}`);
		}

		const content = readFileSync(finalPath, "utf-8");
		const targetPath = join(this.articlesDir, `${slug}.md`);

		// Copy the article
		writeFileSync(targetPath, content, "utf-8");

		// Build article metadata
		const article: PublishedArticle = {
			slug,
			title: metadata?.title || this.extractTitle(content),
			publishedAt: new Date().toISOString(),
			wordCount: metadata?.wordCount || this.countWords(content),
			qualityScore: metadata?.qualityScore,
			sourceIdea: metadata?.sourceIdea,
		};

		// Update index
		const index = this.loadIndex();
		const existingIndex = index.articles.findIndex((a) => a.slug === slug);

		if (existingIndex >= 0) {
			index.articles[existingIndex] = article;
		} else {
			index.articles.push(article);
		}

		// Sort by date (newest first)
		index.articles.sort(
			(a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
		);

		this.saveIndex(index);

		return article;
	}

	/**
	 * List all published articles
	 */
	listPublished(): PublishedArticle[] {
		return this.loadIndex().articles;
	}

	/**
	 * Check if an article exists
	 */
	exists(slug: string): boolean {
		return existsSync(join(this.articlesDir, `${slug}.md`));
	}

	/**
	 * Get the path to the articles directory
	 */
	getArticlesDir(): string {
		return this.articlesDir;
	}

	/**
	 * Get article content by slug
	 */
	getArticle(slug: string): string | null {
		const path = join(this.articlesDir, `${slug}.md`);
		if (!existsSync(path)) {
			return null;
		}
		return readFileSync(path, "utf-8");
	}

	/**
	 * Set category for an article
	 */
	setCategory(slug: string, category: string): PublishedArticle | null {
		const index = this.loadIndex();
		const article = index.articles.find((a) => a.slug === slug);
		if (!article) return null;

		article.category = category || undefined;
		this.saveIndex(index);
		return article;
	}

	/**
	 * Remove an article from the index and optionally delete the file
	 */
	unpublish(slug: string, deleteFile = false): boolean {
		const index = this.loadIndex();
		const before = index.articles.length;
		index.articles = index.articles.filter((a) => a.slug !== slug);

		if (index.articles.length === before) return false;

		this.saveIndex(index);

		if (deleteFile) {
			const path = join(this.articlesDir, `${slug}.md`);
			if (existsSync(path)) {
				unlinkSync(path);
			}
		}

		return true;
	}

	/**
	 * List categories with article counts
	 */
	listCategories(): Array<{ name: string; count: number }> {
		const articles = this.loadIndex().articles;
		const counts = new Map<string, number>();

		for (const article of articles) {
			const cat = article.category || "";
			counts.set(cat, (counts.get(cat) ?? 0) + 1);
		}

		const result: Array<{ name: string; count: number }> = [];

		// Inbox (empty category) always first
		if (counts.has("")) {
			result.push({ name: "", count: counts.get("")! });
			counts.delete("");
		} else {
			result.push({ name: "", count: 0 });
		}

		// Rest alphabetical
		const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "sv"));
		for (const [name, count] of sorted) {
			result.push({ name, count });
		}

		return result;
	}
}
