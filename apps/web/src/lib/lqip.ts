/** Build-time low-quality image placeholder for the homepage's signature hero.
 *
 *  The feature image is the page's LCP element: it is preloaded and painted at
 *  `fetchpriority=high`, but on a real connection there is still a stretch where
 *  the frame is an empty warm rectangle — the one moment the opening looks
 *  unfinished. A 20px-wide WebP of the same photograph, inlined as a data URI
 *  (~400 bytes, no extra request), fills that gap with the picture's own tones,
 *  smoothed to a blur by the browser's own upscaling. It is painted underneath
 *  the frame's grain and vignette, so what arrives first is already seated in
 *  the page rather than pasted onto it.
 *
 *  Deliberately NOT applied to every essay photo: below-the-fold images are lazy
 *  and never seen mid-load, so a placeholder there is bytes for nothing. */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/** Absolute path to src/assets/images, substituted at compile time by the
 *  `vite.define` in astro.config.ts. A source-relative `import.meta.url` cannot
 *  be used here: the static build bundles this module into a temp chunk
 *  directory, where "../assets/images" resolves to nothing — the placeholder
 *  then works in dev and silently disappears from the deployed site. */
declare const __HERO_IMAGES_DIR__: string;

const imagesDir = __HERO_IMAGES_DIR__;

/** slug → absolute path of its hero file (extension resolved from disk). */
const filesBySlug = new Map<string, string>();
try {
	for (const file of readdirSync(imagesDir)) {
		const slug = file.replace(/\.[^.]+$/, "");
		if (!slug.endsWith("-mobile")) filesBySlug.set(slug, join(imagesDir, file));
	}
} catch {
	// No images directory yet — every lookup below simply misses.
}

/** Survives dev-server HMR and the many pages a build renders. */
const cache = new Map<string, string | undefined>();

export async function heroPlaceholder(slug: string): Promise<string | undefined> {
	if (cache.has(slug)) return cache.get(slug);

	const file = filesBySlug.get(slug);
	let uri: string | undefined;
	if (file) {
		try {
			const buf = await sharp(file)
				.rotate() // honour EXIF orientation before downscaling
				.resize(20, null, { fit: "inside" })
				.webp({ quality: 40, effort: 6 })
				.toBuffer();
			uri = `data:image/webp;base64,${buf.toString("base64")}`;
		} catch {
			// A placeholder is a nicety; never fail a build over one.
		}
	}

	cache.set(slug, uri);
	return uri;
}
