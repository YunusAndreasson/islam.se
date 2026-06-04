// Turns a day of prayer times into a WidgetKit timeline. The iOS widget is NOT a
// live JS process — instead the app hands WidgetKit a list of dated entries and the
// system renders each at its scheduled instant, advancing the "next prayer" with no
// background execution. So we emit one entry at `now` plus one just after each
// upcoming prayer for the next ~36 h; the entry at (prayerₙ + 1 s) naturally shows
// prayerₙ₊₁ as next. See ./payload.ts for the per-entry data model.
import type { PrayerTimes } from 'adhan';
import type { LatLng } from '../lib/prayer-times';
import { computePrayerTimes, PRAYER_ORDER } from '../lib/prayer-times';
import type { PrayerSettings } from '../lib/settings/types';
import { stockholmPrayerDate } from '../lib/stockholm-time';
import { buildPayloadAt, type WidgetPayload } from './payload';

/** A WidgetKit timeline entry — matches expo-widgets' WidgetTimelineEntry shape. */
export interface WidgetTimelineEntry {
  date: Date;
  props: WidgetPayload;
}

/** How far ahead to schedule. 36 h spans today + tomorrow so the widget keeps
 *  advancing for a full day even if the app is never reopened (it self-heals on the
 *  next foreground, which re-pushes a fresh timeline). */
const SPAN_MS = 36 * 60 * 60 * 1000;
/** Land each boundary 1 s AFTER the prayer so an at-or-after "next" query returns the
 *  following prayer — i.e. when Ẓuhr arrives the widget flips to ʿAṣr, not Ẓuhr. */
const BOUNDARY_EPSILON_MS = 1000;
/** WidgetKit refreshes a modest number of entries; 1 (now) + ~6×2 days is well under. */
const MAX_ENTRIES = 16;

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
  // The boundary scan below touches days 0–2, and buildPayloadAt re-derives its own
  // day (+ tomorrow on rollover) for each of the ~16 entries — without this the same
  // day's adhan computation ran 16+ times per sync instead of once. Shared across the
  // scan and every entry, so the whole build does ~4 computations total.
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
  // prayer in the window. A Set dedupes the rare collision (two slots within 1 s).
  const boundaries = new Set<number>([now]);

  // Walk today, tomorrow and the day after so the 36 h window is fully covered and
  // the post-Isha rollover boundary (→ tomorrow's Fajr) is present.
  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const times = resolveDay(stockholmPrayerDate(now, dayOffset));
    for (const key of PRAYER_ORDER) {
      const t = times[key].getTime();
      if (!Number.isFinite(t)) continue; // skip polar-unresolved slots
      const boundary = t + BOUNDARY_EPSILON_MS;
      if (boundary > now && boundary <= now + SPAN_MS) boundaries.add(boundary);
    }
  }

  return [...boundaries]
    .sort((a, b) => a - b)
    .slice(0, MAX_ENTRIES)
    .map((at) => ({ date: new Date(at), props: buildPayloadAt(coords, settings, at, location, resolveDay) }));
}

export { SPAN_MS, MAX_ENTRIES, BOUNDARY_EPSILON_MS };
