import { describe, expect, it } from '@jest/globals';

import { type LatLng, PRAYER_LABELS } from '../lib/prayer-times';
import { DEFAULT_SETTINGS, type PrayerSettings } from '../lib/settings/types';
import { oracleTimes } from '../test-utils/prayer-oracle';
import { buildTimeline, MAX_ENTRIES, SPAN_MS } from './timeline';

const STOCKHOLM: LatLng = { latitude: 59.3293, longitude: 18.0686 };
const KIRUNA: LatLng = { latitude: 67.8558, longitude: 20.2253 };
const SPRING_DAY = new Date(2026, 2, 20); // 20 Mar 2026

function settings(overrides: Partial<PrayerSettings> = {}): PrayerSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('buildTimeline', () => {
  // Independent reference times for the day (adhan invoked directly).
  const ref = oracleTimes(STOCKHOLM, SPRING_DAY);
  // Anchor "now" an hour before Fajr so all six of today's prayers are still upcoming.
  const now = ref.fajr.getTime() - 60 * 60 * 1000;
  const entries = buildTimeline(STOCKHOLM, settings(), 'Stockholm', now);

  it('starts at now and is sorted ascending within the 36 h window', () => {
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
    expect(entries[0].date.getTime()).toBe(now);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].date.getTime()).toBeGreaterThan(entries[i - 1].date.getTime());
      expect(entries[i].date.getTime()).toBeLessThanOrEqual(now + SPAN_MS);
    }
  });

  it('places a boundary one second after each prayer, flipping "next" forward', () => {
    // At (Ẓuhr + 1 s) the widget should already be pointing at ʿAṣr, not Ẓuhr — this
    // is the off-by-one the +1 s epsilon exists to prevent.
    const atDhuhr = entries.find((e) => e.date.getTime() === ref.dhuhr.getTime() + 1000);
    expect(atDhuhr).toBeDefined();
    expect(atDhuhr?.props.nextArabic).toBe(PRAYER_LABELS.asr);
  });

  it('the first entry points at the imminent prayer (Fajr)', () => {
    expect(entries[0].props.nextArabic).toBe(PRAYER_LABELS.fajr);
    expect(entries[0].props.nextIsTomorrow).toBe(false);
  });

  it('the post-Isha boundary rolls the widget over to tomorrow', () => {
    const atIsha = entries.find((e) => e.date.getTime() === ref.isha.getTime() + 1000);
    expect(atIsha).toBeDefined();
    expect(atIsha?.props.nextIsTomorrow).toBe(true);
    expect(atIsha?.props.nextArabic).toBe(PRAYER_LABELS.fajr);
  });

  it('is deterministic for a fixed (coords, settings, label, now)', () => {
    // WidgetKit re-pushes happen on every foreground; an unstable timeline would
    // thrash the widget. Same inputs must produce byte-identical entries.
    const again = buildTimeline(STOCKHOLM, settings(), 'Stockholm', now);
    expect(again).toEqual(entries);
  });

  it('only schedules boundaries that are still in the future', () => {
    // From midday, this morning's Fajr/sunrise are already past — their boundaries
    // must be dropped, so the first real boundary after `now` is Ẓuhr+1s.
    const midday = ref.dhuhr.getTime() - 30 * 60 * 1000; // 30 min before Ẓuhr
    const fromMidday = buildTimeline(STOCKHOLM, settings(), 'Stockholm', midday);
    expect(fromMidday[0].date.getTime()).toBe(midday);
    expect(fromMidday.every((e) => e.date.getTime() >= midday)).toBe(true);
    // No entry corresponds to a prayer that already happened this morning.
    expect(fromMidday.some((e) => e.date.getTime() === ref.fajr.getTime() + 1000)).toBe(false);
  });

  it('defaults `now` to the current time when omitted', () => {
    // The production callers (WidgetSync) omit `now`; exercise that default path.
    // Stockholm is below the Arctic Circle, so today's prayers are always computable.
    const live = buildTimeline(STOCKHOLM, settings(), 'Stockholm');
    expect(live.length).toBeGreaterThanOrEqual(2);
    expect(live[0].props.location).toBe('Stockholm');
  });

  it('skips unresolved polar slots instead of scheduling Invalid Dates', () => {
    // Midnight sun at Kiruna with the 'unresolved' rule: sunrise/sunset/Fajr/Isha are
    // Invalid Dates and must never become timeline boundaries (a NaN date would crash
    // WidgetKit). The timeline still holds at least the `now` entry plus Ẓuhr/ʿAṣr.
    const polar = settings({ polarCircleResolution: 'unresolved' });
    const midsummerNow = new Date(2026, 5, 21, 6, 0, 0).getTime();
    const polarEntries = buildTimeline(KIRUNA, polar, 'Kiruna', midsummerNow);
    expect(polarEntries.length).toBeGreaterThanOrEqual(1);
    expect(polarEntries.every((e) => Number.isFinite(e.date.getTime()))).toBe(true);
  });
});
