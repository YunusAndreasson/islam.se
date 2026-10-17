// Starts/refreshes/ends the prayer-countdown Live Activity (Lock Screen banner +
// Dynamic Island). Same posture as ./sync.ts: the app is the only thing that knows
// settings + location, and iOS only lets an app START a Live Activity while it is
// foregrounded — so usePrayerActivitySync runs this on foreground/settings changes
// and at the countdown window and prayer boundaries, and again from the background task
// (lib/notification-refresh), which may update or end an activity but never start one.
//
// The countdown itself is system-rendered (Text timerInterval), so once started it ticks
// with no JS. The foreground scheduler ends a finished activity while the app is open;
// staleDate alone still cannot end it while the app is suspended.
//
// HOW THE BOUNDARY IS HANDLED. Every activity is started — and every update sent — with a
// `staleDate` at the prayer instant. ActivityKit flips the content to stale at that moment
// on its own, with the app closed, and the layout reads `environment.isStale` to swap the
// finished countdown for »Dags för X« and the prayer after it (see PrayerLiveActivity.tsx).
// The next reconcile then rolls the SAME activity over to the following prayer with
// update(), or ends it when nothing is near.
//
// HISTORY, because each step undid a real bug. Before expo-widgets 57.0.12 the bridge passed
// `staleDate: nil` everywhere and had no `isStale`, so a countdown stranded at 0:00 until the
// app next opened — all night after ʿIshāʾ. The workaround ended every activity at start with
// `{ after: prayer }`, which made iOS remove it at the prayer but cost the Dynamic Island
// (an ended activity leaves it at once) and needed a patched getInstances() to see the ended
// banners it had to replace. SDK 58's getInstances() deliberately omits ended activities, and
// the stale state now exists, so activities stay active and the patch is gone.
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
  update(props: PrayerActivityProps, staleDate?: Date): Promise<void>;
  end(policy: 'immediate'): Promise<void>;
}

/**
 * The slice of expo-widgets' LiveActivityFactory this module drives. Injected rather
 * than imported so the start/update/end/skip decision — the part with the race and the
 * budget in it — is exercisable without the native extension. It genuinely cannot be
 * reached the other way: syncPrayerLiveActivity reaches ActivityKit through a dynamic
 * `import()`, which Jest cannot execute (no --experimental-vm-modules), so every call
 * through that path silently lands in the catch below and does nothing at all.
 *
 * `getInstances()` lists active and STALE activities only; since expo-widgets 58 an ended
 * one is never in it, however long it stays on screen.
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
   *  it is in the foreground. Updating and ending are allowed from the background. */
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
    // Nothing to count down to — clear whatever lingers, a stale »Dags för …« included.
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

  // One activity, updated in place: a prayer rolling over to the next keeps its banner and
  // its place in the Dynamic Island rather than being torn down and started again. The
  // staleDate goes with every update, so the new content flips to stale at ITS prayer.
  const [keep, ...extras] = instances;
  await endAll(extras);
  const staleDate = new Date(props.nextAtMs);
  if (keep) {
    await keep.update(props, staleDate);
  } else if (canStart) {
    api.start(props, undefined, staleDate);
  } else {
    // In the background with nothing on screen: there is nothing to update, and starting
    // one is not allowed. The next foreground starts it.
    return;
  }
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
