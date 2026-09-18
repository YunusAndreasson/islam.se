// One day of sun altitude, sampled for plotting.
//
// The curve every prayer time hangs off: Fajr and ʿIshāʾ where it crosses the
// method's twilight angle, Shurūq and Maghrib where it crosses the horizon, Ẓuhr at
// the peak, ʿAṣr where the shadow rule puts it. Drawing the curve puts all six on
// one picture and makes "a set angle below the horizon" something you can see.
//
// It also draws its own counter-example. Run it for a Swedish midsummer and the
// curve bottoms out between −11° (Malmö) and 0° (the polar circle) and never reaches
// −18° at all, so Fajr and ʿIshāʾ have no astronomical solution and the high-latitude
// rule has to supply them. Same component, same maths, two dates — see
// /bonetider/metod/.
//
// Sampling mirrors place-facts.ts: solarParams() once for the day, then
// sunPositionAt() per step.
//
// ⚠️ The x axis is Stockholm WALL-CLOCK time for the date, not CET. That is the
// opposite of AnnualPrayerChart.astro's choice, and deliberately so: the annual chart
// spans both DST switches and plots standard time to keep its curves smooth, but a
// one-day chart has no switch to smooth over — and its legend prints formatTime(),
// which is wall-clock. Plotted in CET, a midsummer Ẓuhr dot sat at 11:51 on the axis
// while the legend beside it said 12:51. The offset is taken once per day, which is
// exact for every date except the two switch days themselves.
import { TIME_ZONE } from "./prayer-times";
import { solarParams, sunPositionAt } from "./solar/sun";

/** 4-minute steps → 361 points: smooth at chart scale, compact in the HTML. */
const STEP_MIN = 4;

/** Refraction + the sun's radius, the convention almanacs use for sunrise/sunset. */
export const HORIZON_DEG = -0.833;

/** Astronomical night, and the angle the standard Fajr calculation needs. */
export const ASTRONOMICAL_NIGHT_DEG = -18;

export interface DaySample {
	/** Minutes after local midnight, Stockholm wall-clock for the curve's date. */
	readonly minuteOfDay: number;
	/** Sun altitude, degrees; negative is below the horizon. */
	readonly altDeg: number;
}

export interface SunDayCurve {
	readonly samples: readonly DaySample[];
	/** Stockholm's offset from UTC on the curve's date: 60 in winter, 120 in summer. */
	readonly utcOffsetMin: number;
	/** Altitude at solar noon. */
	readonly maxAltDeg: number;
	/** Altitude at solar midnight — the number that decides whether 18° is reachable. */
	readonly minAltDeg: number;
	/** The sun reaches 18° below the horizon, so Fajr and ʿIshāʾ have an angle solution. */
	readonly reachesAstronomicalNight: boolean;
	/** The sun stays above the horizon all day. */
	readonly midnightSun: boolean;
}

const OFFSET_FORMAT = new Intl.DateTimeFormat("en-US", {
	timeZone: TIME_ZONE,
	timeZoneName: "longOffset",
});

/** Stockholm's UTC offset in minutes at an instant, e.g. 60 (CET) or 120 (CEST). */
export function stockholmOffsetMin(date: Date): number {
	const name = OFFSET_FORMAT.formatToParts(date).find((p) => p.type === "timeZoneName")?.value;
	const m = name ? /GMT([+-])(\d{2}):(\d{2})/.exec(name) : null;
	if (!m) return name === "GMT" ? 0 : 60;
	const sign = m[1] === "-" ? -1 : 1;
	return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/** Sun altitude across one day at a place, sampled for drawing. */
export function sunDayCurve(latDeg: number, lonDeg: number, date: Date): SunDayCurve {
	// Declination and the equation of time drift negligibly across one day.
	const { declRad, eotMin } = solarParams(date);
	const utcOffsetMin = stockholmOffsetMin(date);
	const samples: DaySample[] = [];
	let minAltDeg = 90;
	let maxAltDeg = -90;
	for (let local = 0; local <= 1440; local += STEP_MIN) {
		const { altDeg } = sunPositionAt(latDeg, lonDeg, local - utcOffsetMin, declRad, eotMin);
		samples.push({ minuteOfDay: local, altDeg });
		if (altDeg < minAltDeg) minAltDeg = altDeg;
		if (altDeg > maxAltDeg) maxAltDeg = altDeg;
	}
	return {
		samples,
		utcOffsetMin,
		maxAltDeg,
		minAltDeg,
		reachesAstronomicalNight: minAltDeg <= ASTRONOMICAL_NIGHT_DEG,
		midnightSun: minAltDeg > HORIZON_DEG,
	};
}

/**
 * Where an instant falls on the curve's x axis — minutes after local midnight, on the
 * curve's own clock. Taking the curve rather than a bare offset is the point: a dot
 * can only ever be placed on the same clock the curve was sampled on.
 */
export function minuteOnCurve(curve: SunDayCurve, instant: Date): number {
	const t = instant.getTime();
	if (!Number.isFinite(t)) return Number.NaN;
	const local = Math.floor(t / 60_000) + curve.utcOffsetMin;
	return ((local % 1440) + 1440) % 1440;
}

/**
 * Altitude at an arbitrary minute on the curve, interpolated between samples. Used to
 * sit a prayer's dot at the time computePrayerTimes() actually published, rather than
 * re-deriving that time from the angle.
 */
export function altAt(curve: SunDayCurve, minuteOfDay: number): number {
	const { samples } = curve;
	const first = samples[0];
	const last = samples[samples.length - 1];
	if (!(first && last && Number.isFinite(minuteOfDay))) return Number.NaN;
	if (minuteOfDay <= first.minuteOfDay) return first.altDeg;
	if (minuteOfDay >= last.minuteOfDay) return last.altDeg;
	const i = Math.floor((minuteOfDay - first.minuteOfDay) / STEP_MIN);
	const a = samples[i];
	const b = samples[i + 1];
	if (!(a && b)) return Number.NaN;
	const t = (minuteOfDay - a.minuteOfDay) / (b.minuteOfDay - a.minuteOfDay);
	return a.altDeg + t * (b.altDeg - a.altDeg);
}
