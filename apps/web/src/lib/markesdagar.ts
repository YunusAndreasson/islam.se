// Märkesdagar — the Sunni Islamic year mapped to Gregorian dates (§7.9).
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
	{ name: "Islamiskt nyår", start: [1, 1] },
	{
		name: "Ashura",
		note: "frivillig fasta till minne av Moses, parad med den 9:e eller 11:e",
		start: [1, 10],
	},
	{ name: "Ramadan", start: [9, 1], end: [10, 1], endExclusive: true },
	{
		name: "De sista tio nätterna",
		note: "Laylat al-Qadr sökes på de udda nätterna, ofta den 27:e",
		start: [9, 21],
		end: [10, 1],
		endExclusive: true,
	},
	{ name: "Eid al-fitr", start: [10, 1] },
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
	{ name: "Eid al-adha", start: [12, 10] },
	{
		name: "Hajj",
		note: "vallfärden; tashrīq-dagarna 11–13 avslutar den",
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
			});
		}
	}

	events.sort((a, b) => a.startISO.localeCompare(b.startISO));
	return events;
}
