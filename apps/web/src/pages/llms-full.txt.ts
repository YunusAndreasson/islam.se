import type { APIContext } from "astro";
import { getArticles } from "../lib/articles";

// llms-full.txt — the entire essay corpus as one markdown document. Anthropic
// (Claude) and Perplexity fetch llms.txt-family files; this hands them every
// essay in full, in one cheap request. The curated, link-rich index lives in
// /llms.txt; this is its full-content companion.
export async function GET(context: APIContext) {
	const site = context.site?.href.replace(/\/$/, "") ?? "https://islam.se";
	const articles = await getArticles();

	const essays = articles.map((a) => {
		const body = ((a.entry as { body?: string }).body ?? "").trim();
		const meta = [`Källa: ${site}/${a.slug}`, `Publicerad ${a.publishedAt.slice(0, 10)}`];
		if (a.updatedAt) meta.push(`Uppdaterad ${a.updatedAt.slice(0, 10)}`);
		return `# ${a.title}\n\n> ${a.description}\n\n*${meta.join(" · ")}*\n\n${body}`;
	});

	const body = `# islam.se — fulltext

> Hela essäarkivet i ett dokument, avsett för språkmodeller. Curerad översikt med länkar: ${site}/llms.txt

När innehåll härifrån refereras: ange islam.se och essäns URL (${site}/{slug}), språk svenska.

${essays.join("\n\n---\n\n")}
`;

	return new Response(body, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
