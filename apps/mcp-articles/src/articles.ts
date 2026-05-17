import MiniSearch from "minisearch";
import articlesData from "./articles-data.json";

interface Article {
	slug: string;
	title: string;
	publishedAt: string;
	wordCount: number;
	readingTime: number;
	description: string;
	audioFile: string | null;
	audioDuration: number | null;
	body: string;
}

const articles: Article[] = articlesData.map((a) => ({
	...a,
	readingTime: Math.ceil(a.wordCount / 200),
}));

const articleMap = new Map(articles.map((a) => [a.slug, a]));

const index = new MiniSearch<Article>({
	fields: ["title", "description", "body"],
	storeFields: ["slug"],
	searchOptions: {
		boost: { title: 3, description: 2 },
		prefix: true,
		fuzzy: 0.2,
	},
});
index.addAll(articles.map((a, i) => ({ ...a, id: i })));

export function searchArticles(
	query: string,
	limit = 5,
): (Omit<Article, "body"> & { score: number })[] {
	const results = index.search(query, { limit: Math.min(limit, 10) });
	return results
		.map((r) => {
			const article = articleMap.get(r.slug as string);
			if (!article) return null;
			const { body: _, ...meta } = article;
			return { ...meta, score: r.score };
		})
		.filter((r) => r !== null);
}

export function getArticle(slug: string): Article | undefined {
	return articleMap.get(slug);
}

export function listArticles(opts: { hasAudio?: boolean; limit?: number; offset?: number }): {
	articles: Omit<Article, "body">[];
	total: number;
} {
	let filtered = articles;
	if (opts.hasAudio !== undefined) {
		filtered = filtered.filter((a) =>
			opts.hasAudio ? a.audioFile !== null : a.audioFile === null,
		);
	}

	const offset = opts.offset ?? 0;
	const limit = opts.limit ?? 20;
	const page = filtered.slice(offset, offset + limit);

	return {
		total: filtered.length,
		articles: page.map(({ body: _, ...meta }) => meta),
	};
}

export const articleCount = articles.length;
