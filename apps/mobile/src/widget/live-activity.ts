// Prayer countdowns carry their Lock Screen dismissal time from the moment they start.
// Ending with { after: prayer } leaves the system-rendered countdown on the Lock Screen
// until prayer time, even while the app is suspended. It leaves Dynamic Island at once.
// staleDate alone only changes the content; it does not remove a finished banner.
//
// The expo-widgets patch includes ended activities in getInstances() so foregrounds and
// cold starts can find these still-visible banners instead of stacking duplicates.
// Ended activities cannot be updated: content changes require replacement, in foreground
// only. usePrayerActivitySync also reconciles at time boundaries while the app is open.
import { Platform } from 'react-native';

import { alertContent } from '@/lib/alert-copy';
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
 * `following` is the payload as of just after the next slot — whose own "next" is the slot
 * after it, tomorrow's Fajr included — and supplies what the stale view names once the
 * prayer has arrived. Null leaves that line to the Swedish name.
 *
 * The result depends ONLY on the next slot, never on `now` beyond the in-window test.
 * That is deliberate: it makes two syncs a minute apart produce identical props, which
 * is what lets {@link syncPrayerLiveActivity} skip a redundant ActivityKit update.
 */
export function buildPrayerActivityProps(
  payload: WidgetPayload,
  now: number,
  following: WidgetPayload | null = null,
): PrayerActivityProps | null {
  if (!isWithinLiveActivityWindow(payload.nextAtMs, now)) return null;
  // Post-Isha the next slot is tomorrow's Fajr (no row is flagged isNext then) — but
  // that only matters if Fajr is under an hour away, i.e. shortly before it.
  const nextRow = payload.nextIsTomorrow
    ? { key: 'fajr' as const, isMarker: false }
    : payload.rows.find((r) => r.isNext);
  if (!nextRow || payload.nextAtMs == null) return null;
  const after = following?.nextAtMs != null ? following : null;
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
    // The stale view's headline: the very words of the lead-0 alert for this slot, so the
    // banner and a notification arriving at the same moment never disagree.
    arrivedTitle: alertContent(nextRow.key, new Date(payload.nextAtMs), 0).title,
    followingArabic: after?.nextArabic ?? '',
    followingTime: after?.nextTime ?? '',
  };
}

/** Identity of what the activity is currently SHOWING, stale view included. Two props
 *  objects with the same key render identically, so an update between them is pure waste. */
function activityContentKey(props: PrayerActivityProps): string {
  return [
    props.nextKey,
    props.nextAtMs,
    props.isMarker,
    props.followingArabic,
    props.followingTime,
  ].join('|');
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
  end(policy: 'immediate' | { after: Date }, props?: PrayerActivityProps): Promise<void>;
}

/**
 * The slice of expo-widgets' LiveActivityFactory this module drives. Injected rather
 * than imported so the start/update/end/skip decision — the part with the race and the
 * budget in it — is exercisable without the native extension. It genuinely cannot be
 * reached the other way: syncPrayerLiveActivity reaches ActivityKit through a dynamic
 * `import()`, which Jest cannot execute (no --experimental-vm-modules), so every call
 * through that path silently lands in the catch below and does nothing at all.
 *
 * Our native patch also lists ended banners awaiting dismissal. Without it, the next
 * foreground would see an empty list and start a duplicate.
 */
export interface LiveActivityApi {
  start(
    props: PrayerActivityProps,
    url: string | undefined,
    staleDate: Date,
  ): LiveActivityHandle | undefined;
  getInstances(): LiveActivityHandle[];
}

export interface ReconcileOptions {
  /** False from the background task: ActivityKit only lets an app START an activity while
   *  it is in the foreground. Ending is allowed from the background. */
  canStart: boolean;
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
  options: ReconcileOptions = { canStart: true },
): Promise<void> {
  const run = reconcileQueue.then(() => reconcileActivity(api, props, options));
  // The queue must never reject, or every later sync short-circuits on it.
  reconcileQueue = run.catch(() => undefined);
  return run;
}

/** Take every one of these banners down now.
 *
 *  Iterates a COPY. `getInstances()` is free to hand back a live view of ActivityKit's
 *  list rather than a snapshot, and ending an activity removes it from that list — so
 *  walking the original skips every second entry, which is exactly how a duplicate
 *  survived a sync that was supposed to clear it. Not a hypothetical: the duplicates test
 *  caught it. */
async function endAll(instances: readonly LiveActivityHandle[]): Promise<void> {
  for (const activity of [...instances]) {
    await activity.end('immediate');
  }
}

async function reconcileActivity(
  api: LiveActivityApi,
  props: PrayerActivityProps | null,
  { canStart }: ReconcileOptions,
): Promise<void> {
  const instances = [...api.getInstances()];

  if (!props) {
    // Nothing to count down to — clear any remaining or legacy banners.
    await endAll(instances);
    appliedContentKey = null;
    return;
  }

  // Already showing exactly this — leave it alone. This skip is what keeps the ActivityKit
  // budget intact: reconcile runs on EVERY foreground, and iOS reduces the sync rate of an
  // activity it sees churned (see the environment's `isActivityUpdateReduced`). The
  // instance count is part of the test so a duplicate still gets cleaned up rather than
  // being skipped past.
  const key = activityContentKey(props);
  if (key === appliedContentKey && instances.length === 1) return;

  // Ended banners ignore updates. Replace changed content, clearing old/duplicate
  // banners first; a background task can clean up but must never start a replacement.
  await endAll(instances);
  appliedContentKey = null;
  if (!canStart) return;

  const started = api.start(props, undefined, new Date(props.nextAtMs));
  if (!started) return;
  // The one-hour countdown window is within ActivityKit's four-hour dismissal limit.
  // Final content keeps its system timer; no background JS or end push is needed.
  await started.end({ after: new Date(props.nextAtMs) }, props);
  appliedContentKey = key;
}

/**
 * Reconcile the Live Activity with the current settings + location: end stale
 * instances, and start/refresh the countdown when the next prayer is within the
 * window. Best-effort and idempotent, exactly like syncPrayerWidget — wrapped so a
 * missing extension or ActivityKit denial (user toggled Live Activities off in
 * Settings) can never crash the app.
 *
 * Pass `canStart: false` from the background task; see {@link ReconcileOptions}.
 */
export async function syncPrayerLiveActivity(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
  { canStart }: ReconcileOptions = { canStart: true },
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    // Deferred import so the ActivityKit module is never evaluated on a platform/build
    // without the widget extension.
    const { default: PrayerLiveActivity } = await import('../widgets/PrayerLiveActivity');
    const payload = buildPayloadAt(coords, settings, now, location);
    const following =
      payload.nextAtMs == null
        ? null
        : buildPayloadAt(coords, settings, payload.nextAtMs + 1, location);
    await applyPrayerActivity(
      PrayerLiveActivity,
      buildPrayerActivityProps(payload, now, following),
      { canStart },
    );
  } catch {
    // No widget extension, ActivityKit unavailable, or activities disabled by the
    // user — nothing the app can act on.
  }
}
