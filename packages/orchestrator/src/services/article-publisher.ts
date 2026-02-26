/**
 * Article Publisher - Manages publishing articles to web-accessible directory.
 * Markdown frontmatter is the single source of truth — no separate index file.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PublishedArticle {
	slug: string;
	title: string;
	publishedAt: string;
	description?: string;
	wordCount: number;
	qualityScore?: number;
	category?: string;
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Handles our controlled format: flat key-value pairs with JSON-quoted strings and bare numbers.
 * Skips nested structures (e.g. sourceIdea) since they're not part of PublishedArticle.
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { data: {}, body: content };

	const frontmatterBlock = match[1] ?? "";
	const data: Record<string, unknown> = {};
	for (const line of frontmatterBlock.split("\n")) {
		// Skip indented lines (nested YAML children)
		if (line.startsWith(" ") || line.startsWith("\t")) continue;

		const colonIdx = line.indexOf(":");
		if (colonIdx === -1) continue;

		const key = line.slice(0, colonIdx).trim();
		const rawValue = line.slice(colonIdx + 1).trim();

		// Skip keys with no inline value (nested structure headers like "sourceIdea:")
		if (!rawValue) continue;

		// Parse value
		if (rawValue.startsWith('"')) {
			try {
				data[key] = JSON.parse(rawValue);
			} catch {
				data[key] = rawValue;
			}
		} else if (Number.isNaN(Number(rawValue))) {
			data[key] = rawValue;
		} else {
			data[key] = Number(rawValue);
		}
	}

	return { data, body: match[2] ?? "" };
}

/**
 * Find the project data directory
 */
