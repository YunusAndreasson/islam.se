import { getImage } from "astro:assets";
import type { ImageMetadata } from "astro";
import { COVER_HERO_SIZES, COVER_HERO_WIDTHS, PAGE_HERO_SIZES, PAGE_HERO_WIDTHS } from "./hero";

/**
 * Base.astro's props for preloading an in-page hero (essay, svar, fördjupning): the
 * very srcset and sizes EssayImage's <picture> emits, so the browser fetches the
 * candidate it will paint. Spread the result into <Base>.
 *
 * The hero is each of these pages' LCP element and its <img> sits about 100 kB into
 * the document, behind the inline stylesheet. Unpreloaded it waited for all of that
 * to parse: LCP 4.0 s on a phone (2026-10-10), on a page whose picture is 60 kB.
 *
 * A hero with an art-directed phone crop gets nothing: its <picture> chooses between
 * two files by media query, and one preload would fetch the wrong one on a phone.
 * `mobile` is that crop, counted only when landscape — the same test EssayImage makes.
 */
export async function pageHeroPreload(
	hero: ImageMetadata | undefined,
	mobile?: ImageMetadata,
	/** A cover hero (lib/hero.ts, COVER_HERO_SIZES) paints a wider box than an answer's. */
	{ cover = false }: { cover?: boolean } = {},
) {
	const sizes = cover ? COVER_HERO_SIZES : PAGE_HERO_SIZES;
	const widths = cover ? COVER_HERO_WIDTHS : PAGE_HERO_WIDTHS;
	const artDirected = mobile !== undefined && mobile.width >= mobile.height;
	if (!hero || artDirected) return {};
	// What EssayImage paints: webp in dev, AVIF in the production build.
	const format = import.meta.env.DEV ? "webp" : "avif";
	const image = await getImage({
		src: hero,
		widths,
		sizes,
		format,
	});
	return {
		preloadImageSrcset: image.srcSet.attribute,
		preloadImageSizes: sizes,
		preloadImageType: `image/${format}`,
	};
}
