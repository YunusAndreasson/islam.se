import { describe, expect, it } from "vitest";
import { cityPlanning } from "./city-planning";
import { computePrayerTimes, stockholmDateParts } from "./prayer-times";
import { DEFAULT_SETTINGS } from "./settings";

const location = { latitude: 59.3293, longitude: 18.0686 };

describe("city prayer planning", () => {
	it.each([
		["2026-03-28T23:30:00Z", { year: 2026, month: 2, day: 30 }],
		["2026-10-24T22:30:00Z", { year: 2026, month: 9, day: 26 }],
		["2026-12-31T23:30:00Z", { year: 2027, month: 0, day: 2 }],
	])("uses tomorrow in Sweden across DST and year boundaries: %s", (iso, expected) => {
		const plan = cityPlanning(location, new Date(iso), DEFAULT_SETTINGS);
		expect(stockholmDateParts(plan.tomorrow)).toEqual(expected);
	});

	it("shows fasting times only during Ramadan", () => {
		expect(
			cityPlanning(location, new Date("2026-02-25T12:00:00Z"), DEFAULT_SETTINGS).isRamadan,
		).toBe(true);
		expect(
			cityPlanning(location, new Date("2026-09-07T12:00:00Z"), DEFAULT_SETTINGS).isRamadan,
		).toBe(false);
	});

	it("uses the same personal adjustments for today and tomorrow", () => {
		const now = new Date("2026-09-07T12:00:00Z");
		const settings = {
			...DEFAULT_SETTINGS,
			adjustments: { ...DEFAULT_SETTINGS.adjustments, maghrib: 7 },
		};
		const plan = cityPlanning(location, now, settings);
		const baseline = cityPlanning(location, now, DEFAULT_SETTINGS);
		expect(plan.today.maghrib.getTime() - baseline.today.maghrib.getTime()).toBe(7 * 60_000);
		expect(plan.times.maghrib.getTime() - baseline.times.maghrib.getTime()).toBe(7 * 60_000);
		expect(plan.times.fajr).toEqual(computePrayerTimes(location, plan.tomorrow, settings).fajr);
	});
});
