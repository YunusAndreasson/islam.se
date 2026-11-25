import { describe, expect, it } from '@jest/globals';

import { getPlaces, namedPlace } from '@/lib/places/nearest';
import { formatHijri } from '@/lib/hijri';
import {
  computePrayerTimes, selectNextPrayer,
  formatTime,
  type LatLng,
  PRAYER_LABELS,
  PRAYER_SWEDISH_NAMES,
} from '@/lib/prayer-times';
import { DEFAULT_SETTINGS, type PrayerSettings } from '@/lib/settings/types';
import { addZoneDays, startOfZoneDay, zonePrayerDate } from '@/lib/zone-time';
import { oracleTimes } from '@/test-utils/prayer-oracle';
import { buildPayloadAt, widgetSolarDay } from './payload';

const STOCKHOLM: LatLng = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA: LatLng = { latitude: 67.8558, longitude: 20.2253 };
// A spring day where every Stockholm prayer is computable — a stable reference.
const SPRING_DAY = new Date(2026, 2, 20); // 20 Mar 2026
const SPRING_DAY_NEXT = new Date(2026, 2, 21);
// Midnight sun: north of the Arctic Circle in midsummer the sun never sets, so under
// the 'unresolved' polar rule sunrise/sunset/Fajr/Isha are Invalid Dates.
const MIDSUMMER = new Date(2026, 5, 21); // 21 Jun 2026

function settings(overrides: Partial<PrayerSettings> = {}): PrayerSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('buildPayloadAt — next prayer & schedule', () => {
  // Independent reference: adhan invoked directly with DEFAULT_SETTINGS' parameters,
  // never through the code under test (see prayer-oracle.ts).
  const ref = oracleTimes(STOCKHOLM, SPRING_DAY);

  it('counts down to a previous day’s prayer that still lies ahead after midnight', () => {
    const coords = { latitude: 67.86, longitude: 20.23 };
    const now = Date.parse('2026-06-02T00:01:00+02:00');
    const payload = buildPayloadAt(coords, settings(), now, 'Kiruna');

    expect(payload.previousDayNextKey).toBe('maghrib');
    expect(payload.nextTime).toBe('00:15');
    expect(payload.rows.some((row) => row.isNext)).toBe(false);
    expect(payload.nextIsTomorrow).toBe(false);
  });

  it('before Fajr, counts down to Fajr and lists the whole day', () => {
    const now = ref.fajr.getTime() - 60_000;
    const p = buildPayloadAt(STOCKHOLM, settings(), now, 'Göteborg');

    expect(p.location).toBe('Göteborg');
    expect(p.nextArabic).toBe(PRAYER_LABELS.fajr);
    expect(p.nextSwedish).toBe(PRAYER_SWEDISH_NAMES.fajr);
    // Displayed time matches the independent oracle, not the app's own re-render.
    expect(p.nextTime).toBe(formatTime(ref.fajr));
    expect(p.nextAtMs).toBe(ref.fajr.getTime());
    expect(p.nextIsTomorrow).toBe(false);

    // Six chronological rows incl. the sunrise marker, each time matching the oracle.
    expect(p.rows.map((r) => r.key)).toEqual(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);
    for (const row of p.rows) expect(row.time).toBe(formatTime(ref[row.key]));
    expect(p.rows.find((r) => r.key === 'sunrise')?.isMarker).toBe(true);
    // Exactly one row is the "next" highlight, and it's Fajr.
    expect(p.rows.filter((r) => r.isNext).map((r) => r.key)).toEqual(['fajr']);
  });

  it('mid-afternoon, the next prayer is ʿAṣr', () => {
    const now = ref.dhuhr.getTime() + 60_000; // just after Ẓuhr
    const p = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    expect(p.nextArabic).toBe(PRAYER_LABELS.asr);
    expect(p.nextTime).toBe(formatTime(ref.asr));
    expect(p.rows.filter((r) => r.isNext).map((r) => r.key)).toEqual(['asr']);
  });

  // The widget used to label the end of Fajr as the next prayer.
  it('after Fajr, highlights Ẓuhr and keeps sunrise on the timetable', () => {
    const now = ref.fajr.getTime() + 60_000;
    const p = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    const next = p.rows.find((r) => r.isNext);

    expect(p.nextArabic).toBe(PRAYER_LABELS.dhuhr);
    expect(p.nextSwedish).toBe(PRAYER_SWEDISH_NAMES.dhuhr);
    expect(p.nextTime).toBe(formatTime(ref.dhuhr));
    expect(next?.key).toBe('dhuhr');
    expect(p.rows.find(r => r.key === 'sunrise')).toMatchObject({ isMarker: true, isNext: false });
  });

  it('ends the Fajr highlight at sunrise and reserves it for obligatory prayers', () => {
    const sunrise = ref.sunrise.getTime();
    expect(buildPayloadAt(STOCKHOLM, settings(), sunrise - 1, 'Stockholm')
      .rows.find(row => row.isCurrent)?.key).toBe('fajr');
    expect(buildPayloadAt(STOCKHOLM, settings(), sunrise, 'Stockholm')
      .rows.some(row => row.isCurrent)).toBe(false);
  });

  it('after Isha, rolls over to tomorrow’s Fajr and stops highlighting today', () => {
    const now = ref.isha.getTime() + 60_000;
    const tomorrow = oracleTimes(STOCKHOLM, SPRING_DAY_NEXT);
    const p = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');

    expect(p.nextIsTomorrow).toBe(true);
    expect(p.nextArabic).toBe(PRAYER_LABELS.fajr);
    expect(p.nextTime).toBe(formatTime(tomorrow.fajr));
    expect(p.nextAtMs).toBe(tomorrow.fajr.getTime());
    // Nothing today is "next" once we've rolled past Isha.
    expect(p.rows.some((r) => r.isNext)).toBe(false);
  });

  it('refuses a next-day Fajr that falls BEFORE the instant it would count down from', () => {
    // `nextAtMs` drives a live relative countdown in the widget and the Live Activity, so an
    // instant in the past does not merely read oddly — it counts UPWARDS until the next
    // timeline entry replaces it. And "tomorrow's Fajr" is not automatically ahead: under the
    // middle-of-the-night rule far north, Fajr sits at the middle of the night, which around
    // the equinox lands just before midnight. At Treriksröset the Fajr belonging to 28 March
    // falls at 23:59 on the 27th. This path had its own copy of the rollover and so was left
    // behind when the map dock's copy learned to range-check; it now shares selectNextPrayer.
    const TRERIKSROSET: LatLng = { latitude: 69.0601, longitude: 20.5486 };
    const s = settings({ highLatitudeRule: 'middleOfTheNight' });
    const nextFajr = computePrayerTimes(TRERIKSROSET, new Date(2026, 2, 28), s).fajr.getTime();
    const now = new Date(2026, 2, 28, 0, 0, 0).getTime();
    // Guard the guard: if adhan stops placing it before midnight this asserts nothing.
    expect(nextFajr).toBeLessThan(now);

    const p = buildPayloadAt(TRERIKSROSET, s, now, 'Treriksröset');
    expect(p.nextAtMs).not.toBe(nextFajr);
    if (p.nextAtMs !== null) expect(p.nextAtMs).toBeGreaterThanOrEqual(now);
  });

  it('threads the Hijri offset into the displayed date', () => {
    const now = ref.dhuhr.getTime();
    const base = buildPayloadAt(STOCKHOLM, settings({ hijriOffset: 0 }), now, 'Stockholm');
    const shifted = buildPayloadAt(STOCKHOLM, settings({ hijriOffset: 1 }), now, 'Stockholm');
    // The Hijri label is derived from the STOCKHOLM calendar day (zonePrayerDate),
    // not the device-local day of the raw instant — formatHijri reads local date fields,
    // so passing `new Date(now)` made the Hijri line follow the phone's time zone while
    // the Gregorian line stayed pinned to Stockholm; the two could disagree by a day on
    // a travelling device.
    expect(base.hijri).toBe(formatHijri(zonePrayerDate(now), 0));
    // A non-zero offset must actually move the rendered Hijri date.
    expect(shifted.hijri).not.toBe(base.hijri);
  });
});

