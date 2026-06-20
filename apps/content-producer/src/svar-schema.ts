import { z } from "zod";

/**
 * Frontmatter the model must emit for a `/svar/` answer page.
 *
 * Mirrors the `svar` collection schema in apps/web/src/content.config.ts, minus
 * `publishedAt`/`updatedAt` — those are stamped by the producer at write time so
 * the model can't hallucinate a date. The bounds here are stricter than the
 * collection schema on purpose: keywords / faq / sources are OPTIONAL for the
 * site but REQUIRED for a page we expect to rank (FAQPage schema needs `faq`,
 * the Article `citation[]` block needs `sources`). Stricter input still satisfies
 * the looser collection schema at build time.
 *
 * Title/description bounds encode SERP limits: the rendered <title> is
 * `${title} — islam.se`, so keep `title` tight and front-load the primary
 * keyword; `description` is the meta description (Google truncates ~155–160).
 */
export const SvarFrontmatterSchema = z.object({
	title: z.string().min(12).max(65),
	question: z.string().min(8),
	description: z.string().min(110).max(170),
	keywords: z.array(z.string()).min(4),
	faq: z.array(z.object({ q: z.string(), a: z.string() })).min(3),
	sources: z.array(z.object({ name: z.string(), url: z.string().url().optional() })).min(2),
	related: z.array(z.string()).default([]),
});

export type SvarFrontmatter = z.infer<typeof SvarFrontmatterSchema>;
