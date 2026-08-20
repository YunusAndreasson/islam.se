// En prenumererbar bönekalender per ort, som RFC 5545-text.
//
// Varför: sajtens klickfrekvens på position 3 är 1,9 %, för Google besvarar
// bönetidsfrågan i resultatlistan. Det som inte går att besvara där är en kalender
// läsaren kan prenumerera på — den kräver ett klick, och den finns kvar i telefonen
// efteråt. Konkurrenten islam.nu erbjuder en PDF; ingen svensk sida vi känner till
// erbjuder .ics per ort.
//
// Formatet delar hjälpfunktioner med /det-islamiska-aret.ics, men innehållet skiljer
// sig i sak: där all-day-VEVENT för högtider, här tidsatta händelser med tidszon.
//
// ⚠️ Filerna är statiska och innehåller innevarande månad. Den nattliga ombyggnaden
// (scripts/deploy-bonetider-daily.sh) rullar dem vidare, så en prenumerant har alltid
// den månad hen är i. Utan det jobbet slutar kalendern fyllas på.
//
// Men INTE dygnsvis: en månads bönetider är desamma den 1:a som den 28:e, så filen
// behöver bara ändras när månaden vänder. Därför är utdata avsiktligt deterministiskt
// per (ort, år, månad) — DTSTAMP sätts av månaden och inte av byggtidpunkten — och
// resultatet cachas på disk. Först då blir de 2 128 kalendrarna gratis 30 nätter av 31:
// beräkningen hoppas över, och wrangler laddar inte upp en fil vars byte inte ändrats.
// Utan determinismen kostade de 150 s bygge och 80 MB uppladdning varje natt för att
// säga exakt samma sak som kvällen innan.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computePrayerTimes, dateForStockholmDay, TIME_ZONE } from "./prayer-times";
import { DEFAULT_SETTINGS } from "./settings";

/** Bönerna som får en händelse. Shurūq utelämnas: den är soluppgången, inte en bön
 *  man kallas till, och sex poster om dygnet i en delad kalender är redan mycket. */
const EVENT_PRAYERS = [
	{ key: "fajr", name: "Fajr", sv: "Gryningsbönen" },
	{ key: "dhuhr", name: "Ẓuhr", sv: "Middagsbönen" },
	{ key: "asr", name: "ʿAṣr", sv: "Eftermiddagsbönen" },
	{ key: "maghrib", name: "Maghrib", sv: "Solnedgångsbönen" },
	{ key: "isha", name: "ʿIshāʾ", sv: "Kvällsbönen" },
] as const;

