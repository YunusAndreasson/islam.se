import { getImage } from "astro:assets";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import { articleBody, getArticles } from "../lib/articles";
import { siteOrigin } from "../lib/config";
import { resolveHero } from "../lib/fordjupning";
import { publishedFigures } from "../lib/inline-images";
import { escapeXml } from "../lib/xml";

// Image sitemap (developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps).
// The standard @astrojs/sitemap emits no <image:image> entries, so the site's imagery
// is invisible to Google Images discovery. This endpoint lists every page that carries
// a picture of its own together with those pictures: the page in <loc>, each optimized
// webp rendition in an <image:loc>. We emit <image:loc> only — Google has ignored the
// <image:title>/<image:caption>/<image:license> sitemap tags since 2022; that richness
// is carried instead by each image's alt text and its ImageObject structured data.
// Linked from public/robots.txt and submitted in Search Console.

function urlEntry(loc: string, images: string[]): string {
	return [
		"  <url>",
		`    <loc>${escapeXml(loc)}</loc>`,
		...images.map(
			(image) =>
				`    <image:image>\n      <image:loc>${escapeXml(image)}</image:loc>\n    </image:image>`,
		),
		"  </url>",
	].join("\n");
}

export async function GET(context: APIContext) {
	const site = siteOrigin(context.site);
	const absolute = (src: string) => new URL(src, `${site}/`).href;
	// The photographs a text sets between its paragraphs, at the URL its own <img> uses.
	const figures = async (body: string | undefined) =>
		(await publishedFigures(body, site)).map((figure) => figure.url);

	const entries: string[] = [];
	for (const a of await getArticles()) {
		const images: string[] = [];
		if (a.heroImage) {
			// Same rendition the Article ImageObject advertises as contentUrl — one
			// canonical 1200px webp per photo, so the sitemap and structured data agree.
			const rendition = await getImage({ src: a.heroImage, width: 1200, format: "webp" });
			images.push(absolute(rendition.src));
		}
		images.push(...(await figures(articleBody(a))));
		if (images.length > 0) entries.push(urlEntry(`${site}/${a.slug}/`, images));
	}

	// The pillar pages carry a hero too — bespoke art where it exists, otherwise a
	// borrowed essay photo. A borrowed one is deliberately NOT listed: the same file
	// would then appear under two URLs, and Google treats the first as canonical, so the
	// essay would lose its own entry to a page that merely reuses its picture.
	for (const entry of await getCollection("fordjupning")) {
		const images: string[] = [];
		const hero = await resolveHero(entry);
		if (hero?.src) {
			const rendition = await getImage({ src: hero.src, width: 1200, format: "webp" });
			images.push(absolute(rendition.src));
		}
		images.push(...(await figures(entry.body)));
		if (images.length > 0) entries.push(urlEntry(`${site}/fordjupning/${entry.id}/`, images));
	}

	// An answer page's hero is FAKTA art or a borrowed essay photo and is not listed
	// here; the photographs inside its text are its own.
	for (const entry of await getCollection("svar")) {
		const images = await figures(entry.body);
		if (images.length > 0) entries.push(urlEntry(`${site}/svar/${entry.id}/`, images));
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
