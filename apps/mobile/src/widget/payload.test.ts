import { describe, expect, it } from '@jest/globals';

import { formatHijri } from '../lib/hijri';
import {
  computePrayerTimes,
  formatTime,
  type LatLng,
  PRAYER_LABELS,
  PRAYER_SWEDISH_NAMES,
} from '../lib/prayer-times';
import { DEFAULT_SETTINGS, type PrayerSettings } from '../lib/settings/types';
import { stockholmPrayerDate } from '../lib/stockholm-time';
import { oracleTimes } from '../test-utils/prayer-oracle';
import { buildPayloadAt } from './payload';

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

  it('after Fajr, the next event can be sunrise and remains marked as a time marker', () => {
    const now = ref.fajr.getTime() + 60_000;
    const p = buildPayloadAt(STOCKHOLM, settings(), now, 'Stockholm');
    const next = p.rows.find((r) => r.isNext);

    expect(p.nextArabic).toBe(PRAYER_LABELS.sunrise);
    expect(p.nextSwedish).toBe(PRAYER_SWEDISH_NAMES.sunrise);
    expect(p.nextTime).toBe(formatTime(ref.sunrise));
    expect(next?.key).toBe('sunrise');
    expect(next?.isMarker).toBe(true);
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

  it('threads the Hijri offset into the displayed date', () => {
    const now = ref.dhuhr.getTime();
    const base = buildPayloadAt(STOCKHOLM, settings({ hijriOffset: 0 }), now, 'Stockholm');
    const shifted = buildPayloadAt(STOCKHOLM, settings({ hijriOffset: 1 }), now, 'Stockholm');
    // The Hijri label is derived from the STOCKHOLM calendar day (stockholmPrayerDate),
    // not the device-local day of the raw instant — formatHijri reads local date fields,
    // so passing `new Date(now)` made the Hijri line follow the phone's time zone while
    // the Gregorian line stayed pinned to Stockholm; the two could disagree by a day on
    // a travelling device.
    expect(base.hijri).toBe(formatHijri(stockholmPrayerDate(now), 0));
    // A non-zero offset must actually move the rendered Hijri date.
    expect(shifted.hijri).not.toBe(base.hijri);
  });
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
    expect(p.rows.find((r) => r.key === 'fajr')?.time).toBe('—');
    expect(p.rows.find((r) => r.key === 'isha')?.time).toBe('—');
    // No next prayer can be resolved (Isha gone, tomorrow's Fajr also undefined).
    expect(p.nextArabic).toBe('');
    expect(p.nextTime).toBe('—');
    expect(p.nextAtMs).toBeNull();
    expect(p.nextIsTomorrow).toBe(false);
  });
});
