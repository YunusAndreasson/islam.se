import { getImage } from "astro:assets";
import type { APIContext } from "astro";
import { getArticles } from "../lib/articles";
import { escapeXml } from "../lib/xml";

// Image sitemap (developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps).
// The standard @astrojs/sitemap emits no <image:image> entries, so the site's hero
// imagery is invisible to Google Images discovery. This endpoint lists every
// essay page together with its hero image: the page in <loc>, the optimized webp
// rendition in <image:loc>. We emit <image:loc> only — Google has ignored the
// <image:title>/<image:caption>/<image:license> sitemap tags since 2022; that richness
// is carried instead by each image's alt text and its ImageObject structured data.
// Linked from public/robots.txt and submitted in Search Console.

export async function GET(context: APIContext) {
	const site = context.site?.href.replace(/\/$/, "") ?? "https://islam.se";
	const articles = await getArticles();

	const entries: string[] = [];
	for (const a of articles) {
		if (!a.heroImage) continue;
		// Same rendition the Article ImageObject advertises as contentUrl — one
		// canonical 1200px webp per photo, so the sitemap and structured data agree.
		const rendition = await getImage({ src: a.heroImage, width: 1200, format: "webp" });
		const imageUrl = new URL(rendition.src, `${site}/`).href;
		entries.push(
			"  <url>\n" +
				`    <loc>${escapeXml(`${site}/${a.slug}/`)}</loc>\n` +
				"    <image:image>\n" +
				`      <image:loc>${escapeXml(imageUrl)}</image:loc>\n` +
				"    </image:image>\n" +
				"  </url>",
		);
	}

	const body =
		`<?xml version="1.0" encoding="UTF-8"?>\n` +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
		`${entries.join("\n")}\n` +
		"</urlset>\n";

	return new Response(body, {
		headers: { "Content-Type": "application/xml; charset=utf-8" },
	});
}
