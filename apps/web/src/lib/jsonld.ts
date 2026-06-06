// Small JSON-LD builders shared across pages. Base.astro accepts a single block
// or an array, so a page can pass e.g. [collectionPage, breadcrumbList(...)].

const SITE = "https://islam.se";

interface Crumb {
	name: string;
	/** Path or absolute URL; bare paths are resolved against the site origin. */
	url: string;
}

/** A schema.org BreadcrumbList. Pass the trail in order, e.g.
 *  breadcrumbList([{ name: "Hem", url: "/" }, { name: "Tänkare", url: "/tankare" }, …]). */
export function breadcrumbList(items: Crumb[]): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((c, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: c.name,
			item: c.url.startsWith("http") ? c.url : `${SITE}${c.url}`,
		})),
	};
}

/** A schema.org CollectionPage whose `hasPart` lists the member essays — shared by
 *  the ämne / tråd / tänkare `[slug]` pages, which built this block by hand. Pass
 *  `extra` to merge in page-specific properties (e.g. the tänkare page's `about`). */
export function collectionPageJsonLd(opts: {
	name: string;
	description: string;
	/** Path or absolute URL of the collection page. */
	url: string;
	essays: readonly { title: string; slug: string }[];
	extra?: Record<string, unknown>;
}): Record<string, unknown> {
	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		name: opts.name,
		description: opts.description,
		url: opts.url.startsWith("http") ? opts.url : `${SITE}${opts.url}`,
		inLanguage: "sv",
		...opts.extra,
		hasPart: opts.essays.map((e) => ({
			"@type": "Article",
			headline: e.title,
			url: `${SITE}/${e.slug}`,
		})),
	};
}
