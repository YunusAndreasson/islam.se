import { describe, expect, it } from "vitest";
import { essayParagraphs, harvestEdits } from "./harvest.js";

const final = `# Marknaden i raden

Innan bönen började gick Guds sändebud genom raderna.

Därför drar jag gränsen snävare än fatwan.

Versen gäller förord.[^1]

---

[^1]: Koranen 4:85.`;

const published = `---
title: "Marknaden i raden"
description: "Veckan efter valet."
---
Innan bönen började gick Guds sändebud genom raderna.

Gränsen blir därför snävare än fatwan.

Versen gäller förord.[^1]

---

[^1]: Koranen 4:85.`;

describe("harvestEdits", () => {
	it("strips frontmatter, the H1 and the footnote rule before comparing", () => {
		expect(essayParagraphs(published)[0]).toBe(
			"Innan bönen började gick Guds sändebud genom raderna.",
		);
		expect(essayParagraphs(final)).toHaveLength(4);
	});

	// The hand edit that removed first person from »Marknaden i raden« is exactly the
	// signal this records: one paragraph changed, with the words that changed.
	it("reports the changed paragraph and its word-level edits", () => {
		const result = harvestEdits(final, published);
		expect(result.edits).toHaveLength(1);
		expect(result.edits[0]?.before).toBe("Därför drar jag gränsen snävare än fatwan.");
		expect(result.edits[0]?.words.join(" ")).toContain("jag");
		expect(result.unchangedShare).toBe(0.75);
	});

	it("reports nothing when the essay shipped as produced", () => {
		expect(harvestEdits(final, final).edits).toEqual([]);
	});

	// final.md puts a blank line between footnotes and the publisher writes them as one
	// block. The first real harvest (»Talet före bomben«) counted every footnote as edited
	// and reported 48 % unchanged; an untouched essay must come out at 100 %.
	it("compares footnotes one by one, however the publisher spaced them", () => {
		const spaced = "Ett stycke.[^1][^2]\n\n---\n\n[^1]: Första källan.\n\n[^2]: Andra källan.";
		const packed =
			'---\ntitle: "T"\n---\nEtt stycke.[^1][^2]\n\n---\n[^1]: Första källan.\n[^2]: Andra källan.';
		expect(harvestEdits(spaced, packed).unchangedShare).toBe(1);
		const edited = packed.replace("Andra källan.", "Andra källan, s. 12.");
		expect(harvestEdits(spaced, edited).edits.map((e) => e.before)).toEqual([
			"[^2]: Andra källan.",
		]);
	});
});
