import { type CollectionEntry, getCollection } from "astro:content";
import type { ImageMetadata } from "astro";
import type { AmneName } from "./amnen";
import { memoize } from "./cache";
import { basename } from "./path";

export interface Article {
	slug: string;
	title: string;
	publishedAt: string;
	/** Set only on a genuine later revision; drives dateModified + "Uppdaterad". */
	updatedAt?: string;
	wordCount: number;
	readingTime: number;
	/** The visible deck, shown on every card and index row. */
	description: string;
	/** Meta-description override for pages whose deck overruns the SERP cut.
	 *  Never rendered on the page — use `description` for anything visible. */
	seoDescription?: string;
	/** The essay's ämne (primary category), if assigned. */
	category?: AmneName;
	/** Image-specific alt for the hero photo; falls back to `title` when absent. */
	imageAlt?: string;
	/** Short visible figcaption under the hero (descriptive — never a credit). */
	imageCaption?: string;
	audioFile?: string;
	audioDuration?: number;
	heroImage?: ImageMetadata;
	mobileHeroImage?: ImageMetadata;
	entry: CollectionEntry<"articles">;
}

// Hero images keyed by slug — images live in src/assets/images/
const imageEntries = Object.entries(
	import.meta.glob<{ default: ImageMetadata }>("../assets/images/*.{jpg,jpeg,png,webp}", {
		eager: true,
	}),
);

function buildImageMap(
	predicate: (path: string) => boolean,
	stripExt: RegExp,
): Map<string, ImageMetadata> {
	return new Map(
		imageEntries
			.filter(([path]) => predicate(path))
			.map(([path, mod]) => [basename(path, stripExt), mod.default]),
	);
}

const heroImageMap = buildImageMap((path) => !path.includes("-mobile."), /\.[^.]+$/);
const mobileImageMap = buildImageMap((path) => path.includes("-mobile."), /-mobile\.[^.]+$/);

async function buildArticles(): Promise<Article[]> {
	const entries = await getCollection("articles");
	const built = entries
		.map((entry) => {
			const heroImage = heroImageMap.get(entry.id);
			const mobileHeroImage = mobileImageMap.get(entry.id);
			return {
				slug: entry.id,
				title: entry.data.title,
				publishedAt: entry.data.publishedAt,
				...(entry.data.updatedAt === undefined ? {} : { updatedAt: entry.data.updatedAt }),
				wordCount: entry.data.wordCount,
				readingTime: Math.ceil(entry.data.wordCount / 200),
				description: entry.data.description,
				...(entry.data.seoDescription === undefined
					? {}
					: { seoDescription: entry.data.seoDescription }),
				...(entry.data.category === undefined ? {} : { category: entry.data.category }),
				...(entry.data.imageAlt === undefined ? {} : { imageAlt: entry.data.imageAlt }),
				...(entry.data.imageCaption === undefined ? {} : { imageCaption: entry.data.imageCaption }),
				...(entry.data.audioFile === undefined ? {} : { audioFile: entry.data.audioFile }),
				...(entry.data.audioDuration === undefined
					? {}
					: { audioDuration: entry.data.audioDuration }),
				...(heroImage === undefined ? {} : { heroImage }),
				...(mobileHeroImage === undefined ? {} : { mobileHeroImage }),
				entry,
			};
		})
		.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

	// Guardrail: a hero image without image-specific alt silently regresses to the
	// title as alt (weak image SEO + no ImageObject caption). Warn at build so a
	// newly-dropped photo gets descriptive copy in its frontmatter.
	for (const a of built) {
		if (a.heroImage && !a.imageAlt) {
			console.warn(
				`[image-seo] ${a.slug}: hero image has no imageAlt — falls back to the title. ` +
					`Add imageAlt/imageCaption to data/articles/${a.slug}.md`,
			);
		}
	}

	return built;
}

// getArticles() is called many times per page (index, FaktaBand, getTankare…)
// and across the 2000+ generated pages; memoize() runs
// the build+sort+per-entry shaping once and shares the one promise. See lib/cache.ts.
export const getArticles = memoize(buildArticles);

export function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("sv-SE", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/** Convert inline markdown (*italic*, **bold**) to HTML. The surrounding text is
 *  HTML-escaped first so a stray `<` or `&` in an essay description renders as text,
 *  not as raw markup, when the result is piped through `set:html`. */
export function inlineMarkdown(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/** "1 essä" / "12 essäer" — Swedish essay-count label, used by collection pages. */
export function essayCount(count: number): string {
	return `${count} ${count === 1 ? "essä" : "essäer"}`;
}

/** Raw markdown body of an essay's content-collection entry. */
export function articleBody(article: Article): string {
	return article.entry.body ?? "";
}
