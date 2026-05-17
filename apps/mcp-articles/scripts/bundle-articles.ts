/**
 * Reads all .md articles from data/articles/, parses frontmatter,
 * and writes a JSON bundle that the Worker imports at build time.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

const articlesDir = join(import.meta.dirname, "../../../data/articles");
const outPath = join(import.meta.dirname, "../src/articles-data.json");

const files = readdirSync(articlesDir).filter((f) => f.endsWith(".md"));

const articles = files.map((file) => {
	const raw = readFileSync(join(articlesDir, file), "utf-8");
	const { data, content } = matter(raw);
	const slug = file.replace(/\.md$/, "");

	return {
		slug,
		title: data.title as string,
		publishedAt: data.publishedAt as string,
		wordCount: data.wordCount as number,
		description: data.description as string,
		audioFile: (data.audioFile as string) || null,
		audioDuration: (data.audioDuration as number) || null,
		body: content.trim(),
	};
});

// Sort newest first
articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

writeFileSync(outPath, JSON.stringify(articles, null, 2));
console.log(`Bundled ${articles.length} articles → ${outPath}`);
