import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { amneByName } from "../../lib/amnen";
import { type Article, getArticles } from "../../lib/articles";
import { ogEndpoint } from "../../lib/og-endpoints";

// One social card per essay (§11 OG). Essays with a hero get a photo card —
// their own image, cropped to a truthful 1200×630, with the title over a scrim.
// Essays without one fall back to the warm text card. Either way Base.astro's
// hardcoded og:image dimensions are now correct, which they were not while the
// raw 3:2/16:9 hero webp was being served as the card.

const imagesDir = join(process.cwd(), "src/assets/images");
const EXT = ["webp", "jpg", "jpeg", "png"];

function heroSource(slug: string): string | null {
	for (const ext of EXT) {
		const p = join(imagesDir, `${slug}.${ext}`);
		if (existsSync(p)) return p;
	}
	return null;
}

export async function getStaticPaths() {
	const articles = await getArticles();
	return articles.map((article) => ({ params: { slug: article.slug }, props: { article } }));
}

export const GET = ogEndpoint<{ article: Article }>(async ({ article }) => {
	const amne = article.category ? amneByName.get(article.category) : undefined;
	const source = heroSource(article.slug);
	const bgImage = source
		? await sharp(readFileSync(source))
				.resize(1200, 630, { fit: "cover", position: "attention" })
				.jpeg({ quality: 80 })
				.toBuffer()
		: undefined;
	return {
		kicker: amne?.name ?? "Essä",
		title: article.title,
		framing: article.description,
		bgImage,
	};
});
