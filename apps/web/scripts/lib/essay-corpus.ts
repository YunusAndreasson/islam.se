/**
 * The essay corpus, parsed once for every book-shaped artefact.
 *
 * `data/articles/*.md` is rendered three ways: by Astro for the web, by
 * generate-pdf.ts into samlingsvolym.pdf, and by generate-epub.ts into
 * samlingsvolym.epub. The two book generators used to be one file with its own
 * frontmatter reader; when the second arrived, the choice was to copy that reader or
 * to name it. Copying it would have let the PDF and the EPUB disagree about what a
 * book contains — silently, and only in the artefact nobody happened to open.
 *
 * ⚠️ The smartypants configuration below is not decoration. It is the house's
 * punctuation: guillemets rather than English quotes, oldschool dashes. Astro's
 * markdown pipeline sets exactly the same options in astro.config.ts, and the three
 * renderings must agree — a book whose quotation marks differ from the site is a
 * different book.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkSmartypants from "remark-smartypants";
import { unified } from "unified";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "../../../..");
export const ARTICLES_DIR = join(REPO_ROOT, "data/articles");

/** Minimal MDAST shape — the generators read .type/.children/.value etc. Defined here
 *  rather than pulling in @types/mdast for two build scripts. */
export interface MdastNode {
	type: string;
	value?: string;
	children?: MdastNode[];
	identifier?: string;
	depth?: number;
	ordered?: boolean;
	url?: string;
	alt?: string;
	title?: string;
	lang?: string;
}

export interface ArticleMeta {
	title: string;
	publishedAt: string;
	wordCount: number;
	/** The authored ~270-character deck. The EPUB sets it as each chapter's standfirst;
	 *  the PDF does not use it. Absent on nothing in the corpus today. */
	description: string;
}

const EMPTY: ArticleMeta = { title: "", publishedAt: "", wordCount: 0, description: "" };

export function parseFrontmatter(raw: string): { meta: ArticleMeta; body: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return { meta: { ...EMPTY }, body: raw };
	const frontmatter = match[1];
	const body = match[2];
	if (frontmatter === undefined || body === undefined) {
		return { meta: { ...EMPTY }, body: raw };
	}
	const pairs: Record<string, string> = {};
	for (const line of frontmatter.split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			const key = line.slice(0, idx).trim();
			const val = line
				.slice(idx + 1)
				.trim()
				.replace(/^"(.*)"$/, "$1");
			pairs[key] = val;
		}
	}
	return {
		meta: {
			title: pairs.title || "",
			publishedAt: pairs.publishedAt || "",
			wordCount: Number.parseInt(pairs.wordCount || "0", 10),
			description: pairs.description || "",
		},
		body,
	};
}

/** remark with the house punctuation. Shared so the PDF and the EPUB cannot drift. */
export function essayProcessor() {
	return unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkSmartypants, {
			openingQuotes: { double: "»", single: "’" },
			closingQuotes: { double: "«", single: "’" },
			dashes: "oldschool",
		});
}

export interface Article {
	slug: string;
	meta: ArticleMeta;
	ast: MdastNode;
}

/** Every essay, sorted by filename — the order both books present them in. */
export function loadArticles(): Article[] {
	const processor = essayProcessor();
	return readdirSync(ARTICLES_DIR)
		.filter((f) => f.endsWith(".md"))
		.sort()
		.map((file) => {
			const raw = readFileSync(join(ARTICLES_DIR, file), "utf-8");
			const { meta, body } = parseFrontmatter(raw);
			const tree = processor.parse(body);
			return {
				slug: file.replace(".md", ""),
				meta,
				ast: processor.runSync(tree) as unknown as MdastNode,
			};
		});
}
