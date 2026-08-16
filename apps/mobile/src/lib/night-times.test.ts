// Contract for the night's two voluntary landmarks.
//
// Everything here is METAMORPHIC or oracle-based — no clock times pasted back from a
// run. The relations asserted (ordering against the prayers, the 2:1 ratio of the two
// offsets from maghrib) hold for every latitude and every method, so they keep their
// meaning if the default calculation method ever changes.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  computeNightTimes,
  crossedMidnightLabel,
  NIGHT_ICONS,
  NIGHT_LABELS,
  NIGHT_ORDER,
  NIGHT_SWEDISH_NAMES,
  nightCaption,
  resetNightFormattersForTests,
} from './night-times';
import { computePrayerTimes } from './prayer-times';
import { addStockholmDays, startOfStockholmDay, stockholmPrayerDate } from './stockholm-time';
import { DEFAULT_SETTINGS, type PrayerSettings } from './settings/types';

const MALMO = { latitude: 55.605, longitude: 13.0038 };
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const UMEA = { latitude: 63.8258, longitude: 20.263 };
const KIRUNA = { latitude: 67.8558, longitude: 20.2253 };

const CITIES: [string, { latitude: number; longitude: number }][] = [
  ['Malmö', MALMO],
  ['Stockholm', STOCKHOLM],
  ['Umeå', UMEA],
  ['Kiruna', KIRUNA],
];

const SPRING_DAY = new Date(2026, 2, 20, 12); // 20 Mar 2026 — every slot computable
const MIDSUMMER = new Date(2026, 5, 21, 12); // 21 Jun 2026 — the shortest night

function settings(overrides: Partial<PrayerSettings> = {}): PrayerSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

function nightFor(coords: { latitude: number; longitude: number }, date: Date, s = settings()) {
  return computeNightTimes(computePrayerTimes(coords, date, s));
}

describe('computeNightTimes — the night divided', () => {
  it.each(CITIES)('%s: maghrib < mitt < sista tredjedel < next fajr', (_name, coords) => {
    const times = computePrayerTimes(coords, SPRING_DAY, settings());
    const night = computeNightTimes(times);
    const nextFajr = computePrayerTimes(coords, new Date(2026, 2, 21, 12), settings()).fajr;

    expect(night.middleOfNight).not.toBeNull();
    expect(night.lastThird).not.toBeNull();
    expect(times.maghrib.getTime()).toBeLessThan(night.middleOfNight!.getTime());
    expect(night.middleOfNight!.getTime()).toBeLessThan(night.lastThird!.getTime());
    expect(night.lastThird!.getTime()).toBeLessThan(nextFajr.getTime());
  });

  // The defining arithmetic: from maghrib, the midpoint is 1/2 of the night in and the
  // last third starts 2/3 in. So the gap between them is 1/6 of the night — a THIRD of
  // the midpoint's own offset — and the two offsets stand in a 4:3 ratio. Asserting the
  // ratio rather than a duration keeps this true at every latitude and season.
  // Tolerance is one minute: adhan rounds each value to the nearest minute independently.
  it.each(CITIES)('%s: midpoint and last third divide the night 1/2 and 2/3', (_name, coords) => {
    const times = computePrayerTimes(coords, SPRING_DAY, settings());
    const night = computeNightTimes(times);
    const fromMaghrib = (d: Date): number => d.getTime() - times.maghrib.getTime();

    const half = fromMaghrib(night.middleOfNight!);
    const twoThirds = fromMaghrib(night.lastThird!);
    expect(Math.abs(twoThirds * 3 - half * 4)).toBeLessThanOrEqual(3 * 60_000);
    expect(Math.abs((twoThirds - half) * 3 - half)).toBeLessThanOrEqual(3 * 60_000);
  });

  it('follows a manual Maghrib adjustment, because adhan bakes it into the day', () => {
    const base = nightFor(STOCKHOLM, SPRING_DAY);
    const shifted = nightFor(
      STOCKHOLM,
      SPRING_DAY,
      settings({ adjustments: { ...DEFAULT_SETTINGS.adjustments, maghrib: 30 } }),
    );
    // Maghrib 30 min later shortens the night by 30 min, so its midpoint moves by half
    // that (+15 min) and the two-thirds point by a third of it (+10 min).
    const deltaMid = shifted.middleOfNight!.getTime() - base.middleOfNight!.getTime();
    const deltaThird = shifted.lastThird!.getTime() - base.lastThird!.getTime();
    expect(Math.round(deltaMid / 60_000)).toBeGreaterThanOrEqual(14);
    expect(Math.round(deltaMid / 60_000)).toBeLessThanOrEqual(16);
    expect(Math.round(deltaThird / 60_000)).toBeGreaterThanOrEqual(9);
    expect(Math.round(deltaThird / 60_000)).toBeLessThanOrEqual(11);
  });
});

