// When does the app count as opened?
//
// Not when JavaScript starts. iOS runs the notification refresh (BGTaskScheduler,
// lib/notification-refresh) by launching the app in the background, and AppDelegate starts
// React either way, so the whole tree mounts without anyone looking at it. Counting that as
// an open is how "active users" and day-1 retention came out inflated in the app that did.
//
// So an open is a move to AppState 'active':
//   - 'cold': the first 'active' of this JS context. If it started in the background, that
//     is the moment the reader opens it, however long afterwards.
//   - 'warm': back to 'active' after at least WARM_AFTER_MS in the background. Shorter trips
//     (a glance at another app, the share sheet, a permission dialog on Android) are the
//     same visit. iOS's 'inactive' (Control Centre, an alert over the app) is not a
//     departure at all: only 'background' starts the clock.
//
// Pure: the state lives in the tracker, the clock is passed in. The one tracker the app
// uses is `appLaunch` below; tests make their own.

export type LaunchKind = 'cold' | 'warm';

/** A return after this long in the background is a new visit. */
export const WARM_AFTER_MS = 30_000;

/** A notification tap answered this soon after the cold open, with no trip to the
 *  background in between, is the tap that started the app. */
export const LAUNCH_MOMENT_MS = 10_000;

export interface LaunchTracker {
  /** Feed every AppState value, the current one first. Returns the open it completes. */
  observe: (state: string | null | undefined, now: number) => LaunchKind | null;
  /** True while the app has not been opened yet, or for the first moments of the cold
   *  open: the window in which a notification response is the one that launched it. */
  isLaunchMoment: (now: number) => boolean;
  /** Test seam: back to a JS start that has not been opened yet. */
  resetForTests: () => void;
}

export function createLaunchTracker(): LaunchTracker {
  let coldAt: number | null = null;
  let backgroundAt: number | null = null;
  let leftSinceCold = false;
  return {
    observe: (state, now) => {
      if (state === 'background') {
        // Before the cold open there is nothing to come back to: a background launch's
        // first 'active' is the cold open, not a return.
        if (coldAt !== null) {
          backgroundAt = now;
          leftSinceCold = true;
        }
        return null;
      }
      if (state !== 'active') return null;
      if (coldAt === null) {
        coldAt = now;
        return 'cold';
      }
      if (backgroundAt === null) return null;
      const away = now - backgroundAt;
      backgroundAt = null;
      return away >= WARM_AFTER_MS ? 'warm' : null;
    },
    isLaunchMoment: (now) =>
      coldAt === null || (!leftSinceCold && now - coldAt < LAUNCH_MOMENT_MS),
    resetForTests: () => {
      coldAt = null;
      backgroundAt = null;
      leftSinceCold = false;
    },
  };
}

/** The tracker for this JS context: a cold start is a new one. */
export const appLaunch = createLaunchTracker();
