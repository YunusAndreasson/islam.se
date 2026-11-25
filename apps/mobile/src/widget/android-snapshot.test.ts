// The Android widget's snapshot and the entry it shows at a given instant.
//
// The native provider schedules a redraw at the entry boundary. The snapshot must
// already select the following prayer at that exact instant.
import { describe, expect, it } from '@jest/globals';

import { type LatLng, PRAYER_LABELS } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS, type PrayerSettings } from '@/lib/settings/types';
import { at, first } from '@/test-utils/at';
import { oracleTimes } from '@/test-utils/prayer-oracle';
import { buildAndroidSnapshot, selectEntry } from './android-snapshot';
import { SPAN_MS } from './timeline';

const STOCKHOLM: LatLng = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA: LatLng = { latitude: 67.8558, longitude: 20.2253 };
const SPRING_DAY = new Date(2026, 2, 20);
const ref = oracleTimes(STOCKHOLM, SPRING_DAY);

function settings(overrides: Partial<PrayerSettings> = {}): PrayerSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

/** What the widget would name as next if it rendered at `t`. */
function nextAt(snapshot: ReturnType<typeof buildAndroidSnapshot>, t: number): string | undefined {
  return selectEntry(snapshot, t)?.payload.nextArabic;
}

describe('buildAndroidSnapshot', () => {
  const now = ref.dhuhr.getTime() - 30 * 60 * 1000;
  const snapshot = buildAndroidSnapshot(STOCKHOLM, settings(), 'Stockholm', now);

  it('starts at the moment it was built and runs for the timeline horizon', () => {
    expect(first(snapshot.entries, 'entries').fromMs).toBe(now);
    for (let i = 1; i < snapshot.entries.length; i++) {
      expect(at(snapshot.entries, i, 'entries').fromMs).toBeGreaterThan(
        at(snapshot.entries, i - 1, 'entries').fromMs,
      );
    }
    expect(snapshot.validUntilMs).toBe(now + SPAN_MS);
  });

  it('moves "next" on as each prayer passes, without the app running', () => {
    expect(nextAt(snapshot, now)).toBe(PRAYER_LABELS.dhuhr);
    expect(nextAt(snapshot, ref.dhuhr.getTime() - 1)).toBe(PRAYER_LABELS.dhuhr);
    expect(nextAt(snapshot, ref.dhuhr.getTime())).toBe(PRAYER_LABELS.asr);
    expect(nextAt(snapshot, ref.asr.getTime())).toBe(PRAYER_LABELS.maghrib);
  });

  it('turns to tomorrow\'s Fajr after ʿIshāʾ, and says so', () => {
    const entry = selectEntry(snapshot, ref.isha.getTime() + 60_000);
    expect(entry?.payload.nextArabic).toBe(PRAYER_LABELS.fajr);
    expect(entry?.payload.nextIsTomorrow).toBe(true);
  });

  it('shows the new day\'s schedule from midnight, not from the next prayer', () => {
    const tomorrow = oracleTimes(STOCKHOLM, new Date(2026, 2, 21));
    const afterMidnight = tomorrow.fajr.getTime() - 60 * 60 * 1000;
    const entry = selectEntry(snapshot, afterMidnight);
    const fajrRow = entry?.payload.rows.find((row) => row.key === 'fajr');
    expect(entry?.payload.nextIsTomorrow).toBe(false);
    expect(fajrRow?.isNext).toBe(true);
  });

  it('uses tomorrow’s Ẓuhr if Fajr and sunrise cannot be resolved', () => {
    const midsummerNight = new Date(2026, 5, 21, 23, 30).getTime();
    const polar = buildAndroidSnapshot(
      KIRUNA,
      settings({ polarCircleResolution: 'unresolved' }),
      'Kiruna',
      midsummerNight,
    );
    expect(selectEntry(polar, midsummerNight)?.payload).toMatchObject({
      nextArabic: PRAYER_LABELS.dhuhr,
      nextIsTomorrow: true,
    });
  });
});

describe('selectEntry', () => {
  const now = ref.asr.getTime() - 60 * 60 * 1000;
  const snapshot = buildAndroidSnapshot(STOCKHOLM, settings(), 'Stockholm', now);

  it('shows nothing past the horizon — a placeholder beats a stale prayer', () => {
    expect(selectEntry(snapshot, snapshot.validUntilMs)).toBeNull();
    expect(selectEntry(snapshot, snapshot.validUntilMs - 1)).not.toBeNull();
  });

  it('shows nothing for an empty snapshot', () => {
    expect(selectEntry({ entries: [], validUntilMs: Number.MAX_SAFE_INTEGER }, now)).toBeNull();
  });

  it('ignores a future snapshot after the clock is set back', () => {
    expect(selectEntry(snapshot, now - 60_000)).toBeNull();
  });
});
