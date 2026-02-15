import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const articles = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "../../data/articles" }),
	schema: z.object({
		title: z.string(),
		publishedAt: z.string(),
		wordCount: z.number(),
		description: z.string(),
	}),
});

export const collections = { articles };
