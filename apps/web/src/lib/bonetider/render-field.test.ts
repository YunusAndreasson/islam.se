import { describe, expect, it } from "vitest";
import { inkSchemeFor } from "./render-field";

/**
 * THE BUG (2026-09-17, reported from the page): after ʿIshāʾ the bönetider map in light
 * mode was "completely dark almost so you can not see the map at all".
 *
 * The twilight wash is laid over the land and sea FILLS, and everything structural is
 * drawn on top of it — the coastline, the Polcirkeln graticule, the city anchors. All of
 * them took their colour from the PAGE's scheme, so at full night the light scheme's
 * parchment was washed to a near-black indigo while its ink stayed the near-black chosen
 * for parchment. Dark on dark. Sweden's outline vanished (land and sea converge under
 * that wash, so the coast is the only thing holding the shape), every city name went to a
 * smudge, and the one legible mark left was the Stockholm pill — which survived only
 * because it carries its own plate.
 *
 * So ink is chosen from the ground the wash LEAVES, not from the page.
 *
 * THE SECOND REPORT (2026-11-21): with the ink flipped the map was legible, but after
 * ʿIshāʾ it was still a dark indigo block on the light page, beside a mosque map that
 * stays light — »strange«. The light night is unveiled now (washStopsLight.NIGHT, alpha
 * 0): the map keeps the page's theme at every hour, as the mosque map does. So these tests
 * pin that the light map's ground never goes dark enough to flip its ink, at any hour —
 * a flip would mean the dark block is back — and that dark mode never moves either.
 */

// Stockholm is at +2 in September, so these are 13:00, 20:00 and 23:00 local.
const NOON = new Date("2026-09-17T11:00:00Z");
const DUSK = new Date("2026-09-17T18:00:00Z");
const NIGHT = new Date("2026-09-17T21:00:00Z");

describe("inkSchemeFor", () => {
	it("keeps the light scheme's ink while the ground is still parchment", () => {
		expect(inkSchemeFor(NOON, "light")).toBe("light");
	});

	it("keeps the light scheme's ink at night, because the night no longer darkens the map", () => {
		// At 23:00 the ground is still the parchment and the sea: if this ever returns
		// "dark" again, the light page is showing a dark map after ʿIshāʾ.
		expect(inkSchemeFor(NIGHT, "light")).toBe("light");
	});

	it("never moves the dark scheme, whose ground is dark at every hour", () => {
		// --color LAND.dark (#3d382e) sits at relative luminance 0.040, well under the 0.18
		// crossover, before the wash touches it. Dark mode was never broken and must not
		// start flipping its inks at dusk.
		for (const now of [NOON, DUSK, NIGHT]) expect(inkSchemeFor(now, "dark")).toBe("dark");
	});

	it("reads light at every hour of a light-mode day, summer and winter", () => {
		// Swept hourly on a September and a November day (the long dark one the second
		// report came from), so a darker wash stop cannot quietly bring the dark block back
		// at some hour of the night.
		for (const month of [8, 10]) {
			const inks = Array.from({ length: 24 }, (_, h) =>
				inkSchemeFor(new Date(Date.UTC(2026, month, month === 8 ? 17 : 21, h)), "light"),
			);
			expect(inks.every((i) => i === "light")).toBe(true);
		}
	});
});