/** Escape a TEXT value per RFC 5545 §3.3.11. */
function esc(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Fold a content line to ≤75 octets (RFC 5545 §3.1); continuations get a leading space. */
function fold(line: string): string {
	const enc = new TextEncoder();
	let out = "";
	let cur = "";
	let bytes = 0;
	for (const ch of line) {
		const b = enc.encode(ch).length;
		// 73 keeps the continuation's leading space within the 75-octet limit.
		if (bytes + b > 73) {
			out += (out ? "\r\n " : "") + cur;
			cur = ch;
			bytes = b;
		} else {
			cur += ch;
			bytes += b;
		}
	}
	return out + (out ? "\r\n " : "") + cur;
}

/** Lokal tid som RFC 5545 DATE-TIME utan zonsuffix — zonen bärs av TZID-parametern.
 *  Läses ur Intl i Europe/Stockholm, så sommartidsskiftet sköter sig självt. */
function localStamp(date: Date): string | null {
	if (!Number.isFinite(date.getTime())) return null;
	const parts = new Intl.DateTimeFormat("sv-SE", {
		timeZone: TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const get = (t: string) => parts.find((p) => p.type === t)?.value;
	const [y, m, d, h, mi, s] = [
		get("year"),
		get("month"),
		get("day"),
		get("hour"),
		get("minute"),
		get("second"),
	];
	if (![y, m, d, h, mi, s].every(Boolean)) return null;
	return `${y}${m}${d}T${h}${mi}${s}`;
}

// En minimal VTIMEZONE för Europe/Stockholm. Apple Kalender och Outlook läser TZID
// utan den, men Google Kalender och flera Android-klienter faller tillbaka på UTC och
// visar tiderna en till två timmar fel. Reglerna är EU:s: sista söndagen i mars och
// oktober, 01:00 UTC.
const VTIMEZONE = [
	"BEGIN:VTIMEZONE",
	`TZID:${TIME_ZONE}`,
	"X-LIC-LOCATION:Europe/Stockholm",
	"BEGIN:DAYLIGHT",
	"TZOFFSETFROM:+0100",
	"TZOFFSETTO:+0200",
	"TZNAME:CEST",
	"DTSTART:19700329T020000",
	"RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
	"END:DAYLIGHT",
	"BEGIN:STANDARD",
	"TZOFFSETFROM:+0200",
	"TZOFFSETTO:+0100",
	"TZNAME:CET",
	"DTSTART:19701025T030000",
	"RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
	"END:STANDARD",
	"END:VTIMEZONE",
];

// Cachen lever under node_modules/.astro, precis som OG-kortens (src/lib/og-cache.ts):
// redan gitignorerad, redan bortstädad av den vanliga "radera node_modules". Generationen
// hashas ur den här filens innehåll, så en ändring i formatet ogiltigförklarar varje
// cachad kalender automatiskt i stället för att servera gamla byte i veckor.
const CACHE_DIR = join(process.cwd(), "node_modules/.astro/ics-cache");

const generation = (() => {
	try {
		const self = join(process.cwd(), "src/lib/bonetider/ics.ts");
		return createHash("sha256").update(readFileSync(self)).digest("hex").slice(0, 12);
	} catch {
		// Går filen inte att läsa (oväntat) — använd ett värde per process, så cachen
		// fortfarande fungerar inom ett bygge men aldrig överlever det.
		return `nogen-${process.pid}`;
	}
})();

const GEN_DIR = join(CACHE_DIR, generation);
let pruned = false;

/** Äldre generationer städas en gång per bygge. Utan det växer cachen bara: varje
 *  formatändring lämnar 2 128 föräldralösa filer som ingen läser igen. */
function pruneOldGenerations(): void {
	if (pruned) return;
	pruned = true;
	try {
		for (const entry of readdirSync(CACHE_DIR, { withFileTypes: true })) {
			if (entry.isDirectory() && entry.name !== generation) {
				rmSync(join(CACHE_DIR, entry.name), { recursive: true, force: true });
			}
		}
	} catch {
		// Ingen cachekatalog än. Ett bygge får aldrig falla på städningen.
	}
}

export interface IcsPlace {
	name: string;
	slug: string;
	lat: number;
	lon: number;
}

/**
 * Bönetiderna för `monthsAhead` månader från och med byggmånaden, som en .ics-text.
 *
 * Varje bön blir en 15-minutershändelse (en nollång post visas inte alls i somliga
 * klienter) markerad TRANSP:TRANSPARENT, så den inte gör prenumeranten upptagen.
 */
export function prayerCalendar(place: IcsPlace, now = new Date(), monthsAhead = 1): string {
	pruneOldGenerations();
	const year = now.getUTCFullYear();
	const month = now.getUTCMonth();
	const key = `${place.slug}-${year}-${String(month + 1).padStart(2, "0")}-${monthsAhead}`;
	const file = join(GEN_DIR, `${key}.ics`);
	try {
		if (existsSync(file)) return readFileSync(file, "utf-8");
	} catch {
		// Oläsbar cachepost — fall igenom och räkna om.
	}
	const body = buildCalendar(place, year, month, monthsAhead);
	try {
		mkdirSync(GEN_DIR, { recursive: true });
		writeFileSync(file, body);
	} catch {
		// En cache som inte går att skriva får inte fälla bygget.
	}
	return body;
}

function buildCalendar(
	place: IcsPlace,
	year0: number,
	month0: number,
	monthsAhead: number,
): string {
	// DTSTAMP är månadens första sekund, inte byggtidpunkten. Det är hela skälet till att
	// filen kan cachas: RFC 5545 kräver ett DTSTAMP, men inte att det rör sig när ingenting
	// annat gör det, och en tidsstämpel som tickade varje natt hade gjort 80 MB identiska
	// byte olika för wrangler.
	const stamp = `${year0}${String(month0 + 1).padStart(2, "0")}01T000000Z`;
	const coords = { latitude: place.lat, longitude: place.lon };
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//islam.se//Bonetider//SV",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${esc(`Bönetider – ${place.name}`)}`,
		`X-WR-CALDESC:${esc(`Bönetider för ${place.name}, beräknade efter solens läge. islam.se`)}`,
		`X-WR-TIMEZONE:${TIME_ZONE}`,
		// En prenumerant behöver inte hämta oftare än kalendern ändras, och den ändras
		// när natten byggt om den.
		"REFRESH-INTERVAL;VALUE=DURATION:P1D",
		"X-PUBLISHED-TTL:P1D",
		...VTIMEZONE,
	];

	for (let mo = 0; mo < monthsAhead; mo++) {
		const cursor = new Date(Date.UTC(year0, month0 + mo, 1, 12));
		const year = cursor.getUTCFullYear();
		const month = cursor.getUTCMonth();
		const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
		for (let d = 1; d <= days; d++) {
			const times = computePrayerTimes(
				coords,
				dateForStockholmDay(year, month, d),
				DEFAULT_SETTINGS,
			);
			const iso = `${year}${String(month + 1).padStart(2, "0")}${String(d).padStart(2, "0")}`;
			for (const p of EVENT_PRAYERS) {
				const begin = localStamp(times[p.key]);
				// Ett olösligt dygn (polarnatt utan högbreddsregel) hoppas över tyst. En
				// kalenderpost utan tid är värre än ingen post.
				if (!begin) continue;
				const end = localStamp(new Date(times[p.key].getTime() + 15 * 60_000));
				if (!end) continue;
				lines.push(
					"BEGIN:VEVENT",
					`UID:${p.key}-${iso}-${place.slug}@islam.se`,
					`DTSTAMP:${stamp}`,
					`DTSTART;TZID=${TIME_ZONE}:${begin}`,
					`DTEND;TZID=${TIME_ZONE}:${end}`,
					`SUMMARY:${esc(`${p.name} – ${p.sv}`)}`,
					// Ingen DESCRIPTION och ingen URL per händelse. De sade samma sak som
					// SUMMARY och kalenderns egen X-WR-CALDESC, och kostade tillsammans ~175
					// av 415 byte per post — gånger 150 poster gånger 2 128 orter är det
					// tiotals megabyte som laddas upp varje natt för att upprepa ortnamnet.
					"TRANSP:TRANSPARENT",
					"END:VEVENT",
				);
			}
		}
	}

	lines.push("END:VCALENDAR");
	return `${lines.map(fold).join("\r\n")}\r\n`;
}
