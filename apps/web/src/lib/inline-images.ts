import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import { SITE_URL } from "./config";
import {
	IMAGE_CREDITS,
	type ImageCredit,
	inlineFigures,
	publishFigureLines,
} from "./image-credits";
import { figureImageObject } from "./jsonld";
import { basename } from "./path";

/**
 * The photographs a text sets between its paragraphs (`![…](…/images/inline/x.webp "…")`),
 * resolved to what the site actually publishes. Three things outside the page's own
 * markup need that: the image sitemap, the ImageObject structured data, and the
 * Markdown twins, which otherwise quote the repository path.
 *
 * The URL is the one the page's own <img src> carries. Astro names a rendition after
 * the source file and the transform, never after `alt`, `widths` or `sizes`, so asking
 * for the picture with no transform here lands on the same file the Markdown pipeline
 * emits as the fallback `src` of its `srcset`.
 */
const INLINE_ASSETS: ReadonlyMap<string, ImageMetadata> = new Map(
	Object.entries(
		import.meta.glob<{ default: ImageMetadata }>("../assets/images/inline/*.{jpg,jpeg,png,webp}", {
			eager: true,
		}),
	).map(([path, mod]) => [`inline/${basename(path, /\.[^.]+$/)}`, mod.default]),
);

export interface PublishedFigure {
	key: string;
	/** Absolute URL of the published file. */
	url: string;
	alt: string;
	caption: string;
	width: number;
	height: number;
	credit?: ImageCredit;
}

/** Every figure in a Markdown body whose file exists, in reading order. */
export async function publishedFigures(
	body: string | undefined,
	site: URL | string | undefined,
): Promise<PublishedFigure[]> {
	const figures: PublishedFigure[] = [];
	for (const figure of inlineFigures(body ?? "")) {
		const asset = INLINE_ASSETS.get(figure.key);
		if (!asset) continue;
		const rendition = await getImage({ src: asset });
		const credit = IMAGE_CREDITS[figure.key];
		figures.push({
			...figure,
			url: new URL(rendition.src, site ?? SITE_URL).href,
			width: asset.width,
			height: asset.height,
			...(credit === undefined ? {} : { credit }),
		});
	}
	return figures;
}

/** One ImageObject per figure, for the page's JSON-LD. */
export async function figureJsonLd(
	body: string | undefined,
	pageUrl: string,
	site: URL | string | undefined,
): Promise<Record<string, unknown>[]> {
	return (await publishedFigures(body, site)).map((figure) =>
		figureImageObject({
			contentUrl: figure.url,
			url: pageUrl,
			name: figure.alt,
			...(figure.caption ? { caption: figure.caption } : {}),
			width: figure.width,
			height: figure.height,
			...(figure.credit === undefined ? {} : { credit: figure.credit }),
		}),
	);
}

/** A Markdown body with its figure paths replaced by the published URLs. */
export async function withPublishedFigures(
	body: string,
	site: URL | string | undefined,
): Promise<string> {
	const urls = new Map((await publishedFigures(body, site)).map((f) => [f.key, f.url]));
	return publishFigureLines(body, (key) => urls.get(key));
}
