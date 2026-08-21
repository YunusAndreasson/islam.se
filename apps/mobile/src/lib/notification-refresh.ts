// Keeping the prayer alerts alive for a reader who does not open the app.
//
// ⚠️ THE GAP THIS CLOSES. syncPrayerNotifications runs on hydration and on every
// foreground (see app/_layout's useForegroundSync), and nowhere else. iOS keeps at most 64
// PENDING notification requests per app — the app budgets 60 (IOS_PENDING_BUDGET) — and
// five obligatory prayers plus the optional sunrise and night markers spend that in roughly
// a fortnight. So the schedule is not a standing promise; it is a rolling window that only
// advances when the app is opened.
//
// For most readers that is invisible, because a prayer app is opened daily. For the reader
// it is not invisible to — someone who relies on the notification precisely BECAUSE they
// don't open the app — the failure is total and silent: the alerts simply stop, with
// nothing on screen to say so, which is the one failure this app cannot afford.
//
// So the OS is asked to wake us periodically and re-seed the window. `expo-background-task`
// is BGTaskScheduler on iOS and WorkManager on Android.
//
// ⚠️ AND WHAT IT DOES NOT CLOSE. Neither platform guarantees the wake-up. iOS runs these
// tasks opportunistically — typically overnight while charging, often not at all for an app
// the user rarely opens, which is exactly our case. This RAISES THE FLOOR; it does not make
// the schedule certain, and the foreground sync remains the primary path. Anything stronger
// would mean silent push, i.e. a server and an account, which this app deliberately has
// neither of.
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { readCachedFix } from '@/lib/location/gps-cache';
import { resolveLocation } from '@/lib/location/resolve';
import { syncPrayerNotifications } from '@/lib/notifications';
import { loadSettings } from '@/lib/settings/store';

/** Persisted by the OS across launches, so the string is effectively a migration surface:
 *  changing it orphans the previously registered task rather than renaming it. */
export const PRAYER_REFRESH_TASK = 'prayer-notification-refresh';

/**
 * Twice a day against a horizon of roughly a fortnight.
 *
 * The window does not need to advance often — it needs to advance BEFORE it runs out, and
 * anything under a day has enormous margin for that. Asking more frequently would only
 * spend battery to be told "not now" by a scheduler that already ignores short intervals.
 */
const REFRESH_INTERVAL_MINUTES = 12 * 60;

// Module scope, and imported for this side effect: the OS starts the JS runtime in a bare
// headless context and immediately looks for the task by name. A definition that waited for
// a component to mount would not exist yet, and the wake-up would be wasted.
TaskManager.defineTask(PRAYER_REFRESH_TASK, async () => {
  try {
    const settings = await loadSettings();
    // Reminders switched off is not a failure — it is the task having nothing to do. Doing
    // it anyway would re-create the very notifications the user turned off.
    if (!settings.notifications.enabled) return BackgroundTask.BackgroundTaskResult.Success;

    // No React, no provider, and no asking the OS for a position — a background wake-up is
    // not a moment to start the GPS. resolveLocation is the same table the app and the
    // widget resolve through, fed from the cached fix, so a background re-schedule lands on
    // the same coordinate the reader last saw on screen.
    const { coords } = resolveLocation(
      settings.locationMode,
      settings.manualLocation,
      await readCachedFix(),
    );
    await syncPrayerNotifications(coords, settings);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // Reporting Failed lets the scheduler back off rather than retry a broken task in a
    // loop. The foreground sync will put things right the next time the app is opened.
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Ask the OS to start waking us. Idempotent — re-registering an already-registered task is
 * how the interval is kept in step after an update, and costs nothing when it is unchanged.
 *
 * Never throws: background execution can be Restricted (Low Power Mode, a managed device,
 * Background App Refresh switched off), and that is a normal state to be in, not an error
 * worth surfacing. The app works exactly as it did before this module existed.
 */
export async function registerNotificationRefresh(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
    await BackgroundTask.registerTaskAsync(PRAYER_REFRESH_TASK, {
      minimumInterval: REFRESH_INTERVAL_MINUTES,
    });
  } catch {
    // See above: an unavailable scheduler is a degraded mode, not a broken app.
  }
}
