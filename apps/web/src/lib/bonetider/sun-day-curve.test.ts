import { describe, expect, it } from "vitest";
import { computePrayerTimes, dateForStockholmDay } from "./prayer-times";
import { DEFAULT_SETTINGS } from "./settings";
import {
	ASTRONOMICAL_NIGHT_DEG,
	altAt,
	minuteOnCurve,
	type SunDayCurve,
	stockholmOffsetMin,
	sunDayCurve,
} from "./sun-day-curve";

const MALMO = { lat: 55.60587, lon: 13.00073 };
const STOCKHOLM = { lat: 59.32938, lon: 18.06871 };
const KIRUNA = { lat: 67.85572, lon: 20.22513 };

const EQUINOX = dateForStockholmDay(2025, 2, 20);
const MIDSUMMER = dateForStockholmDay(2025, 5, 21);
const MIDWINTER = dateForStockholmDay(2025, 11, 21);

const peakMinute = (curve: SunDayCurve): number =>
	curve.samples.reduce((best, s) => (s.altDeg > best.altDeg ? s : best)).minuteOfDay;

describe("sunDayCurve", () => {
	it("rises to a single noon peak, then falls to a single solar midnight", () => {
		const curve = sunDayCurve(STOCKHOLM.lat, STOCKHOLM.lon, EQUINOX);
		const peak = peakMinute(curve);
		// Solar noon in Stockholm lands a little before 12:00 CET — the wall clock on
		// this date — because 18°E is east of the 15°E meridian the zone is cut from.
		expect(peak).toBeGreaterThan(11 * 60);
		expect(peak).toBeLessThan(12 * 60);

		// One rise and one fall, no second bump — a sign error in the hour angle would
		// produce one. The fall stops at solar midnight, which lands late in the CET day
		// (~23:48), NOT at 24:00: the last few samples are already climbing toward the
		// next dawn, so asserting a fall all the way to minute 1440 would be wrong.
		const trough = curve.samples.reduce((best, s) =>
			s.minuteOfDay > peak && s.altDeg < best.altDeg ? s : best,
		).minuteOfDay;
		expect(trough).toBeGreaterThan(22 * 60);

		const strictlyMonotone = (from: number, to: number, sign: 1 | -1): void => {
			const span = curve.samples.filter((s) => s.minuteOfDay >= from && s.minuteOfDay <= to);
			expect(span.length).toBeGreaterThan(10);
			for (let i = 1; i < span.length; i++) {
				const prev = span[i - 1];
				const cur = span[i];
				if (!(prev && cur)) throw new Error("sampling gap");
				expect(sign * (cur.altDeg - prev.altDeg)).toBeGreaterThan(0);
			}
		};
		strictlyMonotone(0, peak, 1);
		strictlyMonotone(peak, trough, -1);
	});

	// The fact the high-latitude figure on /bonetider/metod/ exists to show: nowhere in
	// Sweden does the midsummer sun get 18° below the horizon, so the standard Fajr and
	// ʿIshāʾ angles have no solution and the seventh-of-the-night rule supplies the times
	// (Aqrab al-Balad only where there is no sunset at all). If this ever fails, the
	// figure's caption has become wrong.
	it("never reaches astronomical night anywhere in Sweden at midsummer", () => {
		for (const place of [MALMO, STOCKHOLM, KIRUNA]) {
			const curve = sunDayCurve(place.lat, place.lon, MIDSUMMER);
			expect(curve.minAltDeg).toBeGreaterThan(ASTRONOMICAL_NIGHT_DEG);
			expect(curve.reachesAstronomicalNight).toBe(false);
		}
	});

	it("keeps the sun up all night at Kiruna's midsummer and down all day at midwinter", () => {
		const summer = sunDayCurve(KIRUNA.lat, KIRUNA.lon, MIDSUMMER);
		expect(summer.midnightSun).toBe(true);
		expect(summer.minAltDeg).toBeGreaterThan(0);

		const winter = sunDayCurve(KIRUNA.lat, KIRUNA.lon, MIDWINTER);
		expect(winter.maxAltDeg).toBeLessThan(0);
		// Polar night still isn't *dark* all day — the midday sky is civil twilight.
		expect(winter.maxAltDeg).toBeGreaterThan(-6);
	});

	it("does reach astronomical night in deep winter, where the angle rule works", () => {
		const curve = sunDayCurve(STOCKHOLM.lat, STOCKHOLM.lon, MIDWINTER);
		expect(curve.reachesAstronomicalNight).toBe(true);
	});
});

