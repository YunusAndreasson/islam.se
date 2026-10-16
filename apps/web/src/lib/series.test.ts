import { describe, expect, it } from "vitest";
import { seriesPosition } from "./series";

const valet = ["vid-samma-bord", "matstickan", "spegeln", "rosten", "sorgen", "marknaden"];

describe("seriesPosition", () => {
	it("numbers a part from one and names the parts either side", () => {
		expect(seriesPosition(valet, "spegeln")).toEqual({
			part: 3,
			parts: 6,
			prev: "matstickan",
			next: "rosten",
		});
	});

	it("gives the first part no previous and the last no next", () => {
		// The essay's end offers »Nästa del« only where there is one; a last part that
		// pointed past the end would send the reader to a part that does not exist.
		expect(seriesPosition(valet, "vid-samma-bord")).not.toHaveProperty("prev");
		expect(seriesPosition(valet, "marknaden")).not.toHaveProperty("next");
	});

	it("is null for an essay that is not a part of the series", () => {
		expect(seriesPosition(valet, "goliat-var-ocksa-ett-barn")).toBeNull();
	});

	it("counts only the members it is given, so an unpublished part holds no number", () => {
		// The caller passes the published members (lib/related.ts); the series page and
		// the front page count the same way, so »del 3 av 5« means the same everywhere.
		const published = valet.filter((slug) => slug !== "matstickan");
		expect(seriesPosition(published, "spegeln")).toMatchObject({ part: 2, parts: 5 });
	});
});
