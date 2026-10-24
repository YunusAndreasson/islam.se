import type { APIContext, InferGetStaticPropsType } from "astro";
import { articleBody, getArticles } from "../lib/articles";
import { siteOrigin } from "../lib/config";
import { withPublishedFigures } from "../lib/inline-images";
import { articleMarkdown } from "../lib/representations";

// Per-essay clean-markdown endpoint (/{slug}.md). Agents and AI crawlers get the
// essay as compact markdown — the representation LLMs read most cheaply and quote
// most reliably — at a stable, linkable URL we point to from llms.txt. It is the
// SAME prose as the HTML page (content parity, not cloaking); Cloudflare's
// Accept: text/markdown negotiation covers the rest of the site, while these
// routes give every essay a canonical markdown address.
export async function getStaticPaths() {
	const articles = await getArticles();
	return articles.map((article) => ({ params: { slug: article.slug }, props: { article } }));
}

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export async function GET(context: APIContext<Props>) {
	const site = siteOrigin(context.site);
	const { article } = context.props;
	// A photograph's path in the source is a repository path; the twin gets the URL.
	const body = await withPublishedFigures(articleBody(article), site);
	const markdown = `${articleMarkdown(
		{ ...article, body },
		{ site, linkedSource: true, bodyDivider: true },
	)}\n`;

	return new Response(markdown, {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
}
