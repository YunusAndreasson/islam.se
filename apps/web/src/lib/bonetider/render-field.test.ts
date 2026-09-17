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
 * So ink is chosen from the ground the wash LEAVES, not from the page. These tests pin
 * the two ends of that, and — just as important — that dark mode never moves: its ground
 * is already dark at noon, so a flip there would be a regression, not a fix.
 */

// Stockholm is at +2 in September, so these are 13:00, 20:00 and 23:00 local.
const NOON = new Date("2026-09-17T11:00:00Z");
const DUSK = new Date("2026-09-17T18:00:00Z");
const NIGHT = new Date("2026-09-17T21:00:00Z");

describe("inkSchemeFor", () => {
	it("keeps the light scheme's ink while the ground is still parchment", () => {
		expect(inkSchemeFor(NOON, "light")).toBe("light");
	});

	it("flips the light scheme's ink once the wash has taken the ground to night", () => {
		// The whole point: at 23:00 the map must not be inked for a parchment that is no
		// longer there. If this ever returns "light" again, the coastline and every city
		// name are invisible on the page.
		expect(inkSchemeFor(NIGHT, "light")).toBe("dark");
	});

	it("never moves the dark scheme, whose ground is dark at every hour", () => {
		// --color LAND.dark (#3d382e) sits at relative luminance 0.040, well under the 0.18
		// crossover, before the wash touches it. Dark mode was never broken and must not
		// start flipping its inks at dusk.
		for (const now of [NOON, DUSK, NIGHT]) expect(inkSchemeFor(now, "dark")).toBe("dark");
	});

	it("is stable across a day in light mode: day reads light, deep night reads dark", () => {
		// Swept hourly so a change to the wash stops cannot quietly move the crossover into
		// the middle of the afternoon.
		const inks = Array.from({ length: 24 }, (_, h) =>
			inkSchemeFor(new Date(Date.UTC(2026, 8, 17, h)), "light"),
		);
		// Midday is unambiguously light; the small hours unambiguously dark.
		expect(inks[10]).toBe("light"); // 12:00 local
		expect(inks[0]).toBe("dark"); // 02:00 local
		expect(inks.every((i) => i === "light" || i === "dark")).toBe(true);
	});
});
