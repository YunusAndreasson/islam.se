// Turns a day of prayer times into a WidgetKit timeline. The iOS widget is NOT a
// live JS process — instead the app hands WidgetKit a list of dated entries and the
// system renders each at its scheduled instant, advancing the "next prayer" with no
// background execution. Entries start at each prayer, midnight and solar phase change.
import type { PrayerTimes } from 'adhan';
import type { WidgetTimelineEntry } from 'expo-widgets';
import type { LatLng } from '@/lib/prayer-times';
import { computePrayerTimes, PRAYER_ORDER } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import { addZoneDays, startOfZoneDay, zonePrayerDate } from '@/lib/zone-time';
import { buildPayloadAt, type WidgetPayload, widgetSolarDay } from './payload';

export type PrayerTimelineEntry = WidgetTimelineEntry<WidgetPayload>;

/** How many days of boundaries to emit. The provider's reload policy is `.atEnd`
 *  (expo-widgets' WidgetsTimelineProvider), so once the LAST entry's date passes,
 *  WidgetKit asks for a new timeline — and gets the same stored one back, because
 *  only the app can produce a fresh one and the app may not have been opened. At the
 *  old 36 h that left the widget frozen on a stale "next prayer" after a day and a
 *  half away, while `.atEnd` re-requested against the (budgeted) background reload
 *  allowance. Five days covers a working week away from the app; the cost is ~36
 *  small entries in the shared UserDefaults instead of ~13. A terminal placeholder
 *  clears the schedule at the horizon, even if the app/background task never runs.
 *  The next foreground re-pushes from `now`. */
const SPAN_DAYS = 5;
const SPAN_MS = SPAN_DAYS * 24 * 60 * 60 * 1000;
/** Enough for two-hour solar updates, prayer boundaries and DST headroom. */
const MAX_ENTRIES = 112;

/**
 * Build the timeline of {@link PrayerTimelineEntry} for `coords`/`settings`, starting
 * at `now`. `location` is the resolved label shared by every entry. Deterministic for
 * a fixed (coords, settings, location, now) — the prayer maths and Europe/Stockholm
 * formatting carry no hidden clock — so it unit-tests cleanly.
 */
export function buildTimeline(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
  includeSolarUpdates = true,
): PrayerTimelineEntry[] {
  // Memoise prayer-times by Stockholm calendar day (the prayerDate's local y/m/d).
  // The boundary scan below touches days -1–SPAN_DAYS, and buildPayloadAt re-derives its
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

  // Keep solar samples shared for all the day's entries.
  const solarDays = new Map<number, ReturnType<typeof widgetSolarDay>>();
  const resolveSolar = (startMs: number) => {
    let solar = solarDays.get(startMs);
    if (!solar) {
      solar = widgetSolarDay(coords, startMs);
      solarDays.set(startMs, solar);
    }
    return solar;
  };

  const boundaries = new Set<number>([now]);
  const horizon = now + SPAN_MS;

  // Include yesterday for prayers that still fall within the span. Day SPAN_DAYS is the last one that can still
  // contribute (its slots before `now`'s time-of-day fall inside the horizon), and its
  // post-Isha boundary is the rollover entry that points at the following Fajr.
  for (let dayOffset = -1; dayOffset <= SPAN_DAYS; dayOffset++) {
    const times = resolveDay(zonePrayerDate(now, dayOffset));
    for (const key of PRAYER_ORDER) {
      const t = times[key].getTime();
      if (!Number.isFinite(t)) continue; // skip polar-unresolved slots
      if (t > now && t < horizon) boundaries.add(t);
    }
  }

  // Midnight matters as much as any prayer: between 00:00 and Fajr the only entry
  // WidgetKit had was the one built just after YESTERDAY's Isha, so the medium
  // widget's schedule column, its Gregorian/Hijri footer and the "I MORGON" eyebrow
  // all kept showing the previous day for those three-odd hours. A Stockholm-midnight
  // boundary rebuilds the payload on the new civil day. addZoneDays is the
  // noon-anchored step — a naive +24 h lands at 23:00 on the 25-hour autumn day.
  let dayStart = startOfZoneDay(now);
  while (dayStart < horizon) {
    if (dayStart > now) boundaries.add(dayStart);
    const nextStart = addZoneDays(dayStart, 1);
    if (includeSolarUpdates) {
      for (let at = dayStart + 7_200_000; at < nextStart && at < horizon; at += 7_200_000) {
        if (at > now) boundaries.add(at);
      }
    }
    dayStart = nextStart;
  }

  const entries = [...boundaries]
    .sort((a, b) => a - b)
    .slice(0, MAX_ENTRIES - 1)
    .map((at) => ({ date: new Date(at), props: buildPayloadAt(coords, settings, at, location, resolveDay, resolveSolar) }));
  // WidgetKit keeps the final stored entry indefinitely. Do not leave an expired
  // prayer/countdown there: every family already supports an empty-payload state.
  entries.push({
    date: new Date(horizon),
    props: {
      location, theme: settings.theme, gregorian: '', hijri: '', rows: [], status: 'expired',
      nextArabic: '', nextSwedish: '', nextTime: '–', nextAtMs: null, nextIsTomorrow: false,
    },
  });
  return entries;
}

export { SPAN_DAYS, SPAN_MS, MAX_ENTRIES };
