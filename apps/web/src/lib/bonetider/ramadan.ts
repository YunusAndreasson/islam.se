// Ramadan för en enskild ort: när månaden infaller, och vad det innebär i klockslag
// där läsaren bor.
//
// Varför modulen finns: »ramadan 2027« ger 7 935 visningar på 90 dagar vid position 4
// och 0,5 % klickfrekvens. Datumet kan inte vinna klicket — Google skriver ut det i
// resultatlistan innan någon hunnit klicka. Det som inte står där är ortens egna tider:
// när suhūr tar slut och när fastan bryts i Kiruna är inte samma sak som i Malmö, och
// skillnaden i fastelängd mellan dem är över tre timmar. Samma argument som
// ./fastelangd.ts gör för kalendersidan, fast per ort.
//
// Hela beräkningen delar motor och standardinställningar med /bonetider/<stad>, så en
// ortssidas ramadanavsnitt och dess egen dygnstabell aldrig kan säga emot varandra.

import { getMarkesdagar } from "../markesdagar";
import { formatHours } from "./place-facts";
import { computePrayerTimes, dateForStockholmDay, formatTime } from "./prayer-times";
import { DEFAULT_SETTINGS } from "./settings";

export interface RamadanPeriod {
	/** Första fastedagen, ISO (Umm al-Qura). */
	startISO: string;
	/** Sista fastedagen, ISO. */
	endISO: string;
	/** Hijriåret, t.ex. 1448. */
	hijriYear: number;
	/** Gregorianskt år som siffra i rubriker och titlar, t.ex. "2027". */
	year: string;
}

export interface RamadanDay {
	/** Fajr — tiden då suhūr tar slut och fastan börjar. */
	suhur: string;
	/** Maghrib — tiden då fastan bryts. */
	iftar: string;
	/** Färdigformaterat, t.ex. "11 tim 40 min". */
	length: string;
}

export interface RamadanTimes {
	first: RamadanDay;
	last: RamadanDay;
}

/**
 * Nästa (eller pågående) ramadan enligt Umm al-Qura, eller null om
 * märkesdagstabellen inte når fram till en.
 *
 * ⚠️ Läser tabellen relativt `now`, så en ortssida byggd i februari 2027 pekar på den
 * ramadan som pågår, inte på nästa år. Det är avsikten: den som söker mitt i månaden
 * ska se månaden hen är i.
 */
export function nextRamadan(now = new Date()): RamadanPeriod | null {
	const todayISO = now.toISOString().slice(0, 10);
	const found = getMarkesdagar(now)
		.filter((e) => e.name === "Ramadan")
		.find((e) => (e.endISO ?? e.startISO) >= todayISO);
	if (!found?.endISO) return null;
	return {
		startISO: found.startISO,
		endISO: found.endISO,
		hijriYear: found.hijriYear,
		year: found.startISO.slice(0, 4),
	};
}

/** Fajr, Maghrib och fastelängd för en ort en given Stockholmsdag, eller null när
 *  motorn inte kan lösa dygnet (polarnatt utan högbreddsregel). */
function dayFor(lat: number, lon: number, isoDate: string): RamadanDay | null {
	const [y, m, d] = isoDate.split("-").map(Number);
	if (y === undefined || m === undefined || d === undefined) return null;
	const times = computePrayerTimes(
		{ latitude: lat, longitude: lon },
		dateForStockholmDay(y, m - 1, d),
		DEFAULT_SETTINGS,
	);
	const ms = times.maghrib.getTime() - times.fajr.getTime();
	if (!Number.isFinite(ms) || ms <= 0) return null;
	const suhur = formatTime(times.fajr);
	const iftar = formatTime(times.maghrib);
	// formatTime ger "—" för ett olösligt dygn. En ruta med "—" där ett klockslag ska
	// stå är sämre än inget avsnitt alls, så avsnittet faller bort i stället.
	if (suhur === "—" || iftar === "—") return null;
	return { suhur, iftar, length: formatHours(ms / 3_600_000) };
}

/** Första och sista fastedagens tider för en ort, eller null om någondera dagen inte
 *  går att lösa. Allt eller inget: ett avsnitt som visar första dagen men inte den
 *  sista väcker frågan varför, och svaret intresserar ingen läsare. */
export function ramadanTimes(lat: number, lon: number, period: RamadanPeriod): RamadanTimes | null {
	const first = dayFor(lat, lon, period.startISO);
	const last = dayFor(lat, lon, period.endISO);
	return first && last ? { first, last } : null;
}

/** "8 februari – 8 mars 2027" — ett spann som läses i en rubrik. Året sätts en gång,
 *  på det sista datumet, utom när spannet korsar ett årsskifte. */
export function ramadanRange(period: RamadanPeriod): string {
	const fmt = (isoDate: string, withYear: boolean) =>
		new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("sv-SE", {
			day: "numeric",
			month: "long",
			...(withYear ? { year: "numeric" as const } : {}),
			timeZone: "UTC",
		});
	const crossesYear = period.startISO.slice(0, 4) !== period.endISO.slice(0, 4);
	return `${fmt(period.startISO, crossesYear)} – ${fmt(period.endISO, true)}`;
}
