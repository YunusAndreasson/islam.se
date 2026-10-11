/**
 * The earlier essays a new one should build on: every published essay, read in full
 * against the idea.
 *
 * ⚠️ Each essay used to be written as if it were the first. `publishedEssaysBlock` shows
 * research which verses and works the others cite, which exposes a shared source and
 * nothing of what an essay argued; the one time an essay referred to an earlier one
 * (»Om dessa ord når er«, 2026-10) it came from a single line in the research summary.
 * This stage finds where the earlier essays have already been, and the closest of them go
 * to research and the author in full, to be continued and named.
 *
 * The model is not trusted on what an essay says. It must quote a sentence for every
 * relation, and the code here searches for that sentence in the essay it names. On the
 * »Goliat« idea (2026-10-11) all 24 of Opus's quotes were verbatim, and it found David as
 * ruler (38:26) in `bergen-som-vagrade`, which a grep for »kung david|dāwūd« had missed.
 *
 * Whether an idea is too close to a published essay to be written is the editor's
 * decision. Nothing here judges it.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RelatedEssaysFindings } from "../schemas.js";

export interface PublishedEssay {
	slug: string;
	title: string;
	text: string;
}

type Relation = RelatedEssaysFindings["related"][number];

export interface VettedRelatedEssays {
	summary: string;
	/** Relations whose quote stands in the essay named, the most useful first. */
	related: Relation[];
	/** Relations the model reported and the search did not bear out. */
	rejected: Array<{ relation: Relation; reason: string }>;
}

/** A quote shorter than this is found almost anywhere and anchors nothing. */
const MIN_QUOTE_WORDS = 3;
/** How many of the closest essays research and the author read whole. */
const ESSAYS_IN_FULL = 3;

/** Every published essay, in file order. The directory also holds the audio scripts. */
export function readPublishedEssays(articlesDir: string): PublishedEssay[] {
	if (!existsSync(articlesDir)) return [];
	return readdirSync(articlesDir)
		.filter((file) => file.endsWith(".md"))
		.sort()
		.map((file) => {
			const text = readFileSync(join(articlesDir, file), "utf-8").trim();
			const title = /^title:\s*"?(.*?)"?\s*$/m.exec(text.slice(0, 2000))?.[1]?.trim() ?? "";
			return { slug: file.slice(0, -3), title, text };
		});
}

/** The essays as the stage reads them: whole, each under its slug. */
export function fullEssaysBlock(essays: PublishedEssay[]): string {
	const body = essays
		.map((essay) => `<essay slug="${essay.slug}">\n${essay.text}\n</essay>`)
		.join("\n\n");
	return `<published_essays>\n${body}\n</published_essays>`;
}

const squash = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim();

/** Without footnote marks, emphasis and quotation marks: a sentence copied across one of
 *  those is still the essay's sentence. */