describe("altAt", () => {
	it("interpolates between samples and clamps outside the day", () => {
		const curve = sunDayCurve(STOCKHOLM.lat, STOCKHOLM.lon, EQUINOX);
		const first = curve.samples[0];
		const second = curve.samples[1];
		if (!(first && second)) throw new Error("no samples");
		const mid = altAt(curve, (first.minuteOfDay + second.minuteOfDay) / 2);
		expect(mid).toBeCloseTo((first.altDeg + second.altDeg) / 2, 6);
		expect(altAt(curve, -50)).toBe(first.altDeg);
		expect(altAt(curve, 5000)).toBe(curve.samples[curve.samples.length - 1]?.altDeg);
	});

	it("reproduces the sampled altitude at a sample point", () => {
		const curve = sunDayCurve(MALMO.lat, MALMO.lon, EQUINOX);
		const s = curve.samples[120];
		if (!s) throw new Error("no sample");
		expect(altAt(curve, s.minuteOfDay)).toBeCloseTo(s.altDeg, 10);
	});
});

// /bonetider/metod/ makes plain-language claims about the figures drawn from these
// curves. Each is pinned here, so that changing DEFAULT_SETTINGS (a different method,
// a different high-latitude rule) fails a test that names the sentence it just made
// false — rather than leaving the page describing a picture it no longer shows.
describe("the claims /bonetider/metod/ makes about its figures", () => {
	const minutesBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / 60_000;
	/** Altitude of the sun at the instant the site publishes a prayer. */
	const altAtPublished = (lat: number, lon: number, date: Date, key: "fajr" | "isha"): number => {
		const curve = sunDayCurve(lat, lon, date);
		const times = computePrayerTimes({ latitude: lat, longitude: lon }, date, DEFAULT_SETTINGS);
		return altAt(curve, minuteOnCurve(curve, times[key]));
	};

	// The first figure's caption: »Fajr och ʿIshāʾ hamnar nere i skymningen, där solen
	// står 18 respektive 17 grader under horisonten.« It was first drawn for Stockholm
	// at the equinox, where that sentence is FALSE — the published Fajr sits at −13,6°,
	// because adhan applies the seventh-of-the-night rule as a floor and it is later
	// than the angle. The figure moved to Malmö at midwinter, where the sentence is true.
	it("midwinter in Malmö: Fajr sits on 18° below the horizon and ʿIshāʾ on 17°", () => {
		// Half a degree: adhan rounds to the minute, and near the horizon the sun moves
		// roughly a fifth of a degree per minute at this latitude.
		expect(altAtPublished(MALMO.lat, MALMO.lon, MIDWINTER, "fajr")).toBeCloseTo(-18, 0);
		expect(altAtPublished(MALMO.lat, MALMO.lon, MIDWINTER, "isha")).toBeCloseTo(-17, 0);
	});

	// »I Malmö följer Fajr vinkeln ungefär från november till februari; i Stockholm
	// sätter sjundedelen Fajr året runt.«
	it("Malmö's Fajr follows the angle in winter and the seventh-of-the-night floor otherwise", () => {
		for (const [month, day] of [
			[10, 15],
			[11, 21],
			[0, 21],
			[1, 10],
		] as const) {
			const date = dateForStockholmDay(2025, month, day);
			expect(altAtPublished(MALMO.lat, MALMO.lon, date, "fajr")).toBeLessThan(-17.5);
		}
		for (const [month, day] of [
			[2, 20],
			[8, 22],
			[9, 15],
		] as const) {
			const date = dateForStockholmDay(2025, month, day);
			expect(altAtPublished(MALMO.lat, MALMO.lon, date, "fajr")).toBeGreaterThan(-17.5);
		}
	});

	it("Stockholm's Fajr never reaches the 18° angle on any day of the year", () => {
		// Weekly is enough: the curve is smooth and the closest approach (late January)
		// still misses by more than half a degree.
		for (let doy = 0; doy < 365; doy += 7) {
			const date = dateForStockholmDay(2025, 0, 1 + doy);
			expect(altAtPublished(STOCKHOLM.lat, STOCKHOLM.lon, date, "fajr")).toBeGreaterThan(-17.5);
		}
	});

	// »som standard sjundedel av natten, där Fajr sätts en sjundedel av natten före
	// soluppgången och ʿIshāʾ lika långt efter solnedgången.« The page used to name
	// Aqrab al-Balad as the default here. That was wrong south of the polar circle:
	// adhan's recommended() rule is SeventhOfTheNight for every latitude above 48°,
	// and Aqrab al-Balad only engages when there is no sunrise or sunset at all.
	it.each([
		{ name: "Malmö", ...MALMO },
		{ name: "Stockholm", ...STOCKHOLM },
	])(
		"midsummer in $name: Fajr and ʿIshāʾ are a seventh of the night from sunrise and sunset",
		({ lat, lon }) => {
			const times = computePrayerTimes(
				{ latitude: lat, longitude: lon },
				MIDSUMMER,
				DEFAULT_SETTINGS,
			);
			// The night runs from tonight's sunset to tomorrow's sunrise; at midsummer sunrise
			// moves well under a minute a day, so today's sunrise + 24 h stands in for it.
			const night = 1440 - minutesBetween(times.sunrise, times.maghrib);
			const seventh = night / 7;
			expect(Math.abs(minutesBetween(times.fajr, times.sunrise) - seventh)).toBeLessThan(2);
			expect(Math.abs(minutesBetween(times.maghrib, times.isha) - seventh)).toBeLessThan(2);
		},
	);

	it("midsummer in Malmö: both the Fajr and the ʿIshāʾ dot sit well above the 18° line", () => {
		for (const key of ["fajr", "isha"] as const) {
			expect(altAtPublished(MALMO.lat, MALMO.lon, MIDSUMMER, key)).toBeGreaterThan(
				ASTRONOMICAL_NIGHT_DEG + 5,
			);
		}
		// And the curve itself never gets there — the caption's »ingen tidpunkt på dygnet«.
		expect(sunDayCurve(MALMO.lat, MALMO.lon, MIDSUMMER).reachesAstronomicalNight).toBe(false);
	});
});

