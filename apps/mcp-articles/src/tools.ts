import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { articleCount, getArticle, listArticles, searchArticles } from "./articles.js";

export function registerTools(server: McpServer) {
	server.tool(
		"search_articles",
		`Full-text search across ${articleCount} published Swedish-language essays on islam.se.
The site explores Islamic intellectual tradition in conversation with Swedish cultural heritage.

Examples:
- "tålamod" → essays touching on patience and perseverance
- "Strindberg" → essays referencing August Strindberg
- "democracy" or "demokrati" → essays on democratic governance
- "death mortality" → essays on death and the afterlife

Content is in Swedish. Search in Swedish for best results, but English terms also work.`,
		{
			query: z.string().describe("Search query (Swedish or English)"),
			limit: z.number().min(1).max(10).optional().describe("Max results (default 5, max 10)"),
		},
		async ({ query, limit }) => {
			const results = searchArticles(query, limit ?? 5);
			if (results.length === 0) {
				return {
					content: [{ type: "text", text: "No articles found matching your query." }],
				};
			}

			const text = results
				.map(
					(r, i) =>
						`[${i + 1}] "${r.title}" (${r.wordCount} words, ${r.readingTime} min read)
${r.description}
URL: https://islam.se/${r.slug}/
Published: ${r.publishedAt.slice(0, 10)}${r.audioFile ? " | Has audio" : ""}`,
				)
				.join("\n\n");

			return { content: [{ type: "text", text }] };
		},
	);

	server.tool(
		"get_article",
		`Retrieve the full content of a published essay from islam.se by its slug.
Returns the complete article text in Swedish (markdown format) along with metadata.
Use search_articles first to find relevant slugs.`,
		{
			slug: z.string().describe("Article slug (e.g. 'alis-princip')"),
		},
		async ({ slug }) => {
			const article = getArticle(slug);
			if (!article) {
				return {
					content: [
						{
							type: "text",
							text: `No article found with slug "${slug}". Use search_articles or list_articles to find valid slugs.`,
						},
					],
				};
			}

			const header = `# ${article.title}

URL: https://islam.se/${article.slug}/
Published: ${article.publishedAt.slice(0, 10)}
Words: ${article.wordCount} | Reading time: ${article.readingTime} min${article.audioFile ? ` | Audio: https://islam.se/audio/${article.audioFile}` : ""}

${article.description}

---

`;

			return { content: [{ type: "text", text: header + article.body }] };
		},
	);

	server.tool(
		"list_articles",
		`Browse all published essays on islam.se, sorted by publication date (newest first).
Returns metadata for each article (no full text — use get_article for that).`,
		{
			hasAudio: z
				.boolean()
				.optional()
				.describe("Filter: true = only with audio, false = only without"),
			limit: z.number().min(1).max(50).optional().describe("Page size (default 20, max 50)"),
			offset: z.number().min(0).optional().describe("Skip first N articles (for pagination)"),
		},
		async ({ hasAudio, limit, offset }) => {
			const { articles, total } = listArticles({
				hasAudio,
				limit: limit ?? 20,
				offset: offset ?? 0,
			});

			const header = `Showing ${articles.length} of ${total} articles:\n\n`;
			const text = articles
				.map(
					(a, i) =>
						`${(offset ?? 0) + i + 1}. "${a.title}" — ${a.publishedAt.slice(0, 10)} (${a.wordCount} words)
   ${a.description.slice(0, 120)}${a.description.length > 120 ? "..." : ""}
   https://islam.se/${a.slug}/`,
				)
				.join("\n\n");

			return { content: [{ type: "text", text: header + text }] };
		},
	);
}
