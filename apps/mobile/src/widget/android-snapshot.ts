// What the Android home-screen widget is handed, and how it picks what to show.
//
// The native provider stores this timeline and chooses the entry in force on each
// alarm, clock change or resize. Prayer times are still computed by the app.
import type { LatLng } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import { getDisplayZone } from '@/lib/zone-time';
import type { WidgetPayload } from './payload';
import { buildTimeline, SPAN_MS } from './timeline';

/** From `fromMs` until the next entry begins, the widget shows `payload`. */
export interface AndroidWidgetEntry {
  fromMs: number;
  payload: WidgetPayload;
}

export interface AndroidWidgetSnapshot {
  timeZone?: string;
  theme?: PrayerSettings['theme'];
  /** In time order; the first begins at the moment the snapshot was built. */
  entries: AndroidWidgetEntry[];
  /** The end of the timeline's horizon. At or after it the snapshot can no longer vouch for
   *  the next prayer, and the widget shows its placeholder instead of a stale one. */
  validUntilMs: number;
}

/**
 * The snapshot for `coords`/`settings` as of `now` — the iOS timeline, re-shaped. Every
 * prayer boundary and midnight inside the horizon has an entry. The provider
 * interpolates solar position between samples on render.
 */
export function buildAndroidSnapshot(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
): AndroidWidgetSnapshot {
  return {
    timeZone: getDisplayZone(),
    theme: settings.theme,
    entries: buildTimeline(coords, settings, location, now, false).map((entry) => ({
      fromMs: entry.date.getTime(),
      payload: entry.props,
    })),
    validUntilMs: now + SPAN_MS,
  };
}

/**
 * The entry the widget shows at `at`: the last one that has begun. Null when the snapshot is
 * empty or past its horizon. The native provider uses the same rule.
 */
export function selectEntry(snapshot: AndroidWidgetSnapshot, at: number): AndroidWidgetEntry | null {
  const { entries } = snapshot;
  if (entries.length === 0 || !(at < snapshot.validUntilMs)) return null;
  let current: AndroidWidgetEntry | null = null;
  for (const entry of entries) {
    if (entry.fromMs <= at) current = entry;
    else break;
  }
  return current;
}
