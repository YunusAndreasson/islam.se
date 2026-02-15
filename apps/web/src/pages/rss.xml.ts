import { render } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getArticles } from "../lib/articles";

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
				content: html,
			};
		}),
	);

	return rss({
		title: "islam.se",
		description: "Essäer om islamisk intellektuell tradition och svenskt kulturarv.",
		site: context.site?.href ?? "https://islam.se",
		items,
	});
}