const loose = (text: string) =>
	squash(
		text
			.replace(/\[\^[^\]]+\]/g, "")
			.replace(/[*_>]/g, "")
			.replace(/["“”»«'’‘]/g, ""),
	).toLowerCase();

function contains(essay: PublishedEssay, quote: string): boolean {
	return squash(essay.text).includes(squash(quote)) || loose(essay.text).includes(loose(quote));
}

/**
 * Keep the relations the essays bear out and set the rest aside.
 *
 * A relation survives when its quote stands in the essay it names. Nothing is repaired: a
 * quote found in another essay than the one named is rejected with that said, because the
 * model's account of what the essay established belongs to the essay it thought it read.
 */
export function vetRelatedEssays(
	findings: RelatedEssaysFindings,
	essays: PublishedEssay[],
): VettedRelatedEssays {
	const bySlug = new Map(essays.map((essay) => [essay.slug, essay]));
	const related: Relation[] = [];
	const rejected: VettedRelatedEssays["rejected"] = [];

	for (const raw of findings.related) {
		const relation = { ...raw, slug: raw.slug.trim().replace(/\.md$/, "") };
		const essay = bySlug.get(relation.slug);
		if (!essay) {
			rejected.push({ relation, reason: "no published essay has this slug" });
		} else if (squash(relation.quote).split(" ").length < MIN_QUOTE_WORDS) {
			rejected.push({ relation, reason: `quote is under ${MIN_QUOTE_WORDS} words` });
		} else if (contains(essay, relation.quote)) {
			related.push(relation);
		} else {
			const elsewhere = essays
				.filter((other) => contains(other, relation.quote))
				.map((other) => other.slug);
			rejected.push({
				relation,
				reason:
					elsewhere.length > 0
						? `quote stands in ${elsewhere.join(", ")}, not in this essay`
						: "quote not found in the essay",
			});
		}
	}

	return { summary: findings.summary, related, rejected };
}

/** The closest essays, in the order the stage ranked them. */
export function closestEssays(
	vetted: VettedRelatedEssays,
	essays: PublishedEssay[],
	limit = ESSAYS_IN_FULL,
): PublishedEssay[] {
	const bySlug = new Map(essays.map((essay) => [essay.slug, essay]));
	const slugs = [...new Set(vetted.related.map((relation) => relation.slug))].slice(0, limit);
	return slugs.flatMap((slug) => bySlug.get(slug) ?? []);
}

/**
 * Links in an essay's text that look like a link to another essay and lead nowhere.
 *
 * The author writes a reference as »[Title](/slug/)« from the slugs it was shown, and a
 * slug it misremembers is a dead link on the page, in the feed and in the EPUB. A
 * one-segment site path is an essay's address; anything else (»/svar/…«, an anchor, an
 * outside URL) is not judged here.
 */
export function deadEssayLinks(text: string, essays: PublishedEssay[]): string[] {
	const slugs = new Set(essays.map((essay) => essay.slug));
	const dead = new Set<string>();
	for (const match of text.matchAll(/\]\(\/([^/()\s#?]+)\/?\)/g)) {
		const slug = match[1];
		if (slug && !slugs.has(slug)) dead.add(`/${slug}/`);
	}
	return [...dead];
}

/** The quotation marks a title may stand in. */
const OPENING = '"“”»';
const CLOSING = '"”«';
/** Lines a reference is never rewritten on: quoted sources, headings, code. */
const UNTOUCHED_LINE = /^(>|#{1,6}\s|```)/;

/**
 * Make every reference to an earlier essay a link, in code.
 *
 * ⚠️ The editor's rule: a reference to an earlier essay is always a link. The author is
 * told so, but the first essay written with references (»Goliat var också ett barn«,
 * 2026-10-11) carried two without one, and an instruction is not a guarantee. The house
 * form is the word »essän« and the title in quotation marks; where the title is exactly
 * a published essay's, the link is put in here, with the address taken from the file
 * name and never from the model.
 *
 * The word »essä…« must stand shortly before the title, in the same paragraph: a title can
 * also be an ordinary quotation (»Någon att tacka« is Strindberg's phrase before it is an
 * essay's name). The reach is long enough for »essäerna "A" och "B"«.
 */
export function linkEssayReferences(
	text: string,
	essays: PublishedEssay[],
): { text: string; linked: string[] } {
	const linked: string[] = [];
	const titled = essays.filter((essay) => essay.title.length >= 4);
	const lines = text.split("\n").map((line) => {
		if (UNTOUCHED_LINE.test(line)) return line;
		let out = line;
		for (const essay of titled) {
			const title = essay.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const pattern = new RegExp(
				`(\\bessä\\p{L}*[^\\n]{0,120}?[${OPENING}])${title}([${CLOSING}])`,
				"giu",
			);
			out = out.replace(pattern, (_match, before: string, close: string) => {
				linked.push(essay.title);
				return `${before}[${essay.title}](/${essay.slug}/)${close}`;
			});
		}
		return out;
	});
	return { text: lines.join("\n"), linked: [...new Set(linked)] };
}

/**
 * References in the house form that carry no link: the title named after »essän« matched
 * no published essay, so the code could not link it. For the editor.
 */
export function unlinkedEssayReferences(text: string): string[] {
	const found = new Set<string>();
	for (const line of text.split("\n")) {
		if (UNTOUCHED_LINE.test(line)) continue;
		const pattern = new RegExp(
			`\\bessä(?:n|erna)\\s+[${OPENING}]([^${OPENING}${CLOSING}\\[\\]\\n]{3,120})[${CLOSING}]`,
			"giu",
		);
		for (const match of line.matchAll(pattern)) if (match[1]) found.add(match[1]);
	}
	return [...found];
}

/** What each reader of the block is asked to do with it. */
const USE = {
	research:
		"Read them before you settle this essay's hinge, and build on them. Where an earlier essay has already shown something this essay needs, take it as shown and gather material for the step it did not take; do not gather the same material to argue it again. Say in your summary which one or two earlier essays this one continues, what each has shown, and what this essay adds.",
	author: `Build on them. Where an earlier essay has already shown something this essay needs, take it as shown and go on from there instead of arguing it again, and never reuse its sentences or its quotations as this essay's own.

Where this essay stands on an earlier essay's result, say so once in the running text: name the essay by its title in quotation marks, make the title a link to it, and state what it showed, as an earlier essay did: »Armén räknade de döda innan bomben föll; det har essän "[Folkmordet skrevs under i förväg](/folkmordet-skrevs-under-i-forvag/)" visat.« The essay's address is its slug, given in square brackets in the list above, between two slashes: \`[Title](/slug/)\`, with the quotation marks outside the link. A reference to an earlier essay is always a link. One such reference, two at most, and only where this essay really continues the earlier one. No footnote, no first person, and none at all when nothing is built on.`,
} as const;

/**
 * The `<earlier_essays>` block for research or the author, or "" when no relation survived.
 * Only vetted relations go in, and the closest essays follow in full.
 */
export function relatedEssaysBlock(
	vetted: VettedRelatedEssays,
	essays: PublishedEssay[],
	reader: keyof typeof USE,
): string {
	if (vetted.related.length === 0) return "";
	const titles = new Map(essays.map((essay) => [essay.slug, essay.title]));
	const lines = vetted.related.map((relation) => {
		const title = titles.get(relation.slug) || relation.slug;
		return `- "${title}" [${relation.slug}] (${relation.relation}): ${relation.established} In its words: »${squash(relation.quote)}« To build on: ${relation.buildOn}`;
	});
	const whole = closestEssays(vetted, essays).map(
		(essay) =>
			`<earlier_essay title="${essay.title}" slug="${essay.slug}">\n${essay.text}\n</earlier_essay>`,
	);
	return [
		"<earlier_essays>",
		"islam.se is one body of work. Before this run, every published essay was read in full against this essay's idea; below is where the earlier essays have already been on its ground, the most useful first. Each quoted sentence was found, word for word, in the essay named.",
		vetted.summary,
		lines.join("\n"),
		USE[reader],
		`The ${whole.length === 1 ? "closest essay follows" : `${whole.length} closest essays follow`} in full.`,
		whole.join("\n\n"),
		"</earlier_essays>",
	].join("\n\n");
}
