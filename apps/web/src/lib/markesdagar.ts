// Det islamiska året — the Sunni Islamic year mapped to Gregorian dates (§7.9).
//
// Umm al-Qura is read straight from the platform's Intl calendar — no library,
// no hand-transcribed tables (§11). The full annual table is generated here at
// build time; the client picks the upcoming three to five from Date.now(), so
// the list never goes stale between manual deploys (§7.9 caveat). The ±1-day
// sighting uncertainty is inherent: dates are presented as observed, not oracle.

const MS_PER_DAY = 86_400_000;

const HIJRI_MONTHS = [
	"",
	"Muḥarram",
	"Ṣafar",
	"Rabīʿ al-awwal",
	"Rabīʿ al-thānī",
	"Jumādā al-ūlā",
	"Jumādā al-thāniya",
	"Rajab",
	"Shaʿbān",
	"Ramaḍān",
	"Shawwāl",
	"Dhū al-qaʿda",
	"Dhū al-ḥijja",
];

const hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
	year: "numeric",
	month: "numeric",
	day: "numeric",
	timeZone: "UTC",
});

interface Hijri {
	y: number;
	m: number;
	d: number;
}

function gregorianToHijri(date: Date): Hijri {
	const parts = hijriFmt.formatToParts(date);
	const get = (t: string) => Number.parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
	return { y: get("year"), m: get("month"), d: get("day") };
}

type MonthDay = [month: number, day: number];

interface EventDef {
	name: string;
	note?: string;
	start: MonthDay;
	/** Period end. With `endExclusive`, the marker is the day AFTER the period. */
	end?: MonthDay;
	endExclusive?: boolean;
}

// In Hijri-year order. Only observances established in hadith (§7.9) — nothing
// contested (no Mawlid, no Isra wa Miʿraj), no toggle.
const EVENTS: EventDef[] = [
	{
		name: "Det islamiska årets första dag",
		note: "den islamiska kalenderns början, räknad från utvandringen (hijra) till Medina år 622",
		start: [1, 1],
	},
	{
		name: "Ashura",
		note: "Muharram är den bästa månaden för frivillig fasta efter Ramadan; den 10:e — till minne av att Gud räddade Mose — sonar det gångna året och fastas med den 9:e eller 11:e",
		start: [1, 10],
	},
	{
		name: "Ramadan",
		note: "fastans månad; obligatorisk fasta från gryning till solnedgång",
		start: [9, 1],
		end: [10, 1],
		endExclusive: true,
	},
	{
		name: "De sista tio nätterna",
		note: "natten då Koranens uppenbarelse inleddes (Laylat al-Qadr) sökes på de udda nätterna, ofta den 27:e",
		start: [9, 21],
		end: [10, 1],
		endExclusive: true,
	},
	{
		name: "Eid al-fitr",
		note: "högtiden som avslutar Ramadan; firas med eid-bön och allmosan zakāt al-fitr",
		start: [10, 1],
	},
	{
		name: "De sex dagarna i Shawwal",
		note: "den rekommenderade fastan efter Ramadan",
		start: [10, 2],
		end: [11, 1],
		endExclusive: true,
	},
	{
		name: "De tio första dagarna i Dhul-hijja",
		note: "de dagar då goda gärningar är som mest älskade",
		start: [12, 1],
		end: [12, 10],
	},
	{
		name: "Arafa",
		note: "den mest förtjänstfulla fastan på året för icke-pilgrimer",
		start: [12, 9],
	},
	{
		name: "Eid al-adha",
		note: "offerhögtiden under vallfärden; firas med eid-bön och ett offer (qurbān)",
		start: [12, 10],
	},
	{
		name: "Hajj",
		note: "vallfärden till Mecka; de tre avslutande dagarna (11–13) kallas tashrīq",
		start: [12, 8],
		end: [12, 13],
	},
];

