import { describe, expect, it } from '@jest/globals';
import {
  type CalculationParameters,
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
} from 'adhan';

import {
  buildParams,
  computePrayerTimes,
  formatTime,
  nextPrayerKeyAt,
  PRAYER_ORDER,
} from './prayer-times';
import {
  type CalculationMethodKey,
  DEFAULT_SETTINGS,
  type PrayerAdjustments,
  type PrayerSettings,
} from './settings/types';
import { oracleTimes } from '../test-utils/prayer-oracle';

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA = { latitude: 67.8558, longitude: 20.2253 };
// A spring day where every prayer is computable at Stockholm — stable reference.
const SPRING_DAY = new Date(2026, 2, 20); // 20 Mar 2026

type Overrides = Partial<Omit<PrayerSettings, 'adjustments'>> & {
  adjustments?: Partial<PrayerAdjustments>;
};

function settings(overrides: Overrides = {}): PrayerSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
    adjustments: { ...DEFAULT_SETTINGS.adjustments, ...(overrides.adjustments ?? {}) },
  };
}

describe('buildParams', () => {
  it('maps madhab to the adhan enum', () => {
    const coords = new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude);
    expect(buildParams(settings({ madhab: 'shafi' }), coords).madhab).toBe(Madhab.Shafi);
    expect(buildParams(settings({ madhab: 'hanafi' }), coords).madhab).toBe(Madhab.Hanafi);
  });

  it("resolves 'auto' high-latitude rule via HighLatitudeRule.recommended()", () => {
    const coords = new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude);
    const expected = HighLatitudeRule.recommended(coords);
    expect(buildParams(settings({ highLatitudeRule: 'auto' }), coords).highLatitudeRule).toBe(expected);
  });

  it('passes an explicit high-latitude rule through unchanged', () => {
    const coords = new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude);
    expect(buildParams(settings({ highLatitudeRule: 'middleOfTheNight' }), coords).highLatitudeRule).toBe(
      HighLatitudeRule.MiddleOfTheNight,
    );
  });

  it('forwards manual minute adjustments onto the params', () => {
    const coords = new Coordinates(STOCKHOLM.latitude, STOCKHOLM.longitude);
    const params = buildParams(settings({ adjustments: { fajr: 5, isha: -3 } }), coords);
    expect(params.adjustments.fajr).toBe(5);
    expect(params.adjustments.isha).toBe(-3);
  });
});

