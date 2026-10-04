import { describe, expect, it } from "vitest";
import { editorEditExamples } from "./editor-edits.js";

const harvest = (slug: string, harvestedAt: string, ...words: string[][]) => ({
	type: "human-edits",
	slug,
	harvestedAt,
	edits: words.map((w) => ({ words: w })),
});

describe("editorEditExamples", () => {
	it("keeps rewordings and drops markup, punctuation and inserted images", () => {
		const examples = editorEditExamples([
			harvest("a", "2026-10-01", [
				"»lagens bärare« → »de lagkunniga«",
				"»« → »**«",
				"»; nästan« → ». Nästan«",
				"»,« → »«",
				"»Varför?« → »«",
				"»text« → »![En bild](../bild.webp)«",
				"»Över 200« → »Den 18 september hade över 2 000«",
				"»veckor« → »veckorna av bombningarna i höstas«",
			]),
		]);
		expect(
			examples,
			"a changed figure or added content is a correction of fact; shown to the language stage it would teach it to change claims",
		).toEqual(["»lagens bärare« → »de lagkunniga«", "»; nästan« → ». Nästan«"]);
	});

	// Harvests of one essay are cumulative: the fourth harvest of »Kaffet inför rätta« repeats
	// the first three. Reading all four would show the model each pair up to four times.
	it("reads only the latest harvest of each essay", () => {
		const examples = editorEditExamples([
			harvest("kaffe", "2026-10-02", ["»litet« → »lite«"]),
			harvest("kaffe", "2026-10-04", ["»litet« → »lite«", "»kom ned« → »uppenbarades«"]),
			{ type: "run", slug: "kaffe", harvestedAt: "2026-10-05" },
		]);
		expect(examples).toEqual(["»litet« → »lite«", "»kom ned« → »uppenbarades«"]);
	});

	it("takes from each essay in turn, so one heavily edited essay does not fill the sample", () => {
		const letters = "abcdefghijklmnopqrstuvwxyzåäö";
		const many = [...letters].map((c) => `»gammalt ord${c}« → »nytt ord${c}«`);
		const examples = editorEditExamples(
			[
				harvest("stor", "2026-10-04", many),
				harvest("liten", "2026-10-01", ["»spår av« → »tecken på«", "»krigets« → »de«"]),
			],
			6,
		);
		expect(examples).toHaveLength(6);
		expect(
			examples.filter((e) => e.includes("tecken på") || e.includes("krigets")),
			"both pairs from the lightly edited essay must be in a sample of six",
		).toHaveLength(2);
	});

	it("returns nothing when there are no harvests", () => {
		expect(editorEditExamples([])).toEqual([]);
		expect(editorEditExamples([{ type: "run" }])).toEqual([]);
	});
});
