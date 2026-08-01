import { getImage } from "astro:assets";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import { getArticles } from "../lib/articles";
import { resolveHero } from "../lib/fordjupning";
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

	// The pillar pages carry a hero too — bespoke art where it exists, otherwise a
	// borrowed essay photo. A borrowed one is deliberately NOT listed: the same file
	// would then appear under two URLs, and Google treats the first as canonical, so the
	// essay would lose its own entry to a page that merely reuses its picture.
	for (const entry of await getCollection("fordjupning")) {
		const hero = await resolveHero(entry);
		if (!hero?.src) continue;
		const rendition = await getImage({ src: hero.src, width: 1200, format: "webp" });
		const imageUrl = new URL(rendition.src, `${site}/`).href;
		entries.push(
			"  <url>\n" +
				`    <loc>${escapeXml(`${site}/fordjupning/${entry.id}/`)}</loc>\n` +
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