function findDataDir(): string {
	if (process.env.ISLAM_DATA_DIR && existsSync(process.env.ISLAM_DATA_DIR)) {
		return process.env.ISLAM_DATA_DIR;
	}

	const candidates = [
		join(__dirname, "../../../../data"),
		join(__dirname, "../../../data"),
		join(process.cwd(), "data"),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	let dir = __dirname;
	for (let i = 0; i < 10; i++) {
		const dataPath = join(dir, "data");
		if (existsSync(dataPath)) {
			return dataPath;
		}
		dir = dirname(dir);
	}

	return join(process.cwd(), "data");
}

export class ArticlePublisher {
	private articlesDir: string;

	constructor(dataDir?: string) {
		const baseDir = dataDir || findDataDir();
		this.articlesDir = join(baseDir, "articles");
		this.ensureDir();
	}

	private ensureDir(): void {
		if (!existsSync(this.articlesDir)) {
			mkdirSync(this.articlesDir, { recursive: true });
		}
	}

	/**
	 * Read a single article's metadata from its markdown frontmatter.
	 */
	private readArticle(slug: string): PublishedArticle | null {
		const filePath = join(this.articlesDir, `${slug}.md`);
		if (!existsSync(filePath)) return null;

		const content = readFileSync(filePath, "utf-8");
		const { data } = parseFrontmatter(content);

		return {
			slug,
			title: (data.title as string) || slug,
			publishedAt: (data.publishedAt as string) || "",
			description: data.description as string | undefined,
			wordCount: (data.wordCount as number) || 0,
			qualityScore: data.qualityScore as number | undefined,
			category: data.category as string | undefined,
		};
	}

	private extractTitle(markdown: string): string {
		const h1Match = markdown.match(/^#\s+(.+)$/m);
		if (h1Match?.[1]) {
			return h1Match[1].trim();
		}

		const lines = markdown.split("\n").filter((l) => l.trim());
		const firstLine = lines[0];
		if (firstLine) {
			return firstLine.replace(/^#+\s*/, "").slice(0, 100);
		}

		return "Untitled";
	}

	/**
	 * Extract a plain-text description from the article body.
	 * Takes complete sentences up to ~300 chars, never cuts mid-sentence.
	 */
	private getDescription(body: string): string {
		const plain = body
			.replace(/^#+ .+$/gm, "")
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/\[\^[^\]]+\]/g, "")
			.replace(/[*_`]/g, "")
			.replace(/^>\s?/gm, "")
			.replace(/\n+/g, " ")
			.trim();

		const sentences = plain.match(/[^.!?]+[.!?]+/g);
		if (!sentences) return plain.slice(0, 300);

		let result = "";
		for (const sentence of sentences) {
			if (result.length + sentence.trimStart().length > 300 && result.length > 0) break;
			result += (result ? " " : "") + sentence.trimStart();
		}
		return result || plain.slice(0, 300);
	}

	private countWords(markdown: string): number {
		const text = markdown
			.replace(/```[\s\S]*?```/g, "")
			.replace(/`[^`]+`/g, "")
			.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
			.replace(/[#*_~>\-|]/g, " ");

		return text.split(/\s+/).filter((w) => w.length > 0).length;
	}

	/**
	 * Normalize footnote section: ensure --- separator before footnotes,
	 * remove stray blank lines between footnote definitions.
	 */
	private normalizeFootnotes(body: string): string {
		const firstFootnote = body.search(/^\[\^\d+\]:/m);
		if (firstFootnote === -1) return body;

		const prose = body.slice(0, firstFootnote).replace(/\s+$/, "");
		const footnotesRaw = body.slice(firstFootnote).trim();

		const footnotes = footnotesRaw.replace(/\n{2,}(?=\[\^\d+\]:)/g, "\n");
		const proseClean = prose.replace(/\n---\s*$/, "");

		return `${proseClean}\n\n---\n\n${footnotes}\n`;
	}

	/**
	 * Build YAML frontmatter string from article metadata.
	 */
	private buildFrontmatter(article: PublishedArticle): string {
		const lines = [
			"---",
			`title: ${JSON.stringify(article.title)}`,
			`publishedAt: ${JSON.stringify(article.publishedAt)}`,
			`wordCount: ${article.wordCount}`,
		];
		if (article.qualityScore != null) {
			lines.push(`qualityScore: ${article.qualityScore}`);
		}
		if (article.description) {
			lines.push(`description: ${JSON.stringify(article.description)}`);
		}
		if (article.category) {
			lines.push(`category: ${JSON.stringify(article.category)}`);
		}
		lines.push("---", "");
		return lines.join("\n");
	}

	/**
	 * Publish an article to the web-accessible directory.
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

		const title = metadata?.title || this.extractTitle(content);
		const wordCount = metadata?.wordCount || this.countWords(content);

		let body = content.replace(/^#\s+.+\n+/, "");
		body = this.normalizeFootnotes(body);
		const description = this.getDescription(body);

		const article: PublishedArticle = {
			slug,
			title,
			publishedAt: new Date().toISOString(),
			description,
			wordCount,
			qualityScore: metadata?.qualityScore,
			category: metadata?.category,
		};

		writeFileSync(targetPath, this.buildFrontmatter(article) + body, "utf-8");

		return article;
	}

	/**
	 * List all published articles by reading markdown frontmatter.
	 */
	listPublished(): PublishedArticle[] {
		const files = readdirSync(this.articlesDir).filter((f) => f.endsWith(".md"));
		const articles: PublishedArticle[] = [];

		for (const file of files) {
			const slug = file.replace(/\.md$/, "");
			const article = this.readArticle(slug);
			if (article) articles.push(article);
		}

		return articles.sort(
			(a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
		);
	}

	exists(slug: string): boolean {
		return existsSync(join(this.articlesDir, `${slug}.md`));
	}

	getArticlesDir(): string {
		return this.articlesDir;
	}

	getArticle(slug: string): string | null {
		const filePath = join(this.articlesDir, `${slug}.md`);
		if (!existsSync(filePath)) return null;
		return readFileSync(filePath, "utf-8");
	}

	/**
	 * Set category for an article by updating its frontmatter.
	 */
	setCategory(slug: string, category: string): PublishedArticle | null {
		const filePath = join(this.articlesDir, `${slug}.md`);
		if (!existsSync(filePath)) return null;

		let content = readFileSync(filePath, "utf-8");

		if (category) {
			const categoryLine = `category: ${JSON.stringify(category)}`;
			if (/^category: .+$/m.test(content)) {
				content = content.replace(/^category: .+$/m, categoryLine);
			} else {
				// Insert before closing ---
				content = content.replace(/\n---\n/, `\n${categoryLine}\n---\n`);
			}
		} else {
			// Remove category line
			content = content.replace(/^category: .+\n/m, "");
		}

		writeFileSync(filePath, content, "utf-8");
		return this.readArticle(slug);
	}

	/**
	 * Write raw content (frontmatter + body) to an article file.
	 */
	writeArticle(slug: string, content: string): void {
		const filePath = join(this.articlesDir, `${slug}.md`);
		writeFileSync(filePath, content, "utf-8");
	}

	/**
	 * Remove a published article by deleting its file.
	 */
	unpublish(slug: string): boolean {
		const filePath = join(this.articlesDir, `${slug}.md`);
		if (!existsSync(filePath)) return false;
		unlinkSync(filePath);
		return true;
	}

	/**
	 * List categories with article counts.
	 */
	listCategories(): Array<{ name: string; count: number }> {
		const articles = this.listPublished();
		const counts = new Map<string, number>();

		for (const article of articles) {
			const cat = article.category || "";
			counts.set(cat, (counts.get(cat) ?? 0) + 1);
		}

		const result: Array<{ name: string; count: number }> = [];

		if (counts.has("")) {
			result.push({ name: "", count: counts.get("") ?? 0 });
			counts.delete("");
		} else {
			result.push({ name: "", count: 0 });
		}

		const sorted = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "sv"));
		for (const [name, count] of sorted) {
			result.push({ name, count });
		}

		return result;
	}
}
