import type { CollectionEntry } from "astro:content";
import type { ImageMetadata } from "astro";
import { type Article, getArticles } from "./articles";

/**
 * Hero art for the /fordjupning/ pillar pages.
 *
 * Designed for the ~30 topics this type will eventually cover, so neither adding a
 * page nor commissioning art for one may require touching code:
 *
 *   1. BESPOKE — drop `src/assets/images/fordjupning/<slug>.webp` in. That is the whole
 *      wiring; the glob below picks it up and the page stops borrowing.
 *   2. BORROW — until then, one frontmatter line, `heroEssay: <essay-slug>`, reuses that
 *      essay's hero. The alt text comes with it, so the borrow is a single edit.
 *   3. NEITHER — the page renders without a hero. No page is blocked on art.
 *
 * ⚠️ The subfolder is deliberate, and mirrors `lib/fakta.ts`: lib/articles.ts globs
 * `images/*` NON-recursively for essay heroes, so art here can never collide with an
 * essay slug — which it otherwise would the day someone writes an essay called "hijab".
 */
const artEntries = Object.entries(
	import.meta.glob<{ default: ImageMetadata }>(
		"../assets/images/fordjupning/*.{jpg,jpeg,png,webp}",
		{ eager: true },
	),
);

export const FORDJUPNING_ART: ReadonlyMap<string, ImageMetadata> = new Map(
	artEntries.map(([path, mod]) => {
		const file = path.split("/").pop() ?? "";
		return [file.replace(/\.[^.]+$/, ""), mod.default] as [string, ImageMetadata];
	}),
);

export interface FordjupningHero {
	/** Bespoke art, when this topic has its own file. */
	src?: ImageMetadata;
	/** The essay whose hero is borrowed, when it does not. */
	article?: Article;
	/** What the image shows. Empty string = decorative, which is the honest value for a
	 *  borrowed photo the page never authored a description for. */
	alt: string;
	/** Visible figcaption. Only ever the page's own — a borrowed caption would describe
	 *  the essay's argument, not this article's. */
	caption?: string;
}

/**
 * Resolve the hero for one pillar page. Returns null when there is nothing to show, so
 * the template can omit the figure entirely rather than reserve empty space.
 *
 * Throws on a `heroEssay` that names no essay: a silent miss would degrade to "no hero"
 * and nobody would notice the art had stopped rendering — the same reasoning as the
 * hard-throw on `related`/`essays`.
 */
export async function resolveHero(
	entry: CollectionEntry<"fordjupning">,
): Promise<FordjupningHero | null> {
	const bespoke = FORDJUPNING_ART.get(entry.id);
	if (bespoke) {
		return {
			src: bespoke,
			alt: entry.data.imageAlt ?? "",
			caption: entry.data.imageCaption,
		};
	}

	const borrowed = entry.data.heroEssay;
	if (!borrowed) return null;

	const essay = (await getArticles()).find((a) => a.slug === borrowed);
	if (!essay) {
		throw new Error(
			`fordjupning/${entry.id}.md: \`heroEssay\` references unknown essay slug "${borrowed}". ` +
				"Use a slug from data/articles/ (the filename without .md), or drop bespoke art at " +
				`src/assets/images/fordjupning/${entry.id}.webp instead.`,
		);
	}
	if (!essay.heroImage) return null;

	return {
		article: essay,
		// The borrowed photo's own description travels with it; the page only overrides
		// when it has authored something more specific.
		alt: entry.data.imageAlt ?? essay.imageAlt ?? "",
		caption: entry.data.imageCaption,
	};
}
