import { render } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getArticles } from "../lib/articles";
import { stripSidenotes } from "../lib/sidenotes";

export async function GET(context: APIContext) {
	const articles = await getArticles();
	const container = await AstroContainer.create();

	const items = await Promise.all(
		articles.map(async (article) => {
			const { Content } = await render(article.entry);
			const html = await container.renderToString(Content);
			return {
				title: article.title,
				description: article.description,
				pubDate: new Date(article.publishedAt),
				link: `/${article.slug}/`,
				// Without the strip a feed reader gets every note twice — the margin copy
				// mid-sentence and the original at the foot — because nothing outside the
				// essay stylesheet hides one of them.
				content: stripSidenotes(html),
			};
		}),
	);

	return rss({
		title: "islam.se",
		description: "Essäer om islamisk intellektuell tradition och svenskt kulturarv.",
		site: context.site?.href ?? "https://islam.se",
		items,
		customData: "<language>sv-SE</language>",
	});
}
