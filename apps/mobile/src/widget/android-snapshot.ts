// What the Android home-screen widget is handed, and how it picks what to show.
//
// The iOS widget gets a WidgetKit TIMELINE: dated entries the system swaps in at each prayer
// with no JS running (./timeline.ts). Android has nothing like it — expo-widgets 58 offers
// updateSnapshot(props) and reload(), and the layout is evaluated afresh on every render, in
// a small JS runtime of its own. So the snapshot carries the same timeline the iOS widget gets,
// and the layout chooses the entry in force at the instant it renders (`Date.now()` there).
// "Next prayer" is therefore decided by exactly the rule the iOS widget and the app's dock use
// (selectNextPrayer, through buildPayloadAt); nothing here re-derives it.
//
// ⚠️ WHAT THIS CANNOT FIX: WHEN Android renders. A render happens on the app's push, on the
// app leaving the foreground, on the background task, and on the widget's own update period
// (30 min, the system floor — see plugins/withPrayerWidgetAndroid.js). Between two renders the
// widget is a static picture, so a prayer can read as "next" for up to that long after it has
// passed, longer under Doze. Every render is right; the gaps are the price of not owning a
// timeline. Past `validUntilMs` the layout shows its placeholder rather than guess.
import type { LatLng } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import type { WidgetPayload } from './payload';
import { buildTimeline, SPAN_MS } from './timeline';

/** From `fromMs` until the next entry begins, the widget shows `payload`. */
export interface AndroidWidgetEntry {
  fromMs: number;
  payload: WidgetPayload;
}

export interface AndroidWidgetSnapshot {
  /** In time order; the first begins at the moment the snapshot was built. */
  entries: AndroidWidgetEntry[];
  /** The end of the timeline's horizon. At or after it the snapshot can no longer vouch for
   *  the next prayer, and the widget shows its placeholder instead of a stale one. */
  validUntilMs: number;
}

/**
 * The snapshot for `coords`/`settings` as of `now` — the iOS timeline, re-shaped. Every
 * boundary inside the horizon is an entry (each prayer + 1 s, each midnight), so between
 * two entries nothing changes what the widget should say.
 */
export function buildAndroidSnapshot(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
): AndroidWidgetSnapshot {
  return {
    entries: buildTimeline(coords, settings, location, now).map((entry) => ({
      fromMs: entry.date.getTime(),
      payload: entry.props,
    })),
    validUntilMs: now + SPAN_MS,
  };
}

/**
 * The entry the widget shows at `at`: the last one that has begun. Null when the snapshot is
 * empty or past its horizon. The layout carries its own copy of this loop — it is evaluated
 * standalone and can import nothing — and android-layout.test.ts holds the two to the same
 * answer.
 */
export function selectEntry(snapshot: AndroidWidgetSnapshot, at: number): AndroidWidgetEntry | null {
  const { entries } = snapshot;
  if (entries.length === 0 || !(at < snapshot.validUntilMs)) return null;
  let current = entries[0] ?? null;
  for (const entry of entries) {
    if (entry.fromMs <= at) current = entry;
    else break;
  }
  return current;
}
