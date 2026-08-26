export interface MarkdownArticle {
	slug: string;
	title: string;
	description: string;
	publishedAt: string;
	updatedAt?: string;
	body: string;
}

/** Serialize one essay for the site's Markdown representations. The per-essay
 *  `/{slug}.md` route and the combined `/llms-full.txt` corpus must describe dates,
 *  source and body identically; only link syntax and the optional body divider differ. */
export function articleMarkdown(
	article: MarkdownArticle,
	opts: { site: string; linkedSource?: boolean; bodyDivider?: boolean },
): string {
	const site = opts.site.replace(/\/$/, "");
	const url = `${site}/${article.slug}`;
	const source = opts.linkedSource ? `[islam.se](${url})` : url;
	const meta = [`Källa: ${source}`, `Publicerad ${article.publishedAt.slice(0, 10)}`];
	if (article.updatedAt) meta.push(`Uppdaterad ${article.updatedAt.slice(0, 10)}`);

	return [
		`# ${article.title}`,
		"",
		`> ${article.description}`,
		"",
		`*${meta.join(" · ")}*`,
		...(opts.bodyDivider ? ["", "---"] : []),
		"",
		article.body.trim(),
	].join("\n");
}
