// Bridges PrayerSettings (our serialisable shape) onto adhan's CalculationParameters
// and computes the day's prayer times. Kept UI-free so any screen can call it.
import {
	CalculationMethod,
	type CalculationParameters,
	Coordinates,
	HighLatitudeRule,
	Madhab,
	PolarCircleResolution,
	PrayerTimes,
	Rounding,
	Shafaq,
} from "adhan";

import type {
	CalculationMethodKey,
	HighLatitudeRuleKey,
	PolarCircleResolutionKey,
	PrayerSettings,
} from "./settings";

export interface LatLng {
	latitude: number;
	longitude: number;
}

/** Each preset key → its adhan factory. Drives both compute and the settings UI. */
const METHOD_FACTORY: Record<CalculationMethodKey, () => CalculationParameters> = {
	MuslimWorldLeague: CalculationMethod.MuslimWorldLeague,
	Egyptian: CalculationMethod.Egyptian,
	Karachi: CalculationMethod.Karachi,
	UmmAlQura: CalculationMethod.UmmAlQura,
	Dubai: CalculationMethod.Dubai,
	Qatar: CalculationMethod.Qatar,
	Kuwait: CalculationMethod.Kuwait,
	MoonsightingCommittee: CalculationMethod.MoonsightingCommittee,
	Singapore: CalculationMethod.Singapore,
	Turkey: CalculationMethod.Turkey,
	Tehran: CalculationMethod.Tehran,
	NorthAmerica: CalculationMethod.NorthAmerica,
	Other: CalculationMethod.Other,
};

const HIGH_LAT_RULE: Record<
	Exclude<HighLatitudeRuleKey, "auto">,
	(typeof HighLatitudeRule)[keyof typeof HighLatitudeRule]
> = {
	middleOfTheNight: HighLatitudeRule.MiddleOfTheNight,
	seventhOfTheNight: HighLatitudeRule.SeventhOfTheNight,
	twilightAngle: HighLatitudeRule.TwilightAngle,
};

const POLAR_RESOLUTION: Record<
	PolarCircleResolutionKey,
	(typeof PolarCircleResolution)[keyof typeof PolarCircleResolution]
> = {
	aqrabBalad: PolarCircleResolution.AqrabBalad,
	aqrabYaum: PolarCircleResolution.AqrabYaum,
	unresolved: PolarCircleResolution.Unresolved,
};

const ROUNDING = {
	nearest: Rounding.Nearest,
	up: Rounding.Up,
	none: Rounding.None,
} as const;

const SHAFAQ = {
	general: Shafaq.General,
	ahmer: Shafaq.Ahmer,
	abyad: Shafaq.Abyad,
} as const;

/** Translate settings into a configured adhan CalculationParameters for `coords`. */
function buildParams(settings: PrayerSettings, coords: Coordinates): CalculationParameters {
	const params = METHOD_FACTORY[settings.calculationMethod]();
	params.madhab = settings.madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
	// 'auto' defers to adhan's latitude-aware recommendation; otherwise honour the
	// explicit choice. recommended() needs the coordinate, hence resolved here.
	params.highLatitudeRule =
		settings.highLatitudeRule === "auto"
			? HighLatitudeRule.recommended(coords)
			: HIGH_LAT_RULE[settings.highLatitudeRule];
	params.polarCircleResolution = POLAR_RESOLUTION[settings.polarCircleResolution];
	params.shafaq = SHAFAQ[settings.shafaq];
	params.adjustments = { ...params.adjustments, ...settings.adjustments };
	params.rounding = ROUNDING[settings.rounding];
	return params;
}

/** Whether a coordinate is real and on the globe — guards adhan against garbage input. */
function coordsValid(coords: LatLng): boolean {
	return (
		Number.isFinite(coords.latitude) &&
		Number.isFinite(coords.longitude) &&
		Math.abs(coords.latitude) <= 90 &&
		Math.abs(coords.longitude) <= 180
	);
}

// Swedish locations all sit in Europe/Stockholm. adhan reads a Date's local
// getFullYear/getMonth/getDate values, so callers must not let the visitor's or
// build host's timezone decide which Swedish calendar day is being calculated.
export const TIME_ZONE = "Europe/Stockholm";

const STOCKHOLM_TIME_FORMAT = new Intl.DateTimeFormat("sv-SE", {
	timeZone: TIME_ZONE,
	hour: "2-digit",
	minute: "2-digit",
});
const STOCKHOLM_MONTH_FORMAT = new Intl.DateTimeFormat("sv-SE", {
	timeZone: TIME_ZONE,
	month: "long",
});
const STOCKHOLM_WEEKDAY_FORMAT = new Intl.DateTimeFormat("sv-SE", {
	timeZone: TIME_ZONE,
	weekday: "short",
});

/** Abbreviated Swedish weekday, shared by static and refreshed prayer tables. */
export function stockholmWeekdayLabel(date: Date): string {
	return STOCKHOLM_WEEKDAY_FORMAT.format(date);
}

