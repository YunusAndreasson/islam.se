import { describe, expect, it } from "vitest";
import { essayHinges } from "./published-essays.js";

const essay = `---
title: "Kaffet inför rätta"
publishedAt: "2026-09-02T20:54:27.749Z"
description: "I Mecka 1511 ställdes kaffet inför rätta."
---

# Kaffet inför rätta

Regeln har en andra halva.[^1] Den står i Koranen 99:1, som brödtexten nämner utan not.

> Ett citat.[^2]

[^1]: Ibn Taymiyya, *Majmūʿ al-fatāwā* 21:535. Jämför Koranen 2:29.
[^2]: Koranen 6:119.
[^3]: Ibn Taymiyya, *Majmūʿ al-fatāwā* 29:16–17, med Koranen 42:21 och Koranen 2:29.
[^4]: Ibn Rajab al-Ḥanbalī, *Jāmiʿ al-ʿulūm wa-l-ḥikam* 2:166–167.
[^5]: Återgiven av al-Bukhārī och Muslim, från ʿĀʾisha.
[^6]: Koranen, al-Baqarah 2:269.
`;

describe("essayHinges", () => {
	const hinges = essayHinges(essay);

	it("reads the title and description from the frontmatter", () => {
		expect(hinges.title).toBe("Kaffet inför rätta");
		expect(hinges.description).toBe("I Mecka 1511 ställdes kaffet inför rätta.");
	});

	// The research stage picks its hinge from this list. A verse cited twice must appear once,
	// and a verse only mentioned in the prose is not a source the essay rests on.
	it("lists each verse the notes cite once, in order", () => {
		expect(
			hinges.verses,
			"both note styles must be read: »Koranen 2:29« and the older »Koranen, al-Baqarah 2:269«",
		).toEqual(["2:29", "6:119", "42:21", "2:269"]);
	});

	it("lists the works the notes cite, most cited first, and skips notes that name no work", () => {
		expect(hinges.works).toEqual([
			"Ibn Taymiyya, Majmūʿ al-fatāwā",
			"Ibn Rajab al-Ḥanbalī, Jāmiʿ al-ʿulūm wa-l-ḥikam",
		]);
	});

	it("returns empty lists for a text with no notes", () => {
		expect(essayHinges('---\ntitle: "Utan noter"\n---\n\nText.')).toMatchObject({
			title: "Utan noter",
			verses: [],
			works: [],
		});
	});
});
