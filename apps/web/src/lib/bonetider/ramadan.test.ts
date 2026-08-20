import { describe, expect, it } from "vitest";
import { nextRamadan, ramadanRange, ramadanTimes } from "./ramadan";

// Umm al-Qura puts Ramadan 1448 at 8 February – 8 March 2027. Every assertion below
// is anchored to a fixed `now`, because the whole module reads the calendar relative
// to the build date and a floating test would go green or red with the seasons.
const AUGUST_2026 = new Date("2026-08-20T12:00:00Z");

const MALMO = { lat: 55.60587, lon: 13.00073 };
const KIRUNA = { lat: 67.85572, lon: 20.22513 };

describe("nextRamadan", () => {
	it("finds the coming Ramadan from a date months ahead of it", () => {
		const r = nextRamadan(AUGUST_2026);
		expect(r).not.toBeNull();
		expect(r?.startISO).toBe("2027-02-08");
		expect(r?.endISO).toBe("2027-03-08");
		expect(r?.hijriYear).toBe(1448);
		expect(r?.year).toBe("2027");
	});

	it("returns the RUNNING month, not next year's, when asked mid-Ramadan", () => {
		// The reader who searches on 20 February 2027 is inside the fast. A page that
		// answered with Ramadan 1449 would be technically correct and useless.
		const r = nextRamadan(new Date("2027-02-20T12:00:00Z"));
		expect(r?.startISO).toBe("2027-02-08");
	});
});

describe("ramadanTimes", () => {
	it("gives a winter fast that SHORTENS towards the north", () => {
		// The counter-intuitive fact the whole section exists to carry: in February the
		// far north fasts fewer hours than the south, the reverse of the summer picture
		// everyone expects. If this ever flips, the prose around it has become false.
		const period = nextRamadan(AUGUST_2026);
		if (!period) throw new Error("no Ramadan found");
		const malmo = ramadanTimes(MALMO.lat, MALMO.lon, period);
		const kiruna = ramadanTimes(KIRUNA.lat, KIRUNA.lon, period);
		const hours = (s: string) => {
			const m = /^(\d+) tim(?: (\d+) min)?$/.exec(s);
			if (!m?.[1]) throw new Error(`unparseable length: ${s}`);
			return Number(m[1]) + Number(m[2] ?? 0) / 60;
		};
		expect(hours(kiruna?.first.length ?? "")).toBeLessThan(hours(malmo?.first.length ?? ""));
	});

	it("lengthens across the month as spring comes on", () => {
		const period = nextRamadan(AUGUST_2026);
		if (!period) throw new Error("no Ramadan found");
		const t = ramadanTimes(MALMO.lat, MALMO.lon, period);
		const hours = (s: string) => Number(/^(\d+)/.exec(s)?.[1] ?? 0);
		expect(hours(t?.last.length ?? "")).toBeGreaterThanOrEqual(hours(t?.first.length ?? ""));
	});

	it("returns times as HH:MM, never the em-dash placeholder", () => {
		const period = nextRamadan(AUGUST_2026);
		if (!period) throw new Error("no Ramadan found");
		const t = ramadanTimes(KIRUNA.lat, KIRUNA.lon, period);
		for (const v of [t?.first.suhur, t?.first.iftar, t?.last.suhur, t?.last.iftar]) {
			expect(v).toMatch(/^\d{2}:\d{2}$/);
		}
	});
});

describe("ramadanRange", () => {
	it("names the year once when the span stays inside it", () => {
		const period = nextRamadan(AUGUST_2026);
		if (!period) throw new Error("no Ramadan found");
		expect(ramadanRange(period)).toBe("8 februari – 8 mars 2027");
	});

	it("names both years when the span crosses new year", () => {
		// Ramadan drifts ~11 days earlier each year, so it lands on a new-year boundary
		// roughly every 33 years — rare, but the label must not silently mislabel it.
		expect(
			ramadanRange({ startISO: "2032-12-24", endISO: "2033-01-22", hijriYear: 1454, year: "2032" }),
		).toBe("24 december 2032 – 22 januari 2033");
	});
});
