import { describe, expect, it } from '@jest/globals';

import { formatGregorian } from '@/lib/hijri';
import { type LatLng, PRAYER_LABELS } from '@/lib/prayer-times';
import { DEFAULT_SETTINGS, type PrayerSettings } from '@/lib/settings/types';
import { startOfStockholmDay } from '@/lib/stockholm-time';
import { oracleTimes } from '@/test-utils/prayer-oracle';
import { buildTimeline, MAX_ENTRIES, SPAN_DAYS, SPAN_MS } from './timeline';
import { at, first, last } from '@/test-utils/at';

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

  it('starts at now and is sorted ascending within the span', () => {
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
    expect(first(entries, 'entries').date.getTime()).toBe(now);
    for (let i = 1; i < entries.length; i++) {
      expect(at(entries, i, 'entries').date.getTime()).toBeGreaterThan(
        at(entries, i - 1, 'entries').date.getTime(),
      );
      expect(at(entries, i, 'entries').date.getTime()).toBeLessThanOrEqual(now + SPAN_MS);
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
    expect(first(entries, 'entries').props.nextArabic).toBe(PRAYER_LABELS.fajr);
    expect(first(entries, 'entries').props.nextIsTomorrow).toBe(false);
  });

  it('the post-Isha boundary rolls the widget over to tomorrow', () => {
    const atIsha = entries.find((e) => e.date.getTime() === ref.isha.getTime() + 1000);
    expect(atIsha).toBeDefined();
    expect(atIsha?.props.nextIsTomorrow).toBe(true);
    expect(atIsha?.props.nextArabic).toBe(PRAYER_LABELS.fajr);
  });

  it('rebuilds the payload at every midnight, not just at prayers', () => {
    // THE BUG THIS PINS: the only entry covering 00:00 → Fajr used to be the one built
    // just after YESTERDAY's Isha, and a WidgetKit entry is frozen data. So for the
    // three-odd hours after midnight the medium widget listed yesterday's schedule
    // under yesterday's Gregorian/Hijri footer, and the hero still said "I MORGON"
    // about a Fajr that had become today's.
    const midnight = startOfStockholmDay(now) + 24 * 60 * 60 * 1000;
    const entry = entries.find((e) => e.date.getTime() > midnight && e.date.getTime() < midnight + 60_000);
    expect(entry).toBeDefined();
    // Its date line is the NEW day, and Fajr is today's — not tomorrow's.
    expect(entry?.props.gregorian).toBe(formatGregorian(new Date(entry!.date.getTime())));
    expect(entry?.props.nextIsTomorrow).toBe(false);
    expect(entry?.props.nextArabic).toBe(PRAYER_LABELS.fajr);
    // And the schedule column is the new day's: its Fajr row matches the hero.
    expect(entry?.props.rows.find((r) => r.key === 'fajr')?.time).toBe(entry?.props.nextTime);
  });

  it('covers the full span so an unopened app cannot strand a stale widget', () => {
    // expo-widgets' provider uses .atEnd: past the last entry WidgetKit asks for a new
    // timeline and gets the same stored one back, because only the app can produce a
    // fresh one. A short horizon therefore froze the widget on an already-passed prayer
    // after a day and a half away. Assert the last entry really reaches near the span.
    const lastAt = last(entries, 'entries').date.getTime();
    expect(SPAN_DAYS).toBeGreaterThanOrEqual(3);
    expect(lastAt).toBeGreaterThan(now + SPAN_MS - 24 * 60 * 60 * 1000);
    // Every day in the span contributes its midnight + prayers, and it still fits.
    expect(entries.length).toBeGreaterThanOrEqual(SPAN_DAYS * 6);
    expect(entries.length).toBeLessThanOrEqual(MAX_ENTRIES);
  });

  it('stays small enough for the shared store the extension parses', () => {
    // The whole timeline is written to the app group's UserDefaults and re-read by the
    // WidgetKit extension, which runs under a hard ~30 MB memory limit and parses this
    // on every render. Five days of entries measures ~32 KB, so this ceiling is three
    // orders of magnitude of headroom — it exists to catch a payload that grows a
    // per-entry field (a mosque list, a forecast) without anyone noticing the multiplier.
    expect(JSON.stringify(entries).length).toBeLessThan(256 * 1024);
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
    expect(first(fromMidday, 'fromMidday entries').date.getTime()).toBe(midday);
    expect(fromMidday.every((e) => e.date.getTime() >= midday)).toBe(true);
    // No entry corresponds to a prayer that already happened this morning.
    expect(fromMidday.some((e) => e.date.getTime() === ref.fajr.getTime() + 1000)).toBe(false);
  });

  it('defaults `now` to the current time when omitted', () => {
    // The production callers (WidgetSync) omit `now`; exercise that default path.
    // Stockholm is below the Arctic Circle, so today's prayers are always computable.
    const live = buildTimeline(STOCKHOLM, settings(), 'Stockholm');
    expect(live.length).toBeGreaterThanOrEqual(2);
    expect(first(live, 'live entries').props.location).toBe('Stockholm');
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
