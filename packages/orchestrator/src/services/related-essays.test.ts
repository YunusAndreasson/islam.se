import { describe, expect, it } from "vitest";
import type { RelatedEssaysFindings } from "../schemas.js";
import {
	closestEssays,
	deadEssayLinks,
	linkEssayReferences,
	type PublishedEssay,
	relatedEssaysBlock,
	unlinkedEssayReferences,
	vetRelatedEssays,
} from "./related-essays.js";

const essays: PublishedEssay[] = [
	{
		slug: "bergen-som-vagrade",
		title: "Bergen som vägrade",
		text: `Koranen kallar människan *khalīfah*. Till David säger Gud: "Döm därför mellan
människor med sanningen och följ inte din lust."[^16] Bergen kunde inte fela.

[^16]: Koranen, Ṣād 38:26.`,
	},
	{
		slug: "vittnesmal-utan-vittne",
		title: "Vittnesmål utan vittne",
		text: `"Pennan är lyft från tre: den sovande tills han vaknar, barnet tills det når mognad."[^4]`,
	},
	{
		slug: "domaren-utan-svard",
		title: "Domaren utan svärd",
		text: "Härskarens tvångsmakt är det kraftfullaste medlet – och det farligaste.",
	},
	{
		slug: "ater-ni-var-for-sig",
		title: "Äter ni var för sig?",
		text: "Ibn Khaldūn beskriver ett kretslopp utan utväg.",
	},
];

type Relation = RelatedEssaysFindings["related"][number];

const relation = (slug: string, quote: string, over: Partial<Relation> = {}): Relation => ({
	slug,
	relation: "same-source",
	established: "Makten är anförtrodd.",
	quote,
	buildOn: "Följ den som fick makten.",
	...over,
});

const findings = (related: Relation[]): RelatedEssaysFindings => ({
	related,
	summary: "Essän fortsätter två tidigare.",
});

describe("vetRelatedEssays", () => {
	it("keeps a relation whose quote stands in the essay named", () => {
		const vetted = vetRelatedEssays(
			findings([relation("bergen-som-vagrade", "Bergen kunde inte fela.")]),
			essays,
		);
		expect(vetted.related.map((r) => r.slug)).toEqual(["bergen-som-vagrade"]);
		expect(vetted.rejected).toEqual([]);
	});

	// The model copies a sentence out of markdown: it drops the footnote mark and the quote
	// marks, and the essay breaks the line where the model does not. Rejecting that would
	// throw away an essay worth building on for a typographic reason.
	it("finds a quote across a line break, a footnote mark and quotation marks", () => {
		const vetted = vetRelatedEssays(
			findings([
				relation(
					"bergen-som-vagrade",
					"Döm därför mellan människor med sanningen och följ inte din lust. Bergen kunde inte fela.",
				),
			]),
			essays,
		);
		expect(
			vetted.related,
			"a verbatim sentence must survive the essay's own markup and line breaks",
		).toHaveLength(1);
	});

	// What the search exists to stop: the author told that an earlier essay »has shown«
	// something, on the model's word alone, and then saying so in print.
	it("rejects a quote the essay does not contain, and says where it does stand", () => {
		const vetted = vetRelatedEssays(
			findings([
				relation("bergen-som-vagrade", "Pennan är lyft från tre: den sovande tills han vaknar"),
				relation("bergen-som-vagrade", "Makten tillhör de vuxna och inte barnen."),
				relation("en-essa-som-inte-finns", "Bergen kunde inte fela."),
			]),
			essays,
		);
		expect(vetted.related, "no unverified relation may pass").toEqual([]);
		expect(vetted.rejected.map((r) => r.reason)).toEqual([
			"quote stands in vittnesmal-utan-vittne, not in this essay",
			"quote not found in the essay",
			"no published essay has this slug",
		]);
	});

	it("rejects a quote too short to anchor anything", () => {
		const vetted = vetRelatedEssays(findings([relation("bergen-som-vagrade", "David")]), essays);
		expect(vetted.related).toEqual([]);
		expect(vetted.rejected[0]?.reason).toBe("quote is under 3 words");
	});

	it("accepts a slug given with its file extension", () => {
		const vetted = vetRelatedEssays(
			findings([relation("bergen-som-vagrade.md", "Bergen kunde inte fela.")]),
			essays,
		);
		expect(vetted.related[0]?.slug).toBe("bergen-som-vagrade");
	});
});

describe("closestEssays", () => {
	it("takes the first essays in the stage's order, each once", () => {
		const vetted = vetRelatedEssays(
			findings([
				relation("domaren-utan-svard", "Härskarens tvångsmakt är det kraftfullaste medlet"),
				relation("bergen-som-vagrade", "Bergen kunde inte fela."),
				relation("domaren-utan-svard", "och det farligaste."),
				relation("ater-ni-var-for-sig", "Ibn Khaldūn beskriver ett kretslopp utan utväg."),
				relation("vittnesmal-utan-vittne", "Pennan är lyft från tre"),
			]),
			essays,
		);
		expect(closestEssays(vetted, essays).map((essay) => essay.slug)).toEqual([
			"domaren-utan-svard",
			"bergen-som-vagrade",
			"ater-ni-var-for-sig",
		]);
	});
});

