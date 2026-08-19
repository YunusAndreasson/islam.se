import { describe, expect, it } from "vitest";
import { hijriLabel } from "./markesdagar";

describe("hijriLabel", () => {
	it("names the Umm al-Qura day with the site's own spelling", () => {
		// 19 August 2026 fell in Rabīʿ al-awwal 1448. The diacritics are the point:
		// the label is rendered beside the Gregorian date on 2 128 city pages, and a
		// bare ASCII "Rabi al-awwal" would read as a different house than the rest of
		// the site — /det-islamiska-aret spells every month this way.
		expect(hijriLabel(new Date("2026-08-19T12:00:00Z"))).toBe("6 Rabīʿ al-awwal 1448");
	});

	it("reads its instant in UTC, so a Swedish-night Date names the day before", () => {
		// This is the trap the nightly rebuild walks into: it runs at 01:30 Europe/
		// Stockholm, which is still the previous day in UTC. A caller that passes
		// `new Date()` there would stamp every prayer-time page with yesterday's Hijri
		// date. Callers must pass noon UTC of the intended Swedish day — see the
		// `todayIso` usage in src/pages/bonetider/[stad].astro.
		const swedishNight = new Date("2026-08-19T01:30:00+02:00"); // 2026-08-18T23:30Z
		expect(hijriLabel(swedishNight)).toBe("5 Rabīʿ al-awwal 1448");
		expect(hijriLabel(new Date("2026-08-19T12:00:00Z"))).toBe("6 Rabīʿ al-awwal 1448");
	});

	it("crosses a Hijri month boundary without drifting", () => {
		// Ramaḍān 1448 begins 8 February 2027 by Umm al-Qura — the date the whole
		// /det-islamiska-aret table and the coming ramadan pages hang on.
		expect(hijriLabel(new Date("2027-02-08T12:00:00Z"))).toBe("1 Ramaḍān 1448");
		expect(hijriLabel(new Date("2027-02-07T12:00:00Z"))).toBe("30 Shaʿbān 1448");
	});
});
