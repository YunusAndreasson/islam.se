// Starts/refreshes/ends the prayer-countdown Live Activity (Lock Screen banner +
// Dynamic Island). Same posture as ./sync.ts: the app is the only thing that knows
// settings + location, and iOS only lets an app START a Live Activity while it is
// foregrounded — so this runs on launch/foreground/settings change (app/_layout.tsx →
// WidgetSync), alongside the widget timeline push.
//
// The countdown itself is system-rendered (Text timerInterval), so once started it ticks
// with no JS. Nothing in this module runs between foregrounds — and that is the whole
// design problem it has to solve.
//
// WHY THE BANNER USED TO STRAND AT 0:00. The layout cannot re-render itself at the prayer
// boundary: expo-widgets hard-codes `staleDate: nil` on start, update and end
// (ios/LiveActivityFactory.swift:30, ios/LiveActivity.swift:23,35) and omits `isStale`
// from LiveActivityEnvironment, so ActivityKit never marks the content stale and the view
// never gets a reason to change. (An older version of this comment claimed it did, and
// that the layout swapped to a preloaded following prayer — it never did in shipped code.)
// With the only trigger being an AppState 'active' edge, a prayer that arrived while the
// phone was locked left the countdown reading 0:00 until the user next opened the app:
// after ʿIshāʾ, all night.
//
// WHAT FIXES IT. `end(dismissalPolicy)` accepts `{ after: date }`, and an activity ended
// that way stays on the Lock Screen — still rendering, still counting — until iOS removes
// it at that date, with the app closed. So every activity started here is handed its own
// removal time (the prayer instant) the moment it starts; see reconcileActivity. The cost
// is the Dynamic Island, which drops an ended activity immediately — a deliberate trade,
// documented at the call site.
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

/**
 * How a banner is removed.
 *  – `'immediate'` takes it down now.
 *  – `{ after: date }` ends the activity but LEAVES IT ON SCREEN, rendering the final
 *    content, until iOS removes it at `date`. That is the whole mechanism behind the
 *    auto-dismiss: the removal is scheduled with the system, so it happens at the prayer
 *    whether or not the app ever runs again.
 *
 * The object literal is exactly what expo-widgets' `after(date)` helper returns, and its
 * `end()` branches on `'after' in policy`. Built here rather than imported so this module
 * keeps its top-level import list free of 'expo-widgets' — the native module is reached
 * only through the dynamic import in syncPrayerLiveActivity, which is what lets Jest load
 * this file at all.
 */
type DismissalPolicy = 'immediate' | { after: Date };

/** One running activity, as far as this module is concerned. There is deliberately no
 *  `update`: every activity this module starts is ended immediately with a future
 *  dismissal date, and ActivityKit ignores updates to an ended activity — so the only
 *  way to change what is on screen is to remove it and start a new one. */
interface LiveActivityHandle {
  end(policy: DismissalPolicy, props?: PrayerActivityProps): Promise<void>;
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
  start(props: PrayerActivityProps): LiveActivityHandle | undefined;
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
): Promise<void> {
  const instances = api.getInstances();

  if (!props) {
    // Nothing to count down to — clear whatever lingers.
    await endAll(instances);
    appliedContentKey = null;
    return;
  }

  // Already showing exactly this, and it already carries its own dismissal date — leave
  // it alone. This skip is what keeps the ActivityKit budget intact: reconcile runs on
  // EVERY foreground, and iOS reduces the sync rate of an activity it sees churned (see
  // the environment's `isActivityUpdateReduced`). The instance count is part of the test
  // so a duplicate still gets cleaned up rather than being skipped past.
  const key = activityContentKey(props);
  if (key === appliedContentKey && instances.length === 1) return;

  // Everything else is a REPLACEMENT, never an update. Each activity started below is
  // ended straight away with a future dismissal date, and an ended activity cannot be
  // updated — while still being listed by getInstances(), because that is
  // `Activity.activities`, which includes ended-but-not-yet-dismissed ones. Calling
  // update() on it would therefore be silently ignored and the banner would keep showing
  // the previous prayer. Remove and re-create is the only thing that actually changes
  // what is on screen. It costs a start+end pair per content change, which happens once
  // per prayer or on a settings edit — not per foreground.
  await endAll(instances);

  const started = api.start(props);
  // Hand it its own removal time immediately. This does NOT take the banner down: an
  // activity ended with `{ after: date }` stays on the Lock Screen rendering the final
  // content we pass here, and iOS removes it at `date` — with the app closed, which is
  // the entire point. `nextAtMs` is the prayer instant, so the countdown reaches 0:00 and
  // the banner disappears in the same moment instead of sitting there until the user
  // next opens the app.
  //
  // ⚠️ TWO BEHAVIOURS TO CONFIRM ON A DEVICE BUILD (neither is reachable from Jest — the
  // whole ActivityKit path is behind a dynamic import this suite cannot execute):
  //   1. The countdown must KEEP TICKING while ended. `Text(timerInterval:)` is
  //      system-rendered and is expected to, but if it instead freezes at the value it
  //      held when ended, the banner would show a static ~59:00 for the whole window —
  //      worse than the 0:00 this replaces. Check the Lock Screen a minute after the
  //      activity appears; the number must have moved.
  //   2. The Dynamic Island drops an ended activity right away, so the
  //      compact/expanded presentations in PrayerLiveActivity.tsx will not appear. That
  //      is the accepted cost of this approach, not a bug.
  // If (1) fails, the fallback is to end late instead of at start — keep the activity
  // active and only convert it to `{ after: nextAtMs }` on a sync close to the prayer.
  await started?.end({ after: new Date(props.nextAtMs) }, props);
  appliedContentKey = key;
}

/**
 * Reconcile the Live Activity with the current settings + location: end stale
 * instances, and start/refresh the countdown when the next prayer is within the
 * window. Best-effort and idempotent, exactly like syncPrayerWidget — wrapped so a
 * missing extension or ActivityKit denial (user toggled Live Activities off in
 * Settings) can never crash the app.
 *
 * WHEN THIS RUNS is why the banner has to carry its own removal date. Its only triggers
 * are app/_layout.tsx → WidgetSync → useForegroundSync, which fires once after settings
 * hydrate and then on each AppState 'active' edge. There is no timer and no boundary
 * hook, so nothing here observes the prayer arriving — not while the phone is locked, and
 * not even while the app is open ('active' does not re-fire, and the sync key
 * widgetSignature|coords|label carries no clock). Reconciling on foreground is correct
 * but always late, which is why the removal is scheduled with iOS instead.
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
