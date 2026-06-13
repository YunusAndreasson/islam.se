// Per-place, latitude-driven daylight facts for the /bonetider/[stad] pages.
//
// These are what make each of the 2,118 city pages genuinely *different* rather than
// a name-swapped template: midsummer/midwinter day length, whether the place gets
// midnight sun or polar night, and — the number that actually explains the prayer
// schedule — how far the sun sinks below the horizon at the summer-solstice solar
// midnight. Across Sweden that depression stays under 18° everywhere, which is *why*
// Fajr and ʿIshāʾ crowd together in June and the high-latitude rule kicks in.
//
// Pure + evergreen: computed from solstice geometry (not "today"), so a statically
// built page never shows a stale value. Reuses the tested NOAA engine in solar/sun.ts.
import { solarParams, sunPositionAt } from "./solar/sun";

export interface PlaceFacts {
	/** Day length at the summer solstice, decimal hours. 24 under midnight sun. */
	readonly summerDayHours: number;
	/** Day length at the winter solstice, decimal hours. 0 under polar night. */
	readonly winterDayHours: number;
	/** Swedish-formatted summer day length, e.g. "18 tim 32 min" / "Midnattssol". */
	readonly summerDayText: string;
	/** Swedish-formatted winter day length, e.g. "6 tim 41 min" / "Polarnatt". */
	readonly winterDayText: string;
	/** Sun never sets at the summer solstice (north of the Arctic Circle). */
	readonly midnightSun: boolean;
	/** Sun never rises at the winter solstice. */
	readonly polarNight: boolean;
	/** Greatest depression below the horizon at the summer-solstice solar midnight,
	 *  degrees (0 under midnight sun). <6 civil, 6–12 nautical, 12–18 astronomical. */
	readonly summerMidnightDepressionDeg: number;
}

// Sunrise/sunset altitude: −0.833° accounts for atmospheric refraction + the sun's
// radius, the same convention almanacs use for "day length".
const HORIZON_DEG = -0.833;
// 2-minute sampling → day length accurate to a couple of minutes, ample for prose.
const STEP_MIN = 2;
// Reference year for the solstices. Day length is essentially year-independent, so a
// fixed year keeps the facts deterministic across builds.
const REF_YEAR = 2025;

function dayStats(
	lat: number,
	lon: number,
	date: Date,
): { dayHours: number; minAlt: number; maxAlt: number } {
	// Declination + equation of time drift negligibly across one day; take them once.
	const { declRad, eotMin } = solarParams(date);
	let above = 0;
	let samples = 0;
	let minAlt = 90;
	let maxAlt = -90;
	for (let m = 0; m < 1440; m += STEP_MIN) {
		const { altDeg } = sunPositionAt(lat, lon, m, declRad, eotMin);
		if (altDeg > HORIZON_DEG) above++;
		if (altDeg < minAlt) minAlt = altDeg;
		if (altDeg > maxAlt) maxAlt = altDeg;
		samples++;
	}
	return { dayHours: (above / samples) * 24, minAlt, maxAlt };
}

function formatHours(hours: number): string {
	const h = Math.floor(hours);
	const min = Math.round((hours - h) * 60);
	if (min === 60) return `${h + 1} tim`;
	return min ? `${h} tim ${min} min` : `${h} tim`;
}

/** Daylight facts for a place. Latitude does the work; longitude only shifts the
 *  clock, not the lengths. */
export function placeFacts(lat: number, lon: number): PlaceFacts {
	const summer = dayStats(lat, lon, new Date(Date.UTC(REF_YEAR, 5, 21, 12)));
	const winter = dayStats(lat, lon, new Date(Date.UTC(REF_YEAR, 11, 21, 12)));
	const midnightSun = summer.minAlt > HORIZON_DEG;
	const polarNight = winter.maxAlt < HORIZON_DEG;
	return {
		summerDayHours: summer.dayHours,
		winterDayHours: winter.dayHours,
		summerDayText: midnightSun ? "Midnattssol" : formatHours(summer.dayHours),
		winterDayText: polarNight ? "Polarnatt" : formatHours(winter.dayHours),
		midnightSun,
		polarNight,
		summerMidnightDepressionDeg: Math.max(0, -summer.minAlt),
	};
}
