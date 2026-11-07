import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ARTICLES = new URL("../../../../data/articles/", import.meta.url);

/** An essay's frontmatter and its body, split on the first two `---` lines. */
function essays(): { name: string; frontmatter: string; body: string }[] {
	return readdirSync(ARTICLES)
		.filter((name) => name.endsWith(".md"))
		.map((name) => {
			const lines = readFileSync(new URL(name, ARTICLES), "utf8").split("\n");
			const end = lines.indexOf("---", 1);
			return {
				name,
				frontmatter: lines.slice(1, end).join("\n"),
				body: lines.slice(end + 1).join("\n"),
			};
		});
}

const flagged = (frontmatter: string) => /^imageDocumentary: true$/m.test(frontmatter);
const credited = (body: string) => body.includes("Bilden överst:");

// `imageDocumentary: true` says a hero is a photograph of a real place by a named
// photographer: cut from the original with no colour change, credited in the first note
// (»Bilden överst: …«), and never regraded or redrawn by an image model. It once also
// took the site's tonal wash off; the wash came off every picture on 2026-11-07, but the
// two Gaza heroes had first been desaturated in the FILE (Jabalia's blue sky stood grey,
// 2026-10-11), and the flag is how the archive knows which pictures must not be touched.
describe("documentary heroes", () => {
	it("flags every hero it credits to a photographer", () => {
		const unflagged = essays()
			.filter((e) => credited(e.body) && !flagged(e.frontmatter))
			.map((e) => e.name);
		expect(
			unflagged,
			"these essays credit their hero to a photographer (»Bilden överst: …«) but lack `imageDocumentary: true`, so nothing marks the picture as a document to be shown as taken",
		).toEqual([]);
	});

	it("credits every hero it shows as a document", () => {
		const uncredited = essays()
			.filter((e) => flagged(e.frontmatter) && !credited(e.body))
			.map((e) => e.name);
		expect(
			uncredited,
			"`imageDocumentary: true` claims the hero is someone's photograph; the essay's first note must then say whose (»Bilden överst: …«)",
		).toEqual([]);
	});
});
