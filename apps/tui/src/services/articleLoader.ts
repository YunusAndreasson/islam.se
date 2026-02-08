import { ArticlePublisher, type PublishedArticle } from "@islam-se/orchestrator";
import type { CategorySummary } from "../types/index.js";

const publisher = new ArticlePublisher();

export function loadCategories(): CategorySummary[] {
	return publisher.listCategories().map((cat) => ({
		name: cat.name,
		displayName: cat.name || "Inkorg",
		count: cat.count,
	}));
}

export function loadArticlesByCategory(category: string): PublishedArticle[] {
	const all = publisher.listPublished();
	return all.filter((a) => (a.category || "") === category);
}

export function loadArticleContent(slug: string): string | null {
	return publisher.getArticle(slug);
}

export function setArticleCategory(slug: string, category: string): boolean {
	return publisher.setCategory(slug, category) !== null;
}

export function unpublishArticle(slug: string): boolean {
	return publisher.unpublish(slug);
}

export function loadAllArticles(): PublishedArticle[] {
	return publisher.listPublished();
}
