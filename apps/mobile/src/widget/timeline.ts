// Turns a day of prayer times into a WidgetKit timeline. The iOS widget is NOT a
// live JS process — instead the app hands WidgetKit a list of dated entries and the
// system renders each at its scheduled instant, advancing the "next prayer" with no
// background execution. So we emit one entry at `now`, one just after each upcoming
// prayer, and one just after each midnight; the entry at (prayerₙ + 1 s) naturally
// shows prayerₙ₊₁ as next. See ./payload.ts for the per-entry data model.
import type { PrayerTimes } from 'adhan';
import type { LatLng } from '@/lib/prayer-times';
import { computePrayerTimes, PRAYER_ORDER } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import { addStockholmDays, startOfStockholmDay, stockholmPrayerDate } from '@/lib/stockholm-time';
import { buildPayloadAt, type WidgetPayload } from './payload';

/** A WidgetKit timeline entry — matches expo-widgets' WidgetTimelineEntry shape. */
export interface WidgetTimelineEntry {
  date: Date;
  props: WidgetPayload;
}

/** How many days of boundaries to emit. The provider's reload policy is `.atEnd`
 *  (expo-widgets' WidgetsTimelineProvider), so once the LAST entry's date passes,
 *  WidgetKit asks for a new timeline — and gets the same stored one back, because
 *  only the app can produce a fresh one and the app may not have been opened. At the
 *  old 36 h that left the widget frozen on a stale "next prayer" after a day and a
 *  half away, while `.atEnd` re-requested against the (budgeted) background reload
 *  allowance. Five days covers a working week away from the app; the cost is ~36
 *  small entries in the shared UserDefaults instead of ~13. It still self-heals on
 *  the next foreground, which re-pushes from `now`. */
const SPAN_DAYS = 5;
const SPAN_MS = SPAN_DAYS * 24 * 60 * 60 * 1000;
/** Land each boundary 1 s AFTER the event so an at-or-after "next" query returns the
 *  following prayer — i.e. when Ẓuhr arrives the widget flips to ʿAṣr, not Ẓuhr. The
 *  same epsilon puts the midnight entry inside the new day rather than on its edge. */
const BOUNDARY_EPSILON_MS = 1000;
/** Ceiling on entries: 7 boundaries/day (6 slots + midnight) × SPAN_DAYS + the `now`
 *  entry = 36, so this is headroom, not a truncation the widget would silently hit. */
const MAX_ENTRIES = 48;

/**
 * Build the timeline of {@link WidgetTimelineEntry} for `coords`/`settings`, starting
 * at `now`. `location` is the resolved label shared by every entry. Deterministic for
 * a fixed (coords, settings, location, now) — the prayer maths and Europe/Stockholm
 * formatting carry no hidden clock — so it unit-tests cleanly.
 */
export function buildTimeline(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
): WidgetTimelineEntry[] {
  // Memoise prayer-times by Stockholm calendar day (the prayerDate's local y/m/d).
  // The boundary scan below touches days 0–SPAN_DAYS, and buildPayloadAt re-derives its
  // own day (+ tomorrow on rollover) for each of the ~36 entries — without this the
  // same day's adhan computation ran once PER ENTRY. Shared across the scan and every
  // entry, so the whole build does one computation per calendar day it touches.
  const byDay = new Map<string, PrayerTimes>();
  const resolveDay = (prayerDate: Date): PrayerTimes => {
    const key = `${prayerDate.getFullYear()}-${prayerDate.getMonth()}-${prayerDate.getDate()}`;
    let times = byDay.get(key);
    if (!times) {
      times = computePrayerTimes(coords, prayerDate, settings);
      byDay.set(key, times);
    }
    return times;
  };

  // The current moment is always the first entry, then a boundary just after every
  // prayer and every midnight in the window. A Set dedupes the rare collision (two
  // slots within 1 s).
  const boundaries = new Set<number>([now]);
  const horizon = now + SPAN_MS;
  const add = (at: number): void => {
    const boundary = at + BOUNDARY_EPSILON_MS;
    if (boundary > now && boundary <= horizon) boundaries.add(boundary);
  };

  // Every calendar day the span touches. Day SPAN_DAYS is the last one that can still
  // contribute (its slots before `now`'s time-of-day fall inside the horizon), and its
  // post-Isha boundary is the rollover entry that points at the following Fajr.
  for (let dayOffset = 0; dayOffset <= SPAN_DAYS; dayOffset++) {
    const times = resolveDay(stockholmPrayerDate(now, dayOffset));
    for (const key of PRAYER_ORDER) {
      const t = times[key].getTime();
      if (!Number.isFinite(t)) continue; // skip polar-unresolved slots
      add(t);
    }
  }

  // Midnight matters as much as any prayer: between 00:00 and Fajr the only entry
  // WidgetKit had was the one built just after YESTERDAY's Isha, so the medium
  // widget's schedule column, its Gregorian/Hijri footer and the "I MORGON" eyebrow
  // all kept showing the previous day for those three-odd hours. A Stockholm-midnight
  // boundary rebuilds the payload on the new civil day. addStockholmDays is the
  // noon-anchored step — a naive +24 h lands at 23:00 on the 25-hour autumn day.
  let dayStart = startOfStockholmDay(now);
  for (let d = 0; d < SPAN_DAYS + 1; d++) {
    dayStart = addStockholmDays(dayStart, 1);
    if (dayStart > horizon) break;
    add(dayStart);
  }

  return [...boundaries]
    .sort((a, b) => a - b)
    .slice(0, MAX_ENTRIES)
    .map((at) => ({ date: new Date(at), props: buildPayloadAt(coords, settings, at, location, resolveDay) }));
}

export { SPAN_DAYS, SPAN_MS, MAX_ENTRIES, BOUNDARY_EPSILON_MS };
