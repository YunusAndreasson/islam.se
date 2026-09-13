import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { buildGrid, buildLines } from "./field";

// The lattice the wall display contours. Latitude step 0.25 because that is where the
// bug lives — one row, at 68.75 — and a coarser step would step straight over it.
// Longitude is thinned to keep the test inside the suite's budget: the bad row spanned
// every one of its 55 longitudes, so 8 of them prove it just as well.
const BOUNDS: [number, number, number, number] = [-8, 50, 30, 72];
const drawnAt = (iso: string): string[] => {
	const date = new Date(iso);
	const grid = buildGrid(date, DEFAULT_SETTINGS, { bounds: BOUNDS, latStep: 0.25, lonStep: 5 });
	const { lines } = buildLines(grid, date.getTime());
	return (lines.features as { properties: { prayer: string } }[]).map((f) => f.properties.prayer);
};

describe("a prayer line is only drawn where the prayer is actually crossing the map", () => {
	// THE BUG: at 13:09 on 12 September 2026 the screen drew a doubled horizontal line
	// across the top of the map labelled ʿIshāʾ — in the early afternoon, when ʿIshāʾ was
	// not occurring anywhere inside the frame.
	//
	// It was not the contour code. On that lattice ʿIshāʾ came back 20:15–20:23 at every
	// one of 4 895 samples EXCEPT lat 68.75, where all 55 longitudes returned 05:03 — the
	// same morning rather than the coming evening, because the twilight solver takes the
	// wrong root on the row where the astronomical ʿIshāʾ is only just obtainable. The
	// field therefore ran +427, −486, +428 minutes across three adjacent rows, and
	// marching squares correctly found the two sign changes that spike contains.
	//
	// The tell is in the numbers: the nearest sample to zero anywhere in the lattice was
	// 408 minutes away, while Ẓuhr — a real crossing on the same lattice — had one a
	// single minute away. A contour with no sample near its own level is a discontinuity
	// being drawn, not an event.

	it("draws no ʿIshāʾ line in the early afternoon", () => {
		expect(drawnAt("2026-09-12T13:09:00+02:00")).not.toContain("isha");
	});

	it("still draws Ẓuhr at that same moment — the guard must not silence real lines", () => {
		expect(drawnAt("2026-09-12T13:09:00+02:00")).toContain("dhuhr");
	});

	it("draws each prayer's line when that prayer really is sweeping the map", () => {
		expect(drawnAt("2026-09-12T04:20:00+02:00")).toContain("fajr");
		expect(drawnAt("2026-09-12T16:30:00+02:00")).toContain("asr");
		expect(drawnAt("2026-09-12T19:40:00+02:00")).toContain("maghrib");
		expect(drawnAt("2026-09-12T21:05:00+02:00")).toContain("isha");
	});
});

describe("the twilight bracket", () => {
	// The invariant the solver broke, and the one the guard restores: the night twilights
	// bracket the solar day at every latitude and under every high-latitude rule. A
	// substitute ʿIshāʾ is still an evening. Anything on the wrong side of that is a wrong
	// root, so it is marked NaN rather than contoured.
	it("holds for every finite sample in the lattice", () => {
		const grid = buildGrid(new Date("2026-09-12T13:09:00+02:00"), DEFAULT_SETTINGS, {
			bounds: BOUNDS,
			latStep: 0.25,
			lonStep: 5,
		});
		const offenders: string[] = [];
		for (const [i, row] of grid.pt.entries()) {
			for (const [j, pt] of row.entries()) {
				const where = `lat ${grid.lats[i]}, lon ${grid.lons[j]}`;
				if (Number.isFinite(pt.fajr) && !(pt.fajr < pt.sunrise)) offenders.push(`fajr ${where}`);
				if (Number.isFinite(pt.isha) && !(pt.isha > pt.maghrib)) offenders.push(`isha ${where}`);
			}
		}
		expect(offenders, "a twilight landed on the wrong side of the solar day").toEqual([]);
	});
});