export interface Markesdag {
	name: string;
	note?: string;
	startISO: string; // YYYY-MM-DD
	endISO?: string; // inclusive, periods only
	hijriLabel: string; // e.g. "21–30 Ramaḍān 1447"
	hijriYear: number; // the observance's Hijri year — for grouping the full-year page
}

function iso(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function label(start: Hijri, end?: Hijri): string {
	if (!end || (start.m === end.m && start.d === end.d)) {
		return `${start.d} ${HIJRI_MONTHS[start.m]} ${start.y}`;
	}
	if (start.m === end.m) {
		return `${start.d}–${end.d} ${HIJRI_MONTHS[start.m]} ${start.y}`;
	}
	return `${start.d} ${HIJRI_MONTHS[start.m]} – ${end.d} ${HIJRI_MONTHS[end.m]} ${end.y}`;
}

/**
 * The full table for the next ~3 Hijri years, sorted by date. Computed by
 * scanning Gregorian days and reading each one's Umm al-Qura value, so every
 * lookup is exact (29- vs 30-day months never trip it up).
 */
export function getMarkesdagar(now = new Date()): Markesdag[] {
	const startUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

	// First Gregorian date on which each (hijriYear, month, day) falls.
	const dayMap = new Map<string, Date>();
	const years = new Set<number>();
	for (let i = -40; i < 1150; i++) {
		const date = new Date(startUTC + i * MS_PER_DAY);
		const h = gregorianToHijri(date);
		years.add(h.y);
		const key = `${h.y}-${h.m}-${h.d}`;
		if (!dayMap.has(key)) dayMap.set(key, date);
	}

	const lookup = (y: number, md: MonthDay) => dayMap.get(`${y}-${md[0]}-${md[1]}`);

	const events: Markesdag[] = [];
	for (const y of [...years].sort((a, b) => a - b)) {
		for (const def of EVENTS) {
			const startDate = lookup(y, def.start);
			if (!startDate) continue;

			let endDate: Date | undefined;
			let endHijri: Hijri | undefined;
			if (def.end) {
				const marker = lookup(y, def.end);
				if (marker) {
					endDate = def.endExclusive ? new Date(marker.getTime() - MS_PER_DAY) : marker;
					endHijri = gregorianToHijri(endDate);
				}
			}

			events.push({
				name: def.name,
				note: def.note,
				startISO: iso(startDate),
				endISO: endDate ? iso(endDate) : undefined,
				hijriLabel: label(gregorianToHijri(startDate), endHijri),
				hijriYear: y,
			});
		}
	}

	events.sort((a, b) => a.startISO.localeCompare(b.startISO));
	return events;
}

/** Only the observances still ahead of (or running on) `now`, in date order. */
export function getUpcomingMarkesdagar(now = new Date()): Markesdag[] {
	const todayISO = iso(now);
	return getMarkesdagar(now).filter((e) => (e.endISO ?? e.startISO) >= todayISO);
}

// ── Gregorian display formatting ──────────────────────────────────────────
// Shared by the homepage section, the /det-islamiska-aret page and the .ics
// feed so a date reads the same everywhere. Noon-UTC anchor keeps the calendar
// day stable regardless of the viewer's zone.

/** "27 maj 2026" (withYear) or "27 maj". */
function fmt(isoDate: string, withYear: boolean): string {
	return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("sv-SE", {
		day: "numeric",
		month: "long",
		year: withYear ? "numeric" : undefined,
		timeZone: "UTC",
	});
}

/** "27 maj 2026" for a point; "25–30 maj 2026" within a month; "18 maj – 1 juni 2026" across months. */
export function gregorian(startISO: string, endISO?: string): string {
	if (!endISO) return fmt(startISO, true);
	const sameMonth = startISO.slice(0, 7) === endISO.slice(0, 7);
	return sameMonth
		? `${new Date(`${startISO}T12:00:00Z`).getUTCDate()}–${fmt(endISO, true)}`
		: `${fmt(startISO, false)} – ${fmt(endISO, true)}`;
}
