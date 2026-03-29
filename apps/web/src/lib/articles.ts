import { getCollection } from "astro:content";

type ImageMetadata = {
	src: string;
	width: number;
	height: number;
	format: string;
};

export interface Article {
	slug: string;
	title: string;
	publishedAt: string;
	wordCount: number;
	readingTime: number;
	description: string;
	audioFile?: string;
	audioDuration?: number;
	heroImage?: ImageMetadata;
	mobileHeroImage?: ImageMetadata;
	entry: Awaited<ReturnType<typeof getCollection>>[number];
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

export async function getArticles(): Promise<Article[]> {
	const entries = await getCollection("articles");

	return entries
		.map((entry) => ({
			slug: entry.id,
			title: entry.data.title,
			publishedAt: entry.data.publishedAt,
			wordCount: entry.data.wordCount,
			readingTime: Math.ceil(entry.data.wordCount / 200),
			description: entry.data.description,
			audioFile: entry.data.audioFile,
			audioDuration: entry.data.audioDuration,
			heroImage: heroImageMap.get(entry.id),
			mobileHeroImage: mobileImageMap.get(entry.id),
			entry,
		}))
		.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString("sv-SE", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/** Convert inline markdown (*italic*, **bold**) to HTML */
export function inlineMarkdown(text: string): string {
	return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
}
