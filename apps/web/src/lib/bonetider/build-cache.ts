import { createHash } from "node:crypto";
import type { IndexedPlace } from "./places-index";
import { computePrayerTimes, nextPrayerKeyAt } from "./prayer-times";
import { DEFAULT_SETTINGS } from "./settings";

/** Astro tracks imported code/data; include runtime dates and the highlighted prayer too. */
export function prayerPageCacheKey(place: IndexedPlace, now: Date): string {
	const times = computePrayerTimes(
		{ latitude: place.lat, longitude: place.lon },
		now,
		DEFAULT_SETTINGS,
	);
	return createHash("sha256")
		.update(
			JSON.stringify([
				place,
				now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }),
				// Footer dates also depend on UTC / the build machine's local calendar.
				now.toISOString().slice(0, 10),
				now.toDateString(),
				nextPrayerKeyAt(times, now.getTime()) ?? "fajr",
			]),
		)
		.digest("hex");
}