const STOCKHOLM_DATE_FORMAT = new Intl.DateTimeFormat("sv-SE", {
	timeZone: TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** ISO calendar date for datetime attributes and daily build caches. */
export function stockholmIsoDate(date: Date): string {
	return STOCKHOLM_DATE_FORMAT.format(date);
}

const DATE_LABEL_OPTIONS = { timeZone: TIME_ZONE, day: "numeric", month: "long" } as const;
const DATE_LABEL_FORMATS = {
	short: new Intl.DateTimeFormat("sv-SE", DATE_LABEL_OPTIONS),
	weekday: new Intl.DateTimeFormat("sv-SE", { ...DATE_LABEL_OPTIONS, weekday: "long" }),
	full: new Intl.DateTimeFormat("sv-SE", {
		...DATE_LABEL_OPTIONS,
		weekday: "long",
		year: "numeric",
	}),
};

/** Shared by the server baseline and live updates; retain each surface's date detail. */
export function stockholmDateLabel(
	date: Date,
	detail: keyof typeof DATE_LABEL_FORMATS = "weekday",
): string {
	return DATE_LABEL_FORMATS[detail].format(date);
}

export interface StockholmDateParts {
	year: number;
	/** Zero-based month, matching Date#getMonth(). */
	month: number;
	day: number;
}

export function stockholmDateParts(date: Date): StockholmDateParts {
	const parts = STOCKHOLM_DATE_FORMAT.formatToParts(date);
	const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return {
		year: value("year"),
		month: value("month") - 1,
		day: value("day"),
	};
}

/**
 * Cache key for anything derived from a Swedish calendar day — the day's prayer times, the
 * solar lattice behind the field canvas.
 *
 * ⚠️ It must be the STOCKHOLM day, never the visitor's. computePrayerTimes always resolves
 * the Swedish day from the instant it is handed, so a key built from the reader's local
 * getFullYear/getMonth/getDate named a day the cached value did not hold — and then failed
 * to expire at the Stockholm midnight it existed to catch. Both callers had that shape and
 * both were wrong for every reader outside Europe/Stockholm: measured against a from-scratch
 * recomputation at 15-minute steps over 40 days, the field's next-prayer readout disagreed
 * on 222/3840 samples from New York and 2593/3840 from Riyadh (worst case 22.8 hours out,
 * announcing Fajr "om 24 tim" while Sweden was mid-morning), and 0/3840 from Stockholm —
 * which is exactly why it survived so long.
 */
export function stockholmDayKey(date: Date): string {
	const { year, month, day } = stockholmDateParts(date);
	return `${year}-${month}-${day}`;
}

/** An instant safely inside the requested Stockholm calendar day. */
export function dateForStockholmDay(year: number, month: number, day: number): Date {
	return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

/** Swedish month + year, e.g. "juli 2026". The month table's caption and the heading
 *  above it must name the same month, so both read it from here. */
export function stockholmMonthLabel(date: Date): string {
	const { year, month } = stockholmDateParts(date);
	const name = STOCKHOLM_MONTH_FORMAT.format(dateForStockholmDay(year, month, 15));
	return `${name} ${year}`;
}

function calculationDateForStockholmDay(date: Date): Date {
	const { year, month, day } = stockholmDateParts(date);
	// adhan reads local Y/M/D from the Date object. This Date is not the target
	// instant; it is an adapter so those local getters return the Stockholm day.
	return new Date(year, month, day, 12, 0, 0);
}

export function computePrayerTimes(
	coords: LatLng,
	date: Date,
	settings: PrayerSettings,
): PrayerTimes {
	// A GPS fix can arrive as NaN before the first lock, and a corrupt or hand-edited manual
	// location can be out of range. Feeding either to adhan is unsafe two ways: out-of-range
	// but finite coordinates produce confidently-WRONG times, and NaN/garbage under the
	// default aqrabBalad polar resolver sends adhan into infinite recursion (it hunts for a
	// valid night that never comes) — a hard crash. So for invalid input, substitute NaN
	// coordinates and the no-op Unresolved resolver: every slot becomes an Invalid Date that
	// formatTime renders as "—" — honest, and crash-free. Valid coordinates are untouched.
	const valid = coordsValid(coords);
	const c = valid
		? new Coordinates(coords.latitude, coords.longitude)
		: new Coordinates(Number.NaN, Number.NaN);
	const params = buildParams(settings, c);
	if (!valid) params.polarCircleResolution = PolarCircleResolution.Unresolved;
	return new PrayerTimes(c, calculationDateForStockholmDay(date), params);
}

/** The six daily prayers plus sunrise, in chronological order, with Swedish labels. */
export const PRAYER_ORDER = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYER_ORDER)[number];

/**
 * The prayer to treat as "current / next" at the instant `now` (ms epoch): the first in
 * the day's chronological order whose time is AT OR AFTER `now`. Returns null when every
 * prayer has already passed (callers then roll over to tomorrow's Fajr). Prayers adhan
 * couldn't resolve (Invalid Date → NaN, e.g. polar) are skipped, never selected.
 *
 * The boundary is INCLUSIVE (`>=`) on purpose. The dock lets the user time-travel by
 * tapping a prayer row, which lands the clock exactly on that prayer's time; with a strict
 * `>` the prayer didn't count as "after" itself, so the prayer AFTER it lit up instead —
 * tap Ẓuhr, ʿAṣr highlighted (the bug this guards). Landing exactly on a prayer should
 * select THAT prayer. In live mode the choice is unobservable: the clock ticks every 30 s
 * so `now` never equals a prayer to the millisecond, and at exact equality the just-arrived
 * prayer is the right "current" answer anyway.
 */
export function nextPrayerKeyAt(times: PrayerTimes, now: number): PrayerKey | null {
	for (const key of PRAYER_ORDER) {
		const at = times[key].getTime();
		if (Number.isFinite(at) && at >= now) return key;
	}
	return null;
}

/**
 * The prayer to count down to at `now`, and when it falls: the day's next prayer, or once
 * ʿIshāʾ has passed, Fajr of the NEXT Stockholm calendar day. `today` is `coords`' times for
 * `now`'s Stockholm day. Five places wrote this; one took tomorrow as `now` + 24 hours,
 * which on the night the clocks go forward (Saturday 23:00–24:00) lands on Monday and
 * counted down to the wrong Fajr.
 */
export function nextPrayer(
	coords: LatLng,
	today: PrayerTimes,
	now: Date,
	settings: PrayerSettings,
): { key: PrayerKey; at: Date } {
	const key = nextPrayerKeyAt(today, now.getTime());
	if (key) return { key, at: today[key] };
	const { year, month, day } = stockholmDateParts(now);
	return {
		key: "fajr",
		at: computePrayerTimes(coords, dateForStockholmDay(year, month, day + 1), settings).fajr,
	};
}

// Arabic prayer names in academic transliteration (DIN 31635 / ALA-LC style):
//   ʿayn  = ʿ        ḍ = emphatic d        ī = long i
//   hamza = ʾ        ḥ = pharyngeal h      ū = long u
//                    ṣ = emphatic s        ā = long a
//                    ẓ = emphatic z
//
// The Swedish translation in PRAYER_SWEDISH_NAMES sits as a muted second line
// under the Arabic name in places that have room (Förhandsvisning). Sunrise
// (Shurūq) is included here even though it's a *marker* not a prayer — the
// user expects to see the Arabic name everywhere a prayer time appears.
export const PRAYER_LABELS: Record<PrayerKey, string> = {
	fajr: "Fajr",
	sunrise: "Shurūq",
	dhuhr: "Ẓuhr",
	asr: "ʿAṣr",
	maghrib: "Maghrib",
	isha: "ʿIshāʾ",
};

/**
 * Swedish translations, paired with the Arabic name in two-line displays.
 *  – Fajr     → Gryningsbönen   (true dawn, before sunrise)
 *  – Shurūq   → Soluppgång      (the marker — end of fajr-time)
 *  – Ẓuhr     → Middagsbönen    (sun past zenith)
 *  – ʿAṣr     → Eftermiddagsbönen (shadow = object length)
 *  – Maghrib  → Solnedgångsbönen (right after sunset)
 *  – ʿIshāʾ   → Nattbönen       (after twilight ends)
 */
export const PRAYER_SWEDISH_NAMES: Record<PrayerKey, string> = {
	fajr: "Gryningsbönen",
	sunrise: "Soluppgång",
	dhuhr: "Middagsbönen",
	asr: "Eftermiddagsbönen",
	maghrib: "Solnedgångsbönen",
	isha: "Nattbönen",
};

/**
 * Format a prayer-time Date for display, in 24-hour Europe/Stockholm time (Sweden
 * uses the 24-hour clock exclusively). Returns '—' for slots adhan could not
 * compute (Invalid Date), which happens above the Arctic Circle when polar
 * resolution is 'unresolved'.
 */
export function formatTime(date: Date | null | undefined): string {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
	return STOCKHOLM_TIME_FORMAT.format(date);
}

/**
 * »om 1 tim 12 min«, »om 12 min«, »om 34 sek«, »om 3 tim« on the hour, and »nu« once it is
 * due. Minutes round UP, to the difference a reader works out from the two clocks on the
 * screen: a prayer at 12:05 is »om 5 min« for the whole of 12:00. The prayer field and the
 * moskéskärm each had their own copy, one flooring and one rounding, so a phone and the
 * wall beside it could name the same prayer a minute apart.
 */
export function countdownLabel(msLeft: number): string {
	if (msLeft <= 0) return "nu";
	const secs = Math.ceil(msLeft / 1000);
	if (secs < 60) return `om ${secs} sek`;
	const mins = Math.ceil(msLeft / 60_000);
	if (mins < 60) return `om ${mins} min`;
	const hours = Math.floor(mins / 60);
	return mins % 60 === 0 ? `om ${hours} tim` : `om ${hours} tim ${mins % 60} min`;
}