describe('computePrayerTimes', () => {
  it('produces six ordered, valid times for Stockholm in spring', () => {
    const pt = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings());
    const order = [pt.fajr, pt.sunrise, pt.dhuhr, pt.asr, pt.maghrib, pt.isha];
    for (const t of order) {
      expect(t instanceof Date).toBe(true);
      expect(Number.isNaN(t.getTime())).toBe(false);
    }
    // Times must be strictly increasing across the day.
    for (let i = 1; i < order.length; i++) {
      expect(order[i].getTime()).toBeGreaterThan(order[i - 1].getTime());
    }
  });

  it('reflects a manual +10 min Fajr adjustment', () => {
    const base = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings());
    const adjusted = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings({ adjustments: { fajr: 10 } }));
    const deltaMin = (adjusted.fajr.getTime() - base.fajr.getTime()) / 60000;
    expect(Math.round(deltaMin)).toBe(10);
  });

  // The reason this whole feature needs PolarCircleResolution: above the Arctic
  // Circle in midsummer, angle-based Fajr/Isha have no solution. 'unresolved'
  // yields Invalid Date; 'aqrabBalad' must recover real times — regressing this
  // would silently blank prayer times for northern Sweden.
  it('keeps Kiruna midsummer times derivable only with a polar resolution', () => {
    const midsummer = new Date(2026, 5, 21); // 21 Jun 2026
    const unresolved = computePrayerTimes(KIRUNA, midsummer, settings({ polarCircleResolution: 'unresolved' }));
    expect(Number.isNaN(unresolved.isha.getTime())).toBe(true);

    const aqrabBalad = computePrayerTimes(KIRUNA, midsummer, settings({ polarCircleResolution: 'aqrabBalad' }));
    expect(Number.isNaN(aqrabBalad.isha.getTime())).toBe(false);
    expect(Number.isNaN(aqrabBalad.fajr.getTime())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wiring sweep (pure): the app's settings → buildParams → adhan path vs. the
// hand-built adhan-direct oracle, walked programmatically across the three inputs
// that actually change adhan's behaviour — calculation method, latitude and season —
// so "the app feeds adhan exactly what the spec says" is checked over every regime,
// for every method, instead of at one lucky point with one hardcoded method.
// ---------------------------------------------------------------------------

// Every real calculation method (all presets except the manual 0° "Other"), each paired
// with the adhan factory it must map to. The factory is written out here independently of
// the app's METHOD_FACTORY table, so a mis-mapping there surfaces as a failing method.
// The list spans the structurally distinct Isha models on purpose: angle-based (MWL,
// Egyptian, Karachi, …), fixed-interval (UmmAlQura, Qatar — Isha 90 min after Maghrib),
// and shafaq + seasonal adjustment (MoonsightingCommittee).
const METHOD_CASES: { key: CalculationMethodKey; factory: () => CalculationParameters }[] = [
  { key: 'MuslimWorldLeague', factory: CalculationMethod.MuslimWorldLeague },
  { key: 'Egyptian', factory: CalculationMethod.Egyptian },
  { key: 'Karachi', factory: CalculationMethod.Karachi },
  { key: 'UmmAlQura', factory: CalculationMethod.UmmAlQura },
  { key: 'Dubai', factory: CalculationMethod.Dubai },
  { key: 'Qatar', factory: CalculationMethod.Qatar },
  { key: 'Kuwait', factory: CalculationMethod.Kuwait },
  { key: 'MoonsightingCommittee', factory: CalculationMethod.MoonsightingCommittee },
  { key: 'Singapore', factory: CalculationMethod.Singapore },
  { key: 'Turkey', factory: CalculationMethod.Turkey },
  { key: 'Tehran', factory: CalculationMethod.Tehran },
  { key: 'NorthAmerica', factory: CalculationMethod.NorthAmerica },
];

// Latitudes from the south coast to deep inside the Arctic, and the two seasonal extremes:
// January (CET, sun low but angles still resolve; Kiruna in polar night) and July (CEST,
// the high-latitude rule engaged; Kiruna under the midnight sun). Crossing these with every
// method is where each method's Isha model meets the high-latitude rule and the polar-circle
// resolution — the combinations a single-method spring-day test can never reach.
const SWEEP_CITIES = [
  { name: 'Malmö', latitude: 55.605, longitude: 13.0038 },
  { name: 'Stockholm', latitude: 59.3293, longitude: 18.0686 },
  { name: 'Umeå', latitude: 63.8258, longitude: 20.263 },
  { name: 'Kiruna', latitude: 67.8558, longitude: 20.2253 },
];
const SWEEP_DATES = [
  { label: 'jan', date: new Date(2026, 0, 15) },
  { label: 'jul', date: new Date(2026, 6, 15) },
];

const WIRING_GRID = METHOD_CASES.flatMap((method) =>
  SWEEP_CITIES.flatMap((city) =>
    SWEEP_DATES.map(({ label, date }) => ({
      method,
      city,
      date,
      when: `${method.key} · ${city.name} · ${label}`,
    })),
  ),
);

describe('settings → adhan wiring across method, latitude and season', () => {
  it.each(WIRING_GRID)('matches adhan-direct: $when', ({ method, city, date }) => {
    const app = computePrayerTimes(city, date, settings({ calculationMethod: method.key }));
    const oracle = oracleTimes(city, date, { method: method.factory });
    for (const key of PRAYER_ORDER) {
      expect(formatTime(app[key])).toBe(formatTime(oracle[key]));
    }
  });
});

// ---------------------------------------------------------------------------
// Metamorphic solar-geometry relations.
//
// These assert physical truths that ANY correct prayer-time computation must obey —
// solar noon sits midway between sunrise and sunset; a more eastern longitude reaches
// noon earlier; Hanafi's longer shadow puts Asr later; days lengthen toward the pole
// in summer. None of them states an expected clock time, so there is no external
// number to copy and nothing to rubber-stamp: the expected result is fixed by the
// geometry, not by reading what the code happens to print. A timezone, sign, unit, or
// longitude bug breaks a relation even when each individual time still looks plausible.
// ---------------------------------------------------------------------------
const MIN = 60_000;
const spanMin = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / MIN;

describe('metamorphic solar-geometry relations', () => {
  it('places Dhuhr (solar noon) midway between sunrise and Maghrib (sunset)', () => {
    // Sunrise and sunset straddle the sun's meridian transit; Dhuhr is that transit
    // and Maghrib is sunset plus the active method's small adjustment. Their midpoint
    // must land near Dhuhr, with enough slack for that adjustment and the sun's
    // declination drifting across the day (largest near the equinox, which SPRING_DAY
    // deliberately is).
    const pt = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings());
    const midpoint = (pt.sunrise.getTime() + pt.maghrib.getTime()) / 2;
    expect(Math.abs(midpoint - pt.dhuhr.getTime()) / MIN).toBeLessThan(5);
  });

  it('reaches solar noon ~40 min earlier 10° further east', () => {
    // Earth turns 15°/hour ⇒ 10° east = 40 min earlier transit. Same latitude and date
    // cancel declination and the equation of time, isolating the longitude term — so
    // this catches a longitude sign flip or a degrees/radians-style unit slip.
    const west = computePrayerTimes({ latitude: 59.33, longitude: 10 }, SPRING_DAY, settings());
    const east = computePrayerTimes({ latitude: 59.33, longitude: 20 }, SPRING_DAY, settings());
    const earlierBy = spanMin(east.dhuhr, west.dhuhr); // east is earlier ⇒ positive
    expect(earlierBy).toBeGreaterThan(38); // 40, ± a minute of per-side rounding
    expect(earlierBy).toBeLessThan(42);
  });

  it('puts Hanafi Asr later than Shafi Asr and changes nothing else', () => {
    // The madhab is purely the Asr shadow ratio (Hanafi 2× vs Shafi 1×): a longer
    // shadow ⇒ a later Asr, and every other prayer is independent of it.
    const shafi = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings({ madhab: 'shafi' }));
    const hanafi = computePrayerTimes(STOCKHOLM, SPRING_DAY, settings({ madhab: 'hanafi' }));
    expect(hanafi.asr.getTime()).toBeGreaterThan(shafi.asr.getTime());
    for (const key of ['fajr', 'sunrise', 'dhuhr', 'maghrib', 'isha'] as const) {
      expect(hanafi[key].getTime()).toBe(shafi[key].getTime());
    }
  });

  it('gives a northern city a longer summer day than a southern one', () => {
    // In the summer hemisphere daylight lengthens toward the pole. In late May both
    // cities still have a real sunrise and sunset (below the midnight-sun threshold),
    // so the relation holds without any polar-circle resolution kicking in.
    const day = new Date(2026, 4, 20); // 20 May 2026
    const malmo = computePrayerTimes({ latitude: 55.605, longitude: 13.0038 }, day, settings());
    const umea = computePrayerTimes({ latitude: 63.8258, longitude: 20.263 }, day, settings());
    expect(spanMin(umea.sunrise, umea.maghrib)).toBeGreaterThan(
      spanMin(malmo.sunrise, malmo.maghrib),
    );
  });
});

describe('formatTime', () => {
  it('renders 24h times in Europe/Stockholm and a dash for uncomputable times', () => {
    // 20 Mar 2026 is before DST starts, so Europe/Stockholm = CET (UTC+1). Sweden uses
    // the 24-hour clock exclusively, so there is no 12-hour path to format.
    const noon = new Date(Date.UTC(2026, 2, 20, 11, 0)); // 12:00 local
    expect(formatTime(noon)).toMatch(/^12[:.]00$/);
    const afternoon = new Date(Date.UTC(2026, 2, 20, 13, 0)); // 14:00 local — never "2"
    expect(formatTime(afternoon)).toMatch(/14[:.]00/);
    expect(formatTime(new Date(NaN))).toBe('—');
  });

  it('follows the daylight-saving shift into summer (CEST = UTC+2)', () => {
    // The same UTC instant must read an hour later in July than in winter — the
    // independent oracle here is the known Europe/Stockholm offset (CET+1 → CEST+2),
    // so this catches a formatter pinned to a fixed offset across the DST boundary.
    const winter = new Date(Date.UTC(2026, 0, 15, 10, 0)); // 15 Jan 10:00 UTC → 11:00 CET
    const summer = new Date(Date.UTC(2026, 6, 15, 10, 0)); // 15 Jul 10:00 UTC → 12:00 CEST
    expect(formatTime(winter)).toMatch(/^11[:.]00$/);
    expect(formatTime(summer)).toMatch(/^12[:.]00$/);
  });
});

// Which prayer the dock highlights ("current/next") at a viewed instant. The bug this
// section guards: tapping a prayer row lands the clock exactly on that prayer's time, and a
// strict `>` excluded the prayer from being "after" itself, so the prayer AFTER it lit up —
// tap Ẓuhr, ʿAṣr highlighted. There was no test; this is it.
describe('nextPrayerKeyAt', () => {
  const times = computePrayerTimes(STOCKHOLM, SPRING_DAY, DEFAULT_SETTINGS);

  it('picks the first prayer at-or-after a between-prayers instant', () => {
    expect(nextPrayerKeyAt(times, times.fajr.getTime() - 60_000)).toBe('fajr'); // before dawn
    expect(nextPrayerKeyAt(times, times.dhuhr.getTime() + 60_000)).toBe('asr'); // just past Ẓuhr
  });

  it('returns null once every prayer has passed (caller rolls to tomorrow)', () => {
    expect(nextPrayerKeyAt(times, times.isha.getTime() + 60_000)).toBeNull();
  });

  it('selects the prayer landed on EXACTLY (regression: tapping Ẓuhr highlighted ʿAṣr)', () => {
    // Probing each prayer at its own instant must return that prayer, not the next one —
    // this is exactly what a dock row tap does (it scrubs the clock onto the prayer's time).
    for (const key of PRAYER_ORDER) {
      expect(nextPrayerKeyAt(times, times[key].getTime())).toBe(key);
    }
  });

  it('never selects a prayer adhan could not resolve (NaN) — Kiruna midsummer', () => {
    const polar = computePrayerTimes(KIRUNA, new Date(2026, 5, 21), {
      ...DEFAULT_SETTINGS,
      polarCircleResolution: 'unresolved',
    });
    // Guard: this scenario really does leave some prayers unresolved (Invalid Date).
    expect(PRAYER_ORDER.some((k) => Number.isNaN(polar[k].getTime()))).toBe(true);
    // Probed across the whole day, every selection is a FINITE prayer — NaN ones are skipped.
    for (let t = Date.UTC(2026, 5, 21); t < Date.UTC(2026, 5, 22); t += 3 * 3_600_000) {
      const key = nextPrayerKeyAt(polar, t);
      if (key) expect(Number.isFinite(polar[key].getTime())).toBe(true);
    }
  });
});
