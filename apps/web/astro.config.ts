import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import remarkSmartypants from "remark-smartypants";
import { remarkAbbr } from "./src/plugins/remark-abbr";
import { rehypeHonorific } from "./src/plugins/rehype-honorific";

const articlesDir = fileURLToPath(new URL("../../data/articles", import.meta.url));
const articleDates: Record<string, string> = {};
try {
	for (const file of readdirSync(articlesDir).filter((f) => f.endsWith(".md"))) {
		const content = readFileSync(join(articlesDir, file), "utf-8");
		const match = content.match(/publishedAt:\s*"([^"]+)"/);
		if (match) {
			articleDates[file.replace(/\.md$/, "")] = match[1];
		}
	}
} catch {
	// articles dir may not exist during first build
}

export default defineConfig({
	site: "https://islam.se",
	output: "static",
	prefetch: { defaultStrategy: "hover" },
	markdown: {
		remarkPlugins: [remarkSmartypants, remarkAbbr],
		rehypePlugins: [rehypeHonorific],
	},
	integrations: [
		sitemap({
			serialize(item) {
				const slug = item.url.replace("https://islam.se/", "").replace(/\/$/, "");
				if (articleDates[slug]) {
					item.lastmod = new Date(articleDates[slug]).toISOString();
				}
				return item;
			},
		}),
	],
});
