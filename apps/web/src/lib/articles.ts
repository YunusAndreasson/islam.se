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
	heroImage?: ImageMetadata;
	entry: Awaited<ReturnType<typeof getCollection>>[number];
}

// Hero images keyed by slug — images live in src/assets/images/
const heroImages = import.meta.glob<{ default: ImageMetadata }>(
	"../assets/images/*.{jpg,jpeg,png,webp}",
	{ eager: true },
);

function findHeroImage(slug: string): ImageMetadata | undefined {
	for (const [path, mod] of Object.entries(heroImages)) {
		const filename = path
			.split("/")
			.pop()
			?.replace(/\.[^.]+$/, "");
		if (filename === slug) return mod.default;
	}
	return undefined;
}

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
			heroImage: findHeroImage(entry.id),
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
