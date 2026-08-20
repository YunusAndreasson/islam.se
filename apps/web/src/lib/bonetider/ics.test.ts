import { describe, expect, it } from "vitest";
import { prayerCalendar } from "./ics";

// Unika slugs per test: prayerCalendar cachar på (slug, år, månad), så två test som
// delar slug skulle läsa varandras resultat ur disken och bevisa ingenting.
const place = (slug: string) => ({ name: "Testorten", slug, lat: 59.32938, lon: 18.06871 });
const AUGUST = new Date("2026-08-20T09:00:00Z");

describe("prayerCalendar", () => {
	it("stämplar DTSTAMP med månadens början, aldrig med byggtidpunkten", () => {
		// Det här är invarianten som gör diskcachen — och därmed hela nattjobbets
		// ekonomi — riktig. Ett DTSTAMP som följde `now` hade gjort 2 128 innehållsligt
		// identiska filer olika för varje bygge: 150 s omräkning och 80 MB uppladdning
		// varje natt för att säga exakt samma sak som kvällen innan. Faller det här
		// testet har någon återinfört den kostnaden utan att märka det.
		const ics = prayerCalendar(place("test-dtstamp"), AUGUST);
		const stamps = [...ics.matchAll(/DTSTAMP:(\S+)/g)].map((m) => m[1]);
		expect(stamps.length).toBeGreaterThan(100);
		expect(new Set(stamps).size).toBe(1);
		expect(stamps[0]).toBe("20260801T000000Z");
	});

	it("ger byte-identisk utdata för olika tidpunkter i samma månad", () => {
		const early = prayerCalendar(place("test-early"), new Date("2026-08-01T00:30:00Z"));
		const late = prayerCalendar(place("test-early"), new Date("2026-08-31T23:30:00Z"));
		expect(late).toBe(early);
	});

	it("bär tidszonen som VTIMEZONE och TZID, inte som UTC", () => {
		// Utan VTIMEZONE faller Google Kalender och flera Android-klienter tillbaka på
		// UTC och visar varenda bön en till två timmar fel — tyst, och bara för dem.
		const ics = prayerCalendar(place("test-tz"), AUGUST);
		expect(ics).toContain("BEGIN:VTIMEZONE");
		expect(ics).toContain("TZID:Europe/Stockholm");
		expect(ics).toContain("DTSTART;TZID=Europe/Stockholm:");
		expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
	});

	it("ger fem böner per dygn under hela månaden", () => {
		const ics = prayerCalendar(place("test-count"), AUGUST);
		// Augusti har 31 dygn; Shurūq är avsiktligt utelämnad — den är soluppgången,
		// inte en bön man kallas till.
		expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(31 * 5);
	});

	it("viker varje rad till högst 75 oktetter, som RFC 5545 kräver", () => {
		// Svenska ortnamn med å/ä/ö är flerbytes i UTF-8, så en radbrytning räknad i
		// tecken i stället för oktetter går sönder först på just de orter sajten finns
		// till för.
		const ics = prayerCalendar({ ...place("test-fold"), name: "Västra Frölunda" }, AUGUST);
		const enc = new TextEncoder();
		for (const line of ics.split("\r\n")) {
			expect(enc.encode(line).length).toBeLessThanOrEqual(75);
		}
	});

	it("hoppar över dygn motorn inte kan lösa i stället för att skriva tomma poster", () => {
		// Nordpolen: ingen giltig gryning att räkna ut. En kalenderpost utan tid är
		// värre än ingen post — den ser ut som ett löfte.
		const ics = prayerCalendar({ name: "Polen", slug: "test-polar", lat: 89.9, lon: 0 }, AUGUST);
		expect(ics).toContain("END:VCALENDAR");
		expect(ics).not.toContain("DTSTART;TZID=Europe/Stockholm:undefined");
		expect(ics).not.toMatch(/DTSTART;TZID=[^:]+:\s*$/m);
	});
});
