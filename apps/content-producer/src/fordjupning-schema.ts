import * as z from "zod";

/**
 * Frontmatter contract for an /fordjupning/ pillar page.
 *
 * Deliberately stricter than the Astro collection schema (same asymmetry as
 * svar-schema.ts): the site only needs the fields to be present, but a page expected to
 * rank on a broad head term needs them to be substantial. The minimums below are what
 * the rubric requires, enforced before anything is written to disk.
 *
 * ⚠️ `publishedAt` and `wordCount` are absent on purpose — the producer stamps them, so
 * the model cannot date its own page or misreport its length.
 */
export const FordjupningFrontmatterSchema = z.object({
	/** SERP framing; leads with the head term. */
	title: z.string().min(10).max(65),
	/** The head entity alone ("Hijab") — the visible h1 and schema.org about.name. */
	term: z.string().min(2).max(40),
	/** Visible deck. ⚠️ Must NOT restate the body's opening sentence: with a bare
	 *  one-word h1 the deck is the page's framing line, and on the answer pages the
	 *  near-verbatim repeat was bad enough that the template stopped rendering it. */
	description: z.string().min(140).max(320),
	/** Authored short form for <meta description> when the deck overruns the SERP. */
	seoDescription: z.string().min(80).max(165).optional(),
	/** ⚠️ A CARD LINE, not a third description. It sits under the term on the index and
	 *  in the Frågor & svar band, where `description` ran to four lines on a phone.
	 *  One clause, no full stop needed, and it must not repeat the term itself. */
	blurb: z.string().min(40).max(95),
	keywords: z.array(z.string()).min(6),
	/** Grounds the page to the global entity. Wikidata + Wikipedia carry the weight. */
	about: z.object({
		name: z.string().min(2),
		sameAs: z.array(z.string().url()).min(1),
	}),
	/** Real follow-up questions that do NOT restate the section headings. */
	faq: z.array(z.object({ q: z.string().min(8), a: z.string().min(40) })).min(4),
	/** ≥8 because the page is roughly four times an answer page — the bar scales with it. */
	sources: z.array(z.object({ name: z.string().min(3), url: z.string().url().optional() })).min(8),
	/** Slugs of the /svar/ answer pages this pillar sits above (the spokes). */
	related: z.array(z.string()).default([]),
	essays: z.array(z.string()).default([]),
	imageAlt: z.string().optional(),
	imageCaption: z.string().optional(),
	/** Deliberately NOT produced by the model: which photograph suits a page is an
	 *  editorial judgement, and a wrong one is worse than none. A human sets it (or
	 *  drops bespoke art in src/assets/images/fordjupning/) after review. */
	heroEssay: z.string().optional(),
});

export type FordjupningFrontmatter = z.infer<typeof FordjupningFrontmatterSchema>;
