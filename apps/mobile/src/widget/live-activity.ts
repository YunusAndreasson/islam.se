// Starts/refreshes/ends the prayer-countdown Live Activity (Lock Screen banner +
// Dynamic Island). Same posture as ./sync.ts: the app is the only thing that knows
// settings + location, and iOS only lets an app START a Live Activity while it is
// foregrounded — so this runs on launch/foreground/settings change (app/_layout.tsx →
// WidgetSync), alongside the widget timeline push.
//
// The countdown itself is system-rendered (Text timerInterval), so once started it
// ticks with no JS. ActivityKit marks the content stale at the prayer boundary; the
// layout then switches to a preloaded following prayer without waking the app.
import { Platform } from 'react-native';

import type { LatLng } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import type { PrayerActivityProps } from '@/widgets/PrayerLiveActivity';
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
 *
 * The result depends ONLY on the next slot, never on `now` beyond the in-window test.
 * That is deliberate: it makes two syncs a minute apart produce identical props, which
 * is what lets {@link syncPrayerLiveActivity} skip a redundant ActivityKit update.
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
    // The countdown's LOWER bound. SwiftUI's Text(timerInterval:countsDown:) renders
    // `upper − now` for any lower bound already in the past, so this only has to be
    // ≤ now — it does not have to be the moment we started the activity. Anchoring it
    // to the instant the prayer entered the window (rather than `now`) is what keeps
    // the props stable across refreshes; passing `now` made every single foreground
    // look like a content change and spend an ActivityKit update on nothing.
    startedAtMs: payload.nextAtMs - LIVE_ACTIVITY_WINDOW_MS,
    isMarker: nextRow.isMarker,
  };
}

/** Identity of what the activity is currently SHOWING. Two props objects with the same
 *  key render identically, so an update between them is pure waste. */
function activityContentKey(props: PrayerActivityProps): string {
  return `${props.nextKey}|${props.nextAtMs}|${props.isMarker}`;
}

/** What we last handed ActivityKit in this app session. Module state, so it resets on a
 *  cold start — at which point one reconciling update is correct anyway. */
let appliedContentKey: string | null = null;

/** Serialises reconciles — see applyPrayerActivity. */
let reconcileQueue: Promise<void> = Promise.resolve();

/** Test seam — mirrors resetSyncStateForTests() in @/lib/notifications. */
export function resetLiveActivityStateForTests(): void {
  appliedContentKey = null;
  reconcileQueue = Promise.resolve();
}

/** One running activity, as far as this module is concerned. */
interface LiveActivityHandle {
  update(props: PrayerActivityProps): Promise<void>;
  end(policy: 'immediate'): Promise<void>;
}

/**
 * The slice of expo-widgets' LiveActivityFactory this module drives. Injected rather
 * than imported so the start/update/end/skip decision — the part with the race and the
 * budget in it — is exercisable without the native extension. It genuinely cannot be
 * reached the other way: syncPrayerLiveActivity reaches ActivityKit through a dynamic
 * `import()`, which Jest cannot execute (no --experimental-vm-modules), so every call
 * through that path silently lands in the catch below and does nothing at all.
 */
export interface LiveActivityApi {
  start(props: PrayerActivityProps): unknown;
  getInstances(): LiveActivityHandle[];
}

/**
 * Bring ActivityKit in line with `props` (null = there should be no activity).
 *
 * SERIALISED, and that is the point. This is read-then-write across an await — it asks
 * ActivityKit what exists, then starts or updates. Two overlapping runs both observe
 * "no instances" and both call start(), putting two identical countdown banners on the
 * Lock Screen. Overlapping runs are ordinary here: the AppState 'active' edge fires
 * again after a permission dialog or Control Centre is dismissed, and a settings or
 * location change re-runs the effect independently. The next sync does clear the
 * duplicate, but only after the user has already seen it.
 */
export function applyPrayerActivity(
  api: LiveActivityApi,
  props: PrayerActivityProps | null,
): Promise<void> {
  const run = reconcileQueue.then(() => reconcileActivity(api, props));
  // The queue must never reject, or every later sync short-circuits on it.
  reconcileQueue = run.catch(() => undefined);
  return run;
}

async function reconcileActivity(
  api: LiveActivityApi,
  props: PrayerActivityProps | null,
): Promise<void> {
  const instances = api.getInstances();

  if (!props) {
    // Nothing to count down to — clear whatever lingers (e.g. yesterday's 00:00).
    for (const activity of instances) {
      await activity.end('immediate');
    }
    appliedContentKey = null;
    return;
  }
  if (instances.length === 0) {
    api.start(props);
    appliedContentKey = activityContentKey(props);
    return;
  }
  // End accidental duplicates first, whatever happens to the survivor.
  for (const extra of instances.slice(1)) {
    await extra.end('immediate');
  }
  // Refresh the survivor only when it would actually look different — this runs on
  // EVERY foreground, and iOS budgets Live Activity updates (it starts reducing the
  // synchronisation rate of an activity that is updated often; see the environment's
  // `isActivityUpdateReduced`). Re-pushing a byte-identical countdown is precisely the
  // waste that budget exists to punish.
  const key = activityContentKey(props);
  if (key === appliedContentKey) return;
  await instances[0].update(props);
  appliedContentKey = key;
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
    await applyPrayerActivity(PrayerLiveActivity, buildPrayerActivityProps(payload, now));
  } catch {
    // No widget extension, ActivityKit unavailable, or activities disabled by the
    // user — nothing the app can act on.
  }
}
