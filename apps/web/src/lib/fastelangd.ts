// Fastans längd i svenska städer under en given månad, räknad ur samma motor och
// samma standardinställningar som /bonetider/<stad> — så att kalendersidans siffra
// och stadens egen tabell aldrig kan säga emot varandra.
//
// Varför modulen finns: /det-islamiska-aret rankar p3–4 på "ramadan 2027" men får
// 74 klick på 13 354 visningar per 90 dagar. Google besvarar datumet direkt i
// resultatlistan, så datumet kan inte vinna klicket — det är redan givet innan
// någon klickar. Kvar står bara det som snutten omöjligt kan räkna ut, och när
// ramadan infaller på vintern är det påfallande kontraintuitivt: fastan blir
// KORTARE ju längre norrut man kommer, tvärtemot sommarens tjugotimmarsdygn.
// Rättsläget bakom de norra tiderna hör hemma i /fordjupning/ramadan; här står
// bara årets faktiska siffror.

import { formatHours } from "./bonetider/place-facts";
import { INDEXED_PLACES } from "./bonetider/places-index";
import { computePrayerTimes, dateForStockholmDay } from "./bonetider/prayer-times";
import { DEFAULT_SETTINGS } from "./bonetider/settings";

/** Söder till norr. Fem rader räcker för att visa spannet — fler blir en tabell
 *  man skummar förbi. Namnen slås upp i bönetidsindexet, eftersom varje rad
 *  länkar till sin egen bönetidssida och en död länk vore värre än en rad mindre. */
const CITY_NAMES = ["Malmö", "Göteborg", "Stockholm", "Umeå", "Kiruna"] as const;

export interface FastRow {
	name: string;
	slug: string;
	latText: string;
	/** Färdigformaterat, t.ex. "9 tim 20 min". */
	first: string;
	last: string;
}

/** Timmar från fajr till maghrib den angivna Stockholmsdagen, eller null om
 *  motorn inte kan lösa dygnet (polarnatt utan högbreddsregel). */
function fastHours(lat: number, lon: number, isoDate: string): number | null {
	const [y, m, d] = isoDate.split("-").map(Number);
	const times = computePrayerTimes(
		{ latitude: lat, longitude: lon },
		dateForStockholmDay(y, m - 1, d),
		DEFAULT_SETTINGS,
	);
	const ms = times.maghrib.getTime() - times.fajr.getTime();
	return Number.isFinite(ms) && ms > 0 ? ms / 3_600_000 : null;
}

/** En rad per ort med fastans längd första och sista dagen av månaden. Orter
 *  vars dygn inte går att lösa faller bort tyst — hellre en kortare tabell än
 *  ett tomrum där en siffra ska stå. */
export function fastRows(firstDayISO: string, lastDayISO: string): FastRow[] {
	const rows: FastRow[] = [];
	for (const name of CITY_NAMES) {
		const place = INDEXED_PLACES.find((p) => p.name === name);
		if (!place) continue;
		const first = fastHours(place.lat, place.lon, firstDayISO);
		const last = fastHours(place.lat, place.lon, lastDayISO);
		if (first === null || last === null) continue;
		rows.push({
			name: place.name,
			slug: place.slug,
			latText: `${place.lat.toFixed(1).replace(".", ",")}° N`,
			first: formatHours(first),
			last: formatHours(last),
		});
	}
	return rows;
}