describe("stockholmOffsetMin", () => {
	it("reads CET in winter and CEST in summer", () => {
		expect(stockholmOffsetMin(EQUINOX)).toBe(60); // 20 March — before the switch
		expect(stockholmOffsetMin(MIDSUMMER)).toBe(120);
		expect(stockholmOffsetMin(MIDWINTER)).toBe(60);
	});
});

describe("minuteOnCurve", () => {
	it("reads an instant on the curve's own clock", () => {
		const winter = sunDayCurve(STOCKHOLM.lat, STOCKHOLM.lon, EQUINOX);
		expect(minuteOnCurve(winter, new Date("2025-03-20T05:30:00Z"))).toBe(6 * 60 + 30);
		// Wraps rather than going past 1440 just before midnight UTC.
		expect(minuteOnCurve(winter, new Date("2025-03-20T23:30:00Z"))).toBe(30);

		const summer = sunDayCurve(STOCKHOLM.lat, STOCKHOLM.lon, MIDSUMMER);
		expect(minuteOnCurve(summer, new Date("2025-06-21T05:30:00Z"))).toBe(7 * 60 + 30);
	});

	it("survives an Invalid Date", () => {
		const curve = sunDayCurve(STOCKHOLM.lat, STOCKHOLM.lon, EQUINOX);
		expect(minuteOnCurve(curve, new Date(Number.NaN))).toBeNaN();
		expect(altAt(curve, Number.NaN)).toBeNaN();
	});

	// Regression: the curve was first sampled in CET year-round, copying the annual
	// chart. But the figure's legend prints formatTime(), which is wall-clock, so at
	// midsummer the Ẓuhr dot sat at 11:51 on the axis while the legend said 12:51 —
	// the picture and its own caption an hour apart. A one-day chart has no DST switch
	// to smooth over; it must be on the clock the reader sees.
	it("puts the published Ẓuhr at the curve's peak, in summer as well as winter", () => {
		for (const date of [EQUINOX, MIDSUMMER]) {
			const curve = sunDayCurve(STOCKHOLM.lat, STOCKHOLM.lon, date);
			const times = computePrayerTimes(
				{ latitude: STOCKHOLM.lat, longitude: STOCKHOLM.lon },
				date,
				DEFAULT_SETTINGS,
			);
			// Ẓuhr is published a minute or two after the transit itself.
			const gap = minuteOnCurve(curve, times.dhuhr) - peakMinute(curve);
			expect(gap).toBeGreaterThanOrEqual(-4);
			expect(gap).toBeLessThanOrEqual(6);
		}
	});
});
