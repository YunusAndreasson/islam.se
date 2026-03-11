import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sitemap from "@astrojs/sitemap";
import { defineConfig, fontProviders } from "astro/config";
import remarkSmartypants from "remark-smartypants";
import { rehypeHonorific } from "./src/plugins/rehype-honorific";
import { remarkAbbr } from "./src/plugins/remark-abbr";

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
	build: { inlineStylesheets: "always" },
	markdown: {
		remarkPlugins: [
			[
				remarkSmartypants,
				{
					openingQuotes: { double: "»", single: "\u2019" },
					closingQuotes: { double: "«", single: "\u2019" },
					dashes: "oldschool",
				},
			],
			remarkAbbr,
		],
		rehypePlugins: [rehypeHonorific],
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: "Literata",
			cssVariable: "--font-body",
			fallbacks: ["Georgia", "Times New Roman", "serif"],
			options: {
				variants: [
					{
						weight: "200 900",
						style: "normal",
						src: ["./src/assets/fonts/literata-roman.woff2"],
					},
					{
						weight: "200 900",
						style: "italic",
						src: ["./src/assets/fonts/literata-italic.woff2"],
					},
				],
			},
		},
		{
			provider: fontProviders.local(),
			name: "Source Sans 3",
			cssVariable: "--font-heading",
			fallbacks: ["system-ui", "sans-serif"],
			options: {
				variants: [
					{
						weight: "200 900",
						style: "normal",
						src: ["./src/assets/fonts/source-sans-3-roman.woff2"],
					},
				],
			},
		},
	],
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
