import { computePrayerTimes, dateForStockholmDay, stockholmDateParts } from "./prayer-times";
import type { PrayerSettings } from "./settings";

/** Keep planning dates tied to the place's calendar day, including DST changes. */
export function cityPlanning(
	location: { latitude: number; longitude: number },
	now: Date,
	settings: PrayerSettings,
) {
	const { year, month, day } = stockholmDateParts(now);
	const tomorrow = dateForStockholmDay(year, month, day + 1);
	const hijriDate = dateForStockholmDay(year, month, day + settings.hijriOffset);
	const hijriMonth = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
		month: "numeric",
		timeZone: "Europe/Stockholm",
	}).format(hijriDate);
	return {
		tomorrow,
		times: computePrayerTimes(location, tomorrow, settings),
		isRamadan: hijriMonth === "9",
		today: computePrayerTimes(location, now, settings),
	};
}
