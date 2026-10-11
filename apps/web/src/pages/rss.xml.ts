import { render } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getArticles } from "../lib/articles";
import { absoluteSiteLinks, siteOrigin } from "../lib/config";
import { stripSidenotes } from "../lib/sidenotes";
import { stripPullQuote } from "../plugins/rehype-pull-quote";

export async function GET(context: APIContext) {
	const articles = await getArticles();
	const container = await AstroContainer.create();
	const origin = siteOrigin(context.site);

	const items = await Promise.all(
		articles.map(async (article) => {
			const { Content } = await render(article.entry);
			const html = await container.renderToString(Content);
			return {
				title: article.title,
				description: article.description,
				pubDate: new Date(article.publishedAt),
				link: `/${article.slug}/`,
				// Without the strips a feed reader gets every note twice — the margin copy
				// mid-sentence and the original at the foot — and the pull quote's sentence
				// twice, because nothing outside the essay stylesheet hides the copies.
				content: absoluteSiteLinks(stripPullQuote(stripSidenotes(html)), origin),
			};
		}),
	);

	return rss({
		title: "islam.se",
		description: "Essäer om islamisk intellektuell tradition och svenskt kulturarv.",
		site: origin,
		items,
		customData: "<language>sv-SE</language>",
	});
}
