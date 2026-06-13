import type { APIContext } from "astro";
import { getArticles } from "../lib/articles";

// Per-essay clean-markdown endpoint (/{slug}.md). Agents and AI crawlers get the
// essay as compact markdown — the representation LLMs read most cheaply and quote
// most reliably — at a stable, linkable URL we point to from llms.txt. It is the
// SAME prose as the HTML page (content parity, not cloaking); Cloudflare's
// Accept: text/markdown negotiation covers the rest of the site, while these
// routes give every essay a canonical markdown address.
export async function getStaticPaths() {
	const articles = await getArticles();
	return articles.map((article) => ({ params: { slug: article.slug } }));
}

export async function GET(context: APIContext) {
	const site = context.site?.href.replace(/\/$/, "") ?? "https://islam.se";
	const slug = context.params.slug as string;
	const article = (await getArticles()).find((a) => a.slug === slug);
	if (!article) return new Response("Not found", { status: 404 });

	const body = ((article.entry as { body?: string }).body ?? "").trim();
	const meta = [
		`Källa: [islam.se](${site}/${slug})`,
		`Publicerad ${article.publishedAt.slice(0, 10)}`,
	];
	if (article.updatedAt) meta.push(`Uppdaterad ${article.updatedAt.slice(0, 10)}`);

	const markdown = [
		`# ${article.title}`,
		"",
		`> ${article.description}`,
		"",
		`*${meta.join(" · ")}*`,
		"",
		"---",
		"",
		body,
		"",
	].join("\n");

	return new Response(markdown, {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
}
