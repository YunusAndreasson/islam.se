import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AMNEN } from "./amnen";

// The essays' frontmatter, read from the files: the same source the content collection
// reads, without needing Astro to load it.
const dir = new URL("../../../../data/articles/", import.meta.url).pathname;
const essays = readdirSync(dir)
	.filter((f) => f.endsWith(".md"))
	.map((f) => {
		const head = readFileSync(`${dir}${f}`, "utf8").split("\n---\n")[0] ?? "";
		const category = /^category:\s*"?([^"\n]+)"?\s*$/m.exec(head)?.[1];
		return { slug: f.replace(/\.md$/, ""), category };
	});

describe("ämnen", () => {
	// Three essays stood without an ämne for months (»Någon att tacka«, »Döm maskinen
	// efter vad den gör«, »Måste du tro som dina föräldrar?«, found 2026-10-10). The
	// schema allows it, so that a fresh essay cannot break the build, and nothing else
	// noticed: they were simply missing from »Essäer efter ämne«, from every ämne page
	// and from the ämne filter, and their kicker fell back to a generic label.
	it("gives every published essay an ämne", () => {
		expect(essays.length, "no essays found — the path to data/articles moved").toBeGreaterThan(20);
		const names = new Set<string>(AMNEN.map((a) => a.name));
		const without = essays.filter((e) => !(e.category && names.has(e.category))).map((e) => e.slug);
		expect(
			without,
			"these essays carry no ämne (or one that is not in lib/amnen.ts), so no ämne page, tab or filter lists them — add `category:` to their frontmatter",
		).toEqual([]);
	});
});
