// Starts/refreshes/ends the prayer-countdown Live Activity (Lock Screen banner +
// Dynamic Island). Same posture as ./sync.ts: the app is the only thing that knows
// settings + location, and iOS only lets an app START a Live Activity while it is
// foregrounded — so this runs on launch/foreground/settings change (app/_layout.tsx →
// WidgetSync), alongside the widget timeline push.
//
// The countdown itself is system-rendered (Text timerInterval), so once started it
// ticks with no JS. With no push infra and no background JS the activity can't be
// ended AT prayer time — it sits at 00:00 until the next foreground reconciles it.
// The 60-minute window below keeps that staleness bounded (and is when a countdown
// is actually glanceable). Push-to-start / APNs updates are a future follow-up.
import { Platform } from 'react-native';

import type { LatLng } from '../lib/prayer-times';
import type { PrayerSettings } from '../lib/settings/types';
import type { PrayerActivityProps } from '../widgets/PrayerLiveActivity';
import { buildPayloadAt, type WidgetPayload } from './payload';

/** Only show the activity when the next prayer is this close. */
export const LIVE_ACTIVITY_WINDOW_MS = 60 * 60 * 1000;

/** True when `nextAtMs` is upcoming and within the live-activity window of `now`. */
export function isWithinLiveActivityWindow(nextAtMs: number | null, now: number): boolean {
  if (nextAtMs == null) return false;
  const remaining = nextAtMs - now;
  return remaining > 0 && remaining <= LIVE_ACTIVITY_WINDOW_MS;
}

/**
 * Derive the activity props for `payload` as of `now`, or null when no activity
 * should be live (no upcoming slot, outside the window, or an unresolved polar slot).
 * Pure — this is the tested decision core; syncPrayerLiveActivity just applies it.
 */
export function buildPrayerActivityProps(
  payload: WidgetPayload,
  now: number,
): PrayerActivityProps | null {
  if (!isWithinLiveActivityWindow(payload.nextAtMs, now)) return null;
  // Post-Isha the next slot is tomorrow's Fajr (no row is flagged isNext then) — but
  // that only matters if Fajr is under an hour away, i.e. shortly before it.
  const nextRow = payload.nextIsTomorrow
    ? { key: 'fajr' as const, isMarker: false }
    : payload.rows.find((r) => r.isNext);
  if (!nextRow || payload.nextAtMs == null) return null;
  return {
    nextKey: nextRow.key,
    nextArabic: payload.nextArabic,
    nextSwedish: payload.nextSwedish,
    nextTime: payload.nextTime,
    nextAtMs: payload.nextAtMs,
    startedAtMs: now,
    isMarker: nextRow.isMarker,
  };
}

/**
 * Reconcile the Live Activity with the current settings + location: end stale
 * instances, and start/refresh the countdown when the next prayer is within the
 * window. Best-effort and idempotent, exactly like syncPrayerWidget — wrapped so a
 * missing extension or ActivityKit denial (user toggled Live Activities off in
 * Settings) can never crash the app.
 */
export async function syncPrayerLiveActivity(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    // Deferred import so the ActivityKit module is never evaluated on a platform/build
    // without the widget extension.
    const { default: PrayerLiveActivity } = await import('../widgets/PrayerLiveActivity');
    const payload = buildPayloadAt(coords, settings, now, location);
    const props = buildPrayerActivityProps(payload, now);
    const instances = PrayerLiveActivity.getInstances();

    if (!props) {
      // Nothing to count down to — clear whatever lingers (e.g. yesterday's 00:00).
      for (const activity of instances) {
        await activity.end('immediate');
      }
      return;
    }
    if (instances.length > 0) {
      // Refresh the existing activity in place (re-anchors the countdown bounds and
      // flips it to the new prayer after a passed one); end accidental duplicates.
      await instances[0].update(props);
      for (const extra of instances.slice(1)) {
        await extra.end('immediate');
      }
    } else {
      PrayerLiveActivity.start(props);
    }
  } catch {
    // No widget extension, ActivityKit unavailable, or activities disabled by the
    // user — nothing the app can act on.
  }
}