// THE REGRESSION THIS FILE EXISTS FOR.
//
// adhan's SunnahTimes divides maghrib → next fajr. Under HighLatitudeRule.MiddleOfTheNight
// a Swedish summer clamps BOTH fajr and isha toward the night's midpoint, so they converge
// and the interval being divided is no longer the night: the "middle" and "last third"
// land before ʿIshāʾ has entered. Over all of 2026 that is 106 days at Malmö, 128 at
// Stockholm and 175 at Kiruna. Displaying it would put a visible contradiction on screen
// for a third of the year, so computeNightTimes returns null instead.
describe('computeNightTimes — the ordering guard', () => {
  it('suppresses both times when the high-latitude rule collapses the night', () => {
    const night = nightFor(STOCKHOLM, MIDSUMMER, settings({ highLatitudeRule: 'middleOfTheNight' }));
    expect(night).toEqual({ middleOfNight: null, lastThird: null });
  });

  it('keeps them on the same day under the default rule', () => {
    const night = nightFor(STOCKHOLM, MIDSUMMER);
    expect(night.middleOfNight).toBeInstanceOf(Date);
    expect(night.lastThird).toBeInstanceOf(Date);
  });

  // A genuinely short night is reported, not suppressed. Kiruna at midsummer has a night
  // of well under an hour; that is true, and inventing a minimum would be a nicer-looking
  // lie. Only the contradictory case above is filtered.
  it('reports Kiruna’s midsummer night however short it is', () => {
    const times = computePrayerTimes(KIRUNA, MIDSUMMER, settings());
    const night = computeNightTimes(times);
    expect(night.lastThird).toBeInstanceOf(Date);
    expect(night.lastThird!.getTime()).toBeGreaterThan(times.isha.getTime());
  });

  it('is empty when the prayers themselves could not be resolved', () => {
    // Polar 'unresolved' → Invalid Dates all the way down.
    const night = nightFor(KIRUNA, MIDSUMMER, settings({ polarCircleResolution: 'unresolved' }));
    expect(night).toEqual({ middleOfNight: null, lastThird: null });
  });

  it('is empty for invalid coordinates', () => {
    const night = nightFor({ latitude: Number.NaN, longitude: Number.NaN }, SPRING_DAY);
    expect(night).toEqual({ middleOfNight: null, lastThird: null });
  });

  // Every ordering assertion above is only meaningful if the guard is not simply
  // returning null everywhere. Sweep a year at every city and assert the default settings
  // produce a usable night on every single day — the measurement the guard's comment cites.
  it.each(CITIES)('%s: the default settings never trip the guard, all 365 days', (_name, coords) => {
    const suppressed: string[] = [];
    for (let i = 0; i < 365; i++) {
      const day = new Date(2026, 0, 1 + i, 12);
      const night = nightFor(coords, day);
      if (!night.middleOfNight || !night.lastThird) suppressed.push(day.toDateString());
    }
    expect(suppressed).toEqual([]);
  });
});

// A Stockholm day is 23, 24 or 25 hours. adhan derives the next day with dateByAddingDays,
// which preserves LOCAL hours — the same noon anchoring stockholm-time.ts uses. A refactor
// to `+ 86_400_000` anywhere in that path would break exactly one day a year, silently.
describe('computeNightTimes — DST days', () => {
  it.each([
    ['spring forward (23 h)', new Date(2026, 2, 29, 12)],
    ['autumn back (25 h)', new Date(2026, 9, 25, 12)],
  ])('%s stays ordered', (_label, day) => {
    const times = computePrayerTimes(STOCKHOLM, day, settings());
    const night = computeNightTimes(times);
    expect(times.maghrib.getTime()).toBeLessThan(night.middleOfNight!.getTime());
    expect(night.middleOfNight!.getTime()).toBeLessThan(night.lastThird!.getTime());
  });

  it('anchors the night to the day it BEGINS, across the 25-hour day', () => {
    // The last third belongs to the night that starts on the 25th, so it must fall inside
    // [maghrib(25th), fajr(26th)] — a naive +24 h step would land it in the wrong day.
    const dayStart = startOfStockholmDay(new Date(2026, 9, 25, 12).getTime());
    const times = computePrayerTimes(STOCKHOLM, stockholmPrayerDate(dayStart), settings());
    const night = computeNightTimes(times);
    const nextStart = addStockholmDays(dayStart, 1);
    const nextFajr = computePrayerTimes(STOCKHOLM, stockholmPrayerDate(nextStart), settings()).fajr;
    expect(night.lastThird!.getTime()).toBeGreaterThan(times.maghrib.getTime());
    expect(night.lastThird!.getTime()).toBeLessThan(nextFajr.getTime());
  });
});

