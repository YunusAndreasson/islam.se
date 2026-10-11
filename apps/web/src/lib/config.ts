// The canonical production origin, in one place. Imported wherever an absolute
// URL is built (JSON-LD @ids, the podcast feed, the moskeer permalinks) so the
// domain is never hand-typed in more than this file.
export const SITE_URL = "https://islam.se";

/** Resolve Astro's configured site URL to the origin used in generated text feeds.
 *  `site` is absent in isolated endpoint tests and ad-hoc rendering, where production
 *  remains the honest fallback. Keeping this here prevents those endpoints from each
 *  growing their own hard-coded copy of the canonical domain. */
export function siteOrigin(site?: URL): string {
	return (site?.href ?? SITE_URL).replace(/\/$/, "");
}

/** Spell out the site's own links in HTML that leaves the site. A link to another page
 *  (how one essay refers to another) is written »/slug/«, and a feed reader has no site
 *  to resolve that against. */
export function absoluteSiteLinks(html: string, origin: string): string {
	return html.replace(/(<a\b[^>]*?\shref=")\/(?!\/)/g, `$1${origin}/`);
}
