import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publicationFromRun, publicationTarget } from "./run-publication.js";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "run-publication-"));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const write = (file: string, data: unknown) =>
	writeFileSync(join(dir, file), typeof data === "string" ? data : JSON.stringify(data), "utf-8");

/** What a run that passed the final read leaves behind. */
function finishedRun() {
	write("final.md", "# Goliat var också ett barn\n\nTexten.");
	write("metadata.json", {
		topic: "Lalehs Goliat",
		producedAt: "2026-10-11T12:00:00.000Z",
		title: "Goliat var också ett barn",
		description: "Barnen sjunger att de ska bli mäktiga.",
		qualityScore: 8.6,
		wordCount: 1800,
		revisionCount: 1,
		reviewRounds: 2,
		evaluation: {
			before: 20,
			after: 18,
			actionableBefore: 3,
			actionableAfter: 1,
			houseBefore: 2,
			houseAfter: 0,
		},
		openIssues: 4,
		models: ["claude-opus-5-5"],
	});
	write("research.json", {
		sources: [{ url: "https://www.svt.se/kultur/x" }, { title: "utan länk" }],
	});
	write("draft-meta.json", { struggles: "Sångtexten.", efficiencySuggestions: "En briefing." });
	write("review.json", { issues: ["En mening upprepas."] });
}

describe("publicationFromRun", () => {
	it("reads the record a publishing run would have written", () => {
		finishedRun();
		const record = publicationFromRun(dir);
		expect(record).toMatchObject({
			outputDir: dir,
			topic: "Lalehs Goliat",
			title: "Goliat var också ett barn",
			description: "Barnen sjunger att de ska bli mäktiga.",
			qualityScore: 8.6,
			wordCount: 1800,
			reviewRounds: 2,
			revisionCount: 1,
			models: ["claude-opus-5-5"],
			openIssues: 4,
			reviewerIssues: ["En mening upprepas."],
			struggles: "Sångtexten.",
			efficiencySuggestions: "En briefing.",
		});
		expect(record.sourceUrls, "a source without a link has nothing for the domain tracker").toEqual(
			["https://www.svt.se/kultur/x"],
		);
		expect(
			record.producedAt,
			"the feedback log dates the essay to when it was produced, not when it was published",
		).toBe("2026-10-11T12:00:00.000Z");
	});

	// The feedback log has always held the ACTIONABLE issue counts. metadata.json stores
	// both those and the totals, under other names; reading the totals would make every
	// essay published afterwards look five times worse than its neighbours in the log.
	it("takes the actionable evaluation counts, as the log does for a publishing run", () => {
		finishedRun();
		expect(publicationFromRun(dir).evaluation).toEqual({
			before: 3,
			after: 1,
			houseBefore: 2,
			houseAfter: 0,
		});
	});

	// The gate. A run that fails the final read writes candidate.md and returns before
	// final.md and metadata.json exist. Publishing afterwards must not be a way round it.
	it("refuses a run that did not pass the final read", () => {
		write("candidate.md", "# Underkänd\n\nTexten.");
		write("research.json", { sources: [] });
		expect(
			() => publicationFromRun(dir),
			"a failed run has no final.md and must not publish",
		).toThrow(/Ingen final\.md/);
	});

	it("refuses a run whose metadata was never written", () => {
		write("final.md", "# Titel\n\nTexten.");
		expect(() => publicationFromRun(dir)).toThrow(/metadata\.json/);
	});
});

describe("publicationTarget", () => {
	// The essay in data/articles may have been edited by hand since the run. The command
	// asks before it overwrites one, and this is what it asks with.
	it("says whether an essay already stands at the title's slug", () => {
		const articles = join(dir, "articles");
		mkdirSync(articles);
		const free = publicationTarget({ title: "Goliat var också ett barn" }, articles);
		expect(free.slug).toBe("goliat-var-ocksa-ett-barn");
		expect(free.exists).toBe(false);

		writeFileSync(join(articles, "goliat-var-ocksa-ett-barn.md"), "redigerad för hand", "utf-8");
		expect(publicationTarget({ title: "Goliat var också ett barn" }, articles).exists).toBe(true);
	});
});