it('samples a 23-hour solar day across Swedish daylight saving time', () => {
  const at = Date.parse('2026-03-29T10:00:00Z');
  const start = startOfZoneDay(at);
  const solar = widgetSolarDay(STOCKHOLM, start);
  expect(solar.endMs).toBe(addZoneDays(start, 1));
  expect(solar.endMs - start).toBe(23 * 3_600_000);
  expect(solar.altitudes).toHaveLength(25);
  expect(solar.altitudes[0]).toBeLessThan(0);
  expect(Math.max(...solar.altitudes)).toBeGreaterThan(30);
  expect(buildPayloadAt(STOCKHOLM, settings(), at, 'Stockholm').solar?.progress)
    .toBeCloseTo((at - start) / (solar.endMs - start));
});

describe('buildPayloadAt — polar edge (midnight sun, unresolved)', () => {
  it('renders unresolved slots as "—" and never invents a next prayer', () => {
    // Pick an instant after the last computable slot (ʿAṣr) so today's finite slots
    // are all past; with 'unresolved' there is no Isha and no tomorrow Fajr either.
    const polar = settings({ polarCircleResolution: 'unresolved' });
    const today = computePrayerTimes(KIRUNA, MIDSUMMER, polar);
    expect(Number.isNaN(today.fajr.getTime())).toBe(true); // sanity: midnight sun
    const now = today.asr.getTime() + 60_000;

    const p = buildPayloadAt(KIRUNA, polar, now, 'Kiruna');

    // The unresolvable slots show the honest em dash, not a fabricated time.
    expect(p.rows.find((r) => r.key === 'fajr')?.time).toBe('–');
    expect(p.rows.find((r) => r.key === 'isha')?.time).toBe('–');
    // No next prayer can be resolved (Isha gone, tomorrow's Fajr also undefined).
    expect(p.nextArabic).toBe('');
    expect(p.nextTime).toBe('–');
    expect(p.nextAtMs).toBeNull();
    expect(p.nextIsTomorrow).toBe(false);
  });
});

// A next-prayer search limited to today's schedule missed an adjusted Fajr before midnight.
it('agrees with the map at Kiruna just before the next prayer date’s Fajr', () => {
  const at = Date.parse('2026-06-12T23:57:00+02:00');
  const city = namedPlace(getPlaces().find(p => p.name === 'Kiruna')!);
  const prefs = settings({ adjustments: { ...DEFAULT_SETTINGS.adjustments, fajr: -60, isha: 60 } });
  const day = (offset: number) => computePrayerTimes(city, zonePrayerDate(at, offset), prefs);
  const next = selectNextPrayer(day(0), day(1), at, day(-1));
  expect(next?.key).toBe('fajr');
  expect(buildPayloadAt(city, prefs, at, 'Kiruna')).toMatchObject({ nextAtMs: next?.at, nextTime: '23:58', nextIsTomorrow: false, nextDayKey: 'fajr' });
});
