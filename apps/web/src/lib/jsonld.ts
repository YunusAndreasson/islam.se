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
