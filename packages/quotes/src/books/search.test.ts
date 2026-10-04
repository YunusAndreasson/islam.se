import { describe, expect, it } from "vitest";
import { fuseByRank } from "./search.js";

const hit = (id: number, score: number | null = null) => ({ id, score });

describe("fuseByRank", () => {
	it("ranks a passage found by both meaning and wording above one found by either alone", () => {
		const byMeaning = [hit(1, 0.86), hit(2, 0.85), hit(3, 0.84)];
		const byWording = [hit(9), hit(3)];
		const fused = fuseByRank([byMeaning, byWording]);
		expect(
			fused[0]?.id,
			"passage 3 is in both lists and must lead; the old concept-boost ranking could not see wording at all",
		).toBe(3);
	});

	// Cosine scores from different queries or languages are not comparable, so a merge by
	// score let one language crowd out the other. Rank fusion must take from each list.
	it("interleaves lists instead of letting the higher raw scores win", () => {
		const arabic = [hit(1, 0.91), hit(2, 0.9), hit(3, 0.89)];
		const swedish = [hit(11, 0.6), hit(12, 0.59), hit(13, 0.58)];
		const top4 = fuseByRank([arabic, swedish])
			.slice(0, 4)
			.map((h) => h.id);
		expect(
			top4.filter((id) => id > 10),
			"the lower-scoring list must not be crowded out",
		).toHaveLength(2);
	});

	it("keeps the copy with a similarity score when a passage appears in both lists", () => {
		const fused = fuseByRank([[hit(5)], [hit(5, 0.8)]]);
		expect(fused).toHaveLength(1);
		expect(fused[0]?.score).toBe(0.8);
	});

	it("PROPERTY: returns each passage once and loses none", () => {
		const lists = [[hit(1, 0.9), hit(2, 0.8), hit(3, 0.7)], [hit(3), hit(4), hit(1)], []];
		const ids = fuseByRank(lists).map((h) => h.id);
		expect([...ids].sort()).toEqual([1, 2, 3, 4]);
		expect(fuseByRank([])).toEqual([]);
	});
});
