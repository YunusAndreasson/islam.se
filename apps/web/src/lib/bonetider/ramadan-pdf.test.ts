import { describe, expect, it } from "vitest";
import { nextRamadan, ramadanTimes } from "./ramadan";
import { hasRamadanSheet, ramadanDocument, ramadanSheetDays } from "./ramadan-pdf";

// Anchored to a fixed `now`, like ramadan.test.ts: the sheet reads the calendar relative
// to the build date. Ramadan 1448 runs 8 February – 8 March 2027 (Umm al-Qura), 29 days.
const NOVEMBER_2026 = new Date("2026-11-04T12:00:00Z");
const GOTEBORG = {
	name: "Göteborg",
	slug: "goteborg",
	county: "Västra Götaland",
	lat: 57.70716,
	lon: 11.96679,
};
const KIRUNA = {
	name: "Kiruna",
	slug: "kiruna",
	county: "Norrbotten",
	lat: 67.85572,
	lon: 20.22513,
};

const period = nextRamadan(NOVEMBER_2026);
if (!period) throw new Error("no Ramadan in the table from November 2026");

describe("ramadanSheetDays", () => {
	const days = ramadanSheetDays(GOTEBORG, period);
	if (!days) throw new Error("Göteborg must resolve every fasting day");

	it("lists every fasting day from the first to the last, numbered from 1", () => {
		expect(
			days,
			"a sheet that drops a day hangs on a fridge for a month with a hole in it",
		).toHaveLength(29);
		expect(days.map((d) => d.n)).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
		expect(days[0]?.iso).toBe("2027-02-08");
		expect(days.at(-1)?.iso).toBe("2027-03-08");
	});

	it("gives the same suhūr and iftar as the city page's Ramadan section", () => {
		// The page and the sheet are read side by side; if they disagree by a minute the
		// reader cannot know which one to break the fast by.
		const page = ramadanTimes(GOTEBORG.lat, GOTEBORG.lon, period);
		expect(days[0]?.fajr).toBe(page?.first.suhur);
		expect(days[0]?.maghrib).toBe(page?.first.iftar);
		expect(days.at(-1)?.fajr).toBe(page?.last.suhur);
		expect(days.at(-1)?.maghrib).toBe(page?.last.iftar);
	});

	it("marks the evenings on which the odd nights of the last ten begin, and no others", () => {
		// The night of the 21st begins at Maghrib on the 20th, so the marks sit on days
		// 20, 22, 24, 26 and 28. Marking 21, 23 … is the off-by-one every printed table
		// makes, and it sends the reader to the wrong night.
		expect(days.filter((d) => d.oddNightBegins).map((d) => d.n)).toEqual([20, 22, 24, 26, 28]);
	});

	it("sets Fridays apart, since jumuʿa replaces Ẓuhr on them", () => {
		expect(days.filter((d) => d.friday).map((d) => d.iso)).toEqual([
			"2027-02-12",
			"2027-02-19",
			"2027-02-26",
			"2027-03-05",
		]);
	});

	it("has the fast lengthen through the month, which is what the bars draw", () => {
		const length = (d: (typeof days)[number]) => d.maghribMin - d.fajrMin;
		const first = days[0];
		const last = days.at(-1);
		if (!(first && last)) throw new Error("empty");
		expect(length(last)).toBeGreaterThan(length(first));
		expect(first.length).toBe("11 h 03");
	});
});

describe("hasRamadanSheet", () => {
	it("holds for the northernmost town with a sheet, so Kiruna's link is not dead", () => {
		expect(hasRamadanSheet(KIRUNA, NOVEMBER_2026)).toBe(true);
	});
});

describe("ramadanDocument", () => {
	const days = ramadanSheetDays(GOTEBORG, period) ?? [];
	const doc = ramadanDocument(GOTEBORG, period, days);

	it("names the town, the span and Eid al-Fitr the day after the last fast", () => {
		expect(doc).toContain('Ramadan i #"Göteborg"');
		expect(doc).toContain("8 februari – 8 mars 2027");
		expect(doc).toContain("Eid al-Fitr, tisdag 9 mars");
	});

	it("tells the reader that the first day is confirmed by sighting the moon", () => {
		// Umm al-Qura is a computed calendar; a sheet that presents its date as settled
		// sends a household to fast on a day its mosque may not.
		expect(doc).toContain("nymånen siktas");
	});

	it("sets the place name as a string literal, never as typst markup", () => {
		// The names come from a GeoNames dump. In markup a `#`, `*` or `]` in a name would
		// be read as code; inside a quoted literal it is only text.
		const src = ramadanDocument({ ...GOTEBORG, name: 'Ö"rt]#*by' }, period, days);
		expect(src).toContain('Ramadan i #"Ö\\"rt]#*by"');
		expect(src).not.toContain("[Ramadan i Ö");
	});
});
