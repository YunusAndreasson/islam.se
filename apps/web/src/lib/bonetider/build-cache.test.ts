import { describe, expect, it } from "vitest";
import { prayerPageCacheKey } from "./build-cache";
import { INDEXED_PLACES } from "./places-index";
import { computePrayerTimes } from "./prayer-times";
import { DEFAULT_SETTINGS } from "./settings";

const place = INDEXED_PLACES.find((place) => place.slug === "stockholm");
if (!place) throw new Error("Stockholm fixture missing");

describe("prayer page build cache", () => {
	it("reuses output within the same prayer interval", () => {
		expect(prayerPageCacheKey(place, new Date("2026-09-07T10:00:00Z"))).toBe(
			prayerPageCacheKey(place, new Date("2026-09-07T10:00:01Z")),
		);
	});
	it("invalidates at Stockholm midnight, including summer and winter offsets", () => {
		for (const midnight of ["2026-09-07T22:00:00Z", "2026-01-07T23:00:00Z"]) {
			const after = new Date(midnight);
			expect(prayerPageCacheKey(place, new Date(+after - 1))).not.toBe(
				prayerPageCacheKey(place, after),
			);
		}
	});
	it("invalidates when the next prayer changes", () => {
		const times = computePrayerTimes(
			{ latitude: place.lat, longitude: place.lon },
			new Date("2026-09-07T12:00:00Z"),
			DEFAULT_SETTINGS,
		);
		expect(prayerPageCacheKey(place, new Date(+times.dhuhr - 1))).not.toBe(
			prayerPageCacheKey(place, new Date(+times.dhuhr + 1)),
		);
	});
	it("invalidates changed place data", () => {
		const now = new Date("2026-09-07T10:00:00Z");
		expect(prayerPageCacheKey(place, now)).not.toBe(
			prayerPageCacheKey({ ...place, name: "Updated name" }, now),
		);
	});
});