describe("relatedEssaysBlock", () => {
	const vetted = vetRelatedEssays(
		findings([
			relation("bergen-som-vagrade", "Bergen kunde inte fela."),
			relation("bergen-som-vagrade", "Den här meningen står inte i essän alls."),
		]),
		essays,
	);

	it("gives the reader the vetted relation by title and the closest essay in full", () => {
		const block = relatedEssaysBlock(vetted, essays, "research");
		expect(block).toContain(
			'- "Bergen som vägrade" [bergen-som-vagrade] (same-source): Makten är anförtrodd. In its words: »Bergen kunde inte fela.« To build on: Följ den som fick makten.',
		);
		expect(block, "the closest essay must be there to read, not only described").toContain(
			'<earlier_essay title="Bergen som vägrade" slug="bergen-som-vagrade">\nKoranen kallar människan',
		);
		expect(block, "a rejected quote must not reach the prompt").not.toContain("står inte i essän");
	});

	// The author is the stage that writes the reference, so it alone is told how one is
	// written; research is told to name the essays in its summary.
	it("tells research to name the essays and the author how to refer to one", () => {
		expect(relatedEssaysBlock(vetted, essays, "research")).toContain("Say in your summary");
		const forAuthor = relatedEssaysBlock(vetted, essays, "author");
		expect(forAuthor).toContain("by its title in quotation marks");
		expect(forAuthor).not.toContain("Say in your summary");
	});

	// The editor's rule (2026-10-11): a reference to an earlier essay is always a link. The
	// first version of this instruction said »No link«, copied from the one reference that
	// existed, and both references in the first essay written with it came out unlinked.
	it("tells the author that a reference is a link, and shows the address form", () => {
		const forAuthor = relatedEssaysBlock(vetted, essays, "author");
		expect(forAuthor, "the author must be shown a linked reference to copy").toContain(
			'"[Folkmordet skrevs under i förväg](/folkmordet-skrevs-under-i-forvag/)"',
		);
		expect(forAuthor).toContain("`[Title](/slug/)`");
		expect(forAuthor).not.toMatch(/no link/i);
		expect(
			forAuthor,
			"the slug the author needs for the address must be in the list it reads",
		).toContain("[bergen-som-vagrade]");
	});

	it("is empty when no relation survived", () => {
		expect(relatedEssaysBlock(vetRelatedEssays(findings([]), essays), essays, "author")).toBe("");
	});
});

describe("deadEssayLinks", () => {
	// The author types the address from memory of the slugs it was shown. A wrong one is a
	// dead link on the page, in the feed and in the EPUB, and nothing else would notice.
	it("names a link whose slug is no published essay, and leaves the others alone", () => {
		const text = [
			'Essän "[Bergen som vägrade](/bergen-som-vagrade/)" har visat det.',
			'Jämför "[En essä som inte finns](/bergen-som-vagrar/)" och [samma igen](/bergen-som-vagrar).',
			"Se [bönetiderna för orten](/svar/vad-ar-bonen/), [källan](https://www.svt.se/kultur/x) och [not](#fn-1).",
		].join("\n\n");
		expect(
			deadEssayLinks(text, essays),
			"only a one-segment site path is an essay's address, and each dead one is named once",
		).toEqual(["/bergen-som-vagrar/"]);
	});

	it("finds nothing in a text without links", () => {
		expect(deadEssayLinks("Ingen i berättelsen växer.", essays)).toEqual([]);
	});
});

describe("linkEssayReferences", () => {
	// The bug this pins: »Goliat var också ett barn« (2026-10-11) named two earlier essays
	// and linked neither, because the author's instruction said »No link«. The editor's rule
	// is that a reference is always a link, so the code puts it in whatever a stage wrote.
	it("links a reference written in the house form, with the address from the file name", () => {
		const { text, linked } = linkEssayReferences(
			'Det har essän "Äter ni var för sig?" visat. Essäerna "Bergen som vägrade" och "Domaren utan svärd" går längre.',
			essays,
		);
		expect(text, "every reference to a published essay must come out as a link").toBe(
			'Det har essän "[Äter ni var för sig?](/ater-ni-var-for-sig/)" visat. Essäerna "[Bergen som vägrade](/bergen-som-vagrade/)" och "[Domaren utan svärd](/domaren-utan-svard/)" går längre.',
		);
		expect(linked.sort()).toEqual([
			"Bergen som vägrade",
			"Domaren utan svärd",
			"Äter ni var för sig?",
		]);
	});

	it("leaves a reference that is already a link exactly as it is", () => {
		const already = 'Det har essän "[Äter ni var för sig?](/ater-ni-var-for-sig/)" visat.';
		const { text, linked } = linkEssayReferences(already, essays);
		expect(text, "linking twice must not nest a link inside a link").toBe(already);
		expect(linked).toEqual([]);
	});

	// A title is sometimes an ordinary phrase or a quotation from a source. Only the word
	// »essän« before it says that the essay is meant, and a quoted source is never rewritten.
	it("does not link a title that is not named as an essay, or one inside a block quote", () => {
		const text = [
			'Han sade bara: "Bergen som vägrade" var allt han mindes.',
			'> I essän "Bergen som vägrade" står det så.',
			'## Essän "Bergen som vägrade"',
		].join("\n");
		expect(linkEssayReferences(text, essays).text).toBe(text);
	});
});

describe("unlinkedEssayReferences", () => {
	// What the code could not link goes to the editor: a title the author got slightly
	// wrong matches no file, and would otherwise ship as a reference without a link.
	it("names a reference whose title matches no published essay", () => {
		const { text } = linkEssayReferences(
			'Essän "Bergen som vägrade" och essän "Bergen som vägrar" säger olika saker.',
			essays,
		);
		expect(unlinkedEssayReferences(text)).toEqual(["Bergen som vägrar"]);
	});
});
