import { type CollectionEntry, getCollection } from "astro:content";
import type { ImageMetadata } from "astro";
import type { AmneName } from "./amnen";

export interface Article {
	slug: string;
	title: string;
	publishedAt: string;
	wordCount: number;
	readingTime: number;
	description: string;
	/** The essay's ämne (primary category), if assigned. */
	category?: AmneName;
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

// Content is immutable during a build, but getArticles() is called many times per
// page (index, Citat, AmnenSections, getTankare, getVerseOfDay…) and across the
// 2000+ generated pages. Cache the built+sorted array once so the map/sort and the
// per-entry shaping run a single time per build, not hundreds of times. The cached
// promise is shared, so concurrent callers await the same work.
let articlesCache: Promise<Article[]> | null = null;

async function buildArticles(): Promise<Article[]> {
	const entries = await getCollection("articles");
	return entries
		.map((entry) => ({
			slug: entry.id,
			title: entry.data.title,
			publishedAt: entry.data.publishedAt,
			wordCount: entry.data.wordCount,
			readingTime: Math.ceil(entry.data.wordCount / 200),
			description: entry.data.description,
			category: entry.data.category,
			audioFile: entry.data.audioFile,
			audioDuration: entry.data.audioDuration,
			heroImage: heroImageMap.get(entry.id),
			mobileHeroImage: mobileImageMap.get(entry.id),
			entry,
		}))
		.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export function getArticles(): Promise<Article[]> {
	articlesCache ??= buildArticles();
	return articlesCache;
}

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
