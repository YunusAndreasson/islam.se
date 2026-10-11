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

// The site lays a tonal wash over every essay picture (EssayImage.astro: saturation
// 0.72 and a little sepia) so that pictures made for the site read as one set. A
// documentary photograph is not such a picture. The two Gaza heroes stood under the
// wash, on top of files that had been desaturated once already, and Jabalia's blue
// sky was shown grey (2026-10-11). `imageDocumentary: true` takes the wash off, and
// the credit in the first note is what says a hero is a documentary photograph.
describe("documentary heroes", () => {
	it("shows a credited hero photograph without the tonal wash", () => {
		const washed = essays()
			.filter((e) => credited(e.body) && !flagged(e.frontmatter))
			.map((e) => e.name);
		expect(
			washed,
			"these essays credit their hero to a photographer (»Bilden överst: …«) but lack `imageDocumentary: true`, so the site would desaturate a documentary photograph",
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
