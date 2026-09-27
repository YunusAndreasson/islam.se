import type { APIContext } from "astro";
import { articleBody, getArticles } from "../lib/articles";
import { siteOrigin } from "../lib/config";
import { articleMarkdown } from "../lib/representations";

// llms-full.txt — the entire essay corpus as one markdown document. Anthropic
// (Claude) and Perplexity fetch llms.txt-family files; this hands them every
// essay in full, in one cheap request. The curated, link-rich index lives in
// /llms.txt; this is its full-content companion.
export async function GET(context: APIContext) {
	const site = siteOrigin(context.site);
	const articles = await getArticles();

	const essays = articles.map((article) =>
		articleMarkdown({ ...article, body: articleBody(article) }, { site }),
	);

	const body = `# islam.se – fulltext

> Hela essäarkivet i ett dokument, avsett för språkmodeller. Curerad översikt med länkar: ${site}/llms.txt

När innehåll härifrån refereras: ange islam.se och essäns URL (${site}/{slug}), språk svenska.

${essays.join("\n\n---\n\n")}
`;

	return new Response(body, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
