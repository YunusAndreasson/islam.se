import { type CollectionEntry, getCollection } from "astro:content";
import type { ImageMetadata } from "astro";
import type { AmneName } from "./amnen";
import { memoize } from "./cache";

export interface Article {
	slug: string;
	title: string;
	publishedAt: string;
	/** Set only on a genuine later revision; drives dateModified + "Uppdaterad". */
	updatedAt?: string;
	wordCount: number;
	readingTime: number;
	description: string;
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

const heroImageMap = new Map(
	imageEntries
		.filter(([path]) => !path.includes("-mobile."))
		.map(([path, mod]) => [
			path
				.split("/")
				.pop()
				?.replace(/\.[^.]+$/, ""),
			mod.default,
		]),
);

const mobileImageMap = new Map(
	imageEntries
		.filter(([path]) => path.includes("-mobile."))
		.map(([path, mod]) => [
			path
				.split("/")
				.pop()
				?.replace(/-mobile\.[^.]+$/, ""),
			mod.default,
		]),
);

async function buildArticles(): Promise<Article[]> {
	const entries = await getCollection("articles");
	const built = entries
		.map((entry) => ({
			slug: entry.id,
			title: entry.data.title,
			publishedAt: entry.data.publishedAt,
			updatedAt: entry.data.updatedAt,
			wordCount: entry.data.wordCount,
			readingTime: Math.ceil(entry.data.wordCount / 200),
			description: entry.data.description,
			category: entry.data.category,
			imageAlt: entry.data.imageAlt,
			imageCaption: entry.data.imageCaption,
			audioFile: entry.data.audioFile,
			audioDuration: entry.data.audioDuration,
			heroImage: heroImageMap.get(entry.id),
			mobileHeroImage: mobileImageMap.get(entry.id),
			entry,
		}))
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

// getArticles() is called many times per page (index, Citat, FaktaHome,
// getTankare, getVerseOfDay…) and across the 2000+ generated pages; memoize() runs
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
