import { describe, expect, it } from "vitest";
import { marchingSquares } from "./contour";

describe("marchingSquares malformed grids", () => {
	const lats = [55, 60, 65];
	const lons = [10, 15, 20];

	it("keeps valid bands and skips a missing row", () => {
		const segments = marchingSquares(lats, lons, [
			[1, 1, 1],
			[-1, -1, -1],
		]);

		expect(segments.length).toBeGreaterThan(0);
		for (const [a, b] of segments) {
			expect([...a, ...b].every(Number.isFinite)).toBe(true);
			expect(Math.max(a[1], b[1])).toBeLessThanOrEqual(60);
		}
	});

	it("skips cells with missing corners instead of producing NaN geometry", () => {
		const segments = marchingSquares(lats.slice(0, 2), lons, [
			[1, 1, 1],
			[-1, -1],
		]);

		for (const [a, b] of segments) {
			expect([...a, ...b].every(Number.isFinite)).toBe(true);
			expect(Math.max(a[0], b[0])).toBeLessThan(20);
		}
	});
});