describe('the night tables', () => {
  it('names every key on every surface', () => {
    for (const key of NIGHT_ORDER) {
      expect(NIGHT_LABELS[key]).toBeTruthy();
      expect(NIGHT_SWEDISH_NAMES[key]).toBeTruthy();
      expect(NIGHT_ICONS[key]).toBeTruthy();
    }
  });

  // ʿIshāʾ already renders `weather-night`, a crescent. If a night row took another
  // crescent the dock would stack two near-identical glyphs and the pair would stop
  // reading as "the night's own landmarks".
  it('does not reuse a prayer glyph', () => {
    expect(NIGHT_ICONS.middleOfNight).not.toBe(NIGHT_ICONS.lastThird);
    expect(Object.values(NIGHT_ICONS)).not.toContain('weather-night');
  });

  // THE ICONS THIS REPLACED. A lunar pair (moon-full + moon-waning-crescent) reads as a
  // MONTH passing, not a night: the two phases are a fortnight apart and can never both
  // describe the night being listed. The dock renders the Hijri date directly above these
  // rows, so the contradiction is on screen. These are fractions of a duration, so the
  // glyphs depict a filling circle — true every night of the year.
  it('depicts elapsed proportion, never a lunar phase', () => {
    for (const key of NIGHT_ORDER) {
      expect(NIGHT_ICONS[key]).not.toMatch(/moon|crescent/);
      expect(NIGHT_ICONS[key]).toMatch(/^circle-/);
    }
  });
});

describe('naming the night', () => {
  beforeEach(() => resetNightFormattersForTests());

  // Swedish names a night by the morning it leads into, which is the whole point: these
  // times straddle midnight under a card headed with the EVENING's date.
  it('names the night by the morning it leads into', () => {
    // Sunday 16 Aug 2026 → the night leading into Monday.
    const dayStart = startOfStockholmDay(new Date(2026, 7, 16, 12).getTime());
    expect(nightCaption(dayStart)).toBe('Natten mot måndag');
  });

  // The caption steps a Stockholm day, which is 23, 24 or 25 hours long. A naive
  // `+ 86_400_000` lands on the SAME date on the 25-hour day — once a year, silently.
  it.each([
    ['spring forward (23 h)', new Date(2026, 2, 28, 12), 'Natten mot söndag'],
    ['autumn back (25 h)', new Date(2026, 9, 24, 12), 'Natten mot söndag'],
  ])('steps a real Stockholm day: %s', (_label, day, expected) => {
    expect(nightCaption(startOfStockholmDay(day.getTime()))).toBe(expected);
  });

  it('marks only the landmarks that land on the morning side of midnight', () => {
    const dayStart = startOfStockholmDay(new Date(2026, 7, 16, 12).getTime());
    const evening = new Date(2026, 7, 16, 22, 41);
    const morning = new Date(2026, 7, 17, 1, 6);
    expect(crossedMidnightLabel(evening, dayStart)).toBeUndefined();
    expect(crossedMidnightLabel(morning, dayStart)).toBe('mån');
  });

  // The dock re-renders this caption on every clock tick (every 30 s in live mode), so the
  // formatter is built once and memoised — the same reason hijri.ts and prayer-times.ts
  // cache theirs. Constructing an Intl.DateTimeFormat per tick was pure waste.
  it('builds each formatter once, however often it is asked', () => {
    const RealFmt = Intl.DateTimeFormat;
    let constructed = 0;
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      value: function (...args: unknown[]) {
        constructed++;
        return new (RealFmt as unknown as new (...a: unknown[]) => Intl.DateTimeFormat)(...args);
      },
    });
    try {
      resetNightFormattersForTests();
      const dayStart = startOfStockholmDay(new Date(2026, 7, 16, 12).getTime());
      const morning = new Date(2026, 7, 17, 1, 6);
      for (let i = 0; i < 5; i++) {
        nightCaption(dayStart);
        crossedMidnightLabel(morning, dayStart);
      }
      // One 'long' for the caption, one 'short' for the row marker. Not ten.
      expect(constructed).toBe(2);
    } finally {
      Object.defineProperty(Intl, 'DateTimeFormat', { configurable: true, value: RealFmt });
      resetNightFormattersForTests();
    }
  });

  // Hermes can ship without full ICU (the reason prayer-times.ts carries fallbackFormat at
  // all). A weekday is not worth guessing: naming the WRONG morning is worse than naming
  // none, so the caption degrades to a bare "Natten" and the row drops its marker rather
  // than inventing one.
  describe('on a runtime without full Intl data', () => {
    const RealFmt = Intl.DateTimeFormat;
    afterEach(() => {
      Object.defineProperty(Intl, 'DateTimeFormat', { configurable: true, value: RealFmt });
      resetNightFormattersForTests();
    });

    it('degrades to an unqualified caption rather than a wrong weekday', () => {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        value: () => {
          throw new Error('no ICU');
        },
      });
      resetNightFormattersForTests();
      const dayStart = startOfStockholmDay(new Date(2026, 7, 16, 12).getTime());
      expect(nightCaption(dayStart)).toBe('Natten');
      expect(crossedMidnightLabel(new Date(2026, 7, 17, 1, 6), dayStart)).toBeUndefined();
    });

    // A constructor that builds but throws at format() time is the other half of the same
    // failure, and it must not take the dock down with it.
    it('survives a formatter that throws while formatting', () => {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        configurable: true,
        value: function () {
          return {
            format: () => {
              throw new Error('boom');
            },
          };
        },
      });
      resetNightFormattersForTests();
      const dayStart = startOfStockholmDay(new Date(2026, 7, 16, 12).getTime());
      expect(nightCaption(dayStart)).toBe('Natten');
      expect(crossedMidnightLabel(new Date(2026, 7, 17, 1, 6), dayStart)).toBeUndefined();
    });
  });
});
