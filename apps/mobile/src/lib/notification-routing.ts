// Where a tapped prayer alert lands you.
//
// The alert's own action button says "Visa bönetider" (see CATEGORY_ID in
// ./notifications), and the body of the alert is a prayer time — so the only honest
// destination is the Bönetider screen. A COLD launch already gets that for free: the
// "/" route redirects there (src/app/index.tsx). A WARM app does not. Tapping an alert
// while Inställningar, Qibla or the mosque-correction sheet is open simply foregrounds
// that sheet, so the button that promised prayer times delivered a settings form.
//
// Hence one listener, registered for the app's lifetime. `navigate` (not `push`) is
// deliberate: Bönetider is already the root of the stack, so this pops the open sheet
// back to it instead of stacking a second copy of the map behind it.
//
// The same listener reports the tap as Notification Opened — the measure of whether the
// reminders bring readers back. Only taps: an alert that is delivered and left alone sends
// nothing, and nothing here runs in the background refresh task.
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { ANALYTICS_EVENTS, afterAppOpen, analytics } from '@/lib/analytics';
import { appLaunch } from '@/lib/analytics/lifecycle';
import { PRAYER_ORDER } from '@/lib/prayer-times';

/** The home screen — the map with the prayer dock. */
export const PRAYER_TIMES_ROUTE = '/bonetider';

/** The alert category's one button (see ensureNotificationCategory in ./notifications). */
const OPEN_PRAYER_TIMES_ACTION = 'open-prayer-times';

/** Navigate to Bönetider, swallowing the failure if the navigator isn't ready yet
 *  (a response can arrive before the root layout has mounted its stack). */
export function routeToPrayerTimes(): void {
  try {
    router.navigate(PRAYER_TIMES_ROUTE);
  } catch {
    // Nothing to recover: the user is already looking at whatever the app showed.
  }
}

/** Which alert was tapped, as the slot key the scheduler put in its data: a prayer, the
 *  sunrise marker or the night's last third. Anything else is 'other', never echoed. */
export function notificationPrayer(data: unknown): string {
  const key = typeof data === 'object' && data !== null ? (data as { key?: unknown }).key : undefined;
  if (key === 'lastThird') return key;
  return PRAYER_ORDER.find((slot) => slot === key) ?? 'other';
}

/** The alert itself, or its "Visa bönetider" button. */
export function notificationAction(actionIdentifier: string | undefined): 'tap' | 'button' | 'other' {
  if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) return 'tap';
  return actionIdentifier === OPEN_PRAYER_TIMES_ACTION ? 'button' : 'other';
}

// A cold tap can reach us twice — as the launch response read at mount, and again through
// the listener — so each request is reported once.
const reported = new Set<string>();

function reportOpened(
  response: Notifications.NotificationResponse | null | undefined,
  cold: boolean,
): void {
  try {
    const request = response?.notification?.request;
    if (!request || reported.has(request.identifier)) return;
    reported.add(request.identifier);
    const properties = {
      prayer: notificationPrayer(request.content?.data),
      action: notificationAction(response.actionIdentifier),
      cold,
    };
    afterAppOpen(() => {
      void analytics.track(ANALYTICS_EVENTS.NOTIFICATION_OPENED, properties);
    });
  } catch {
    // Analytics never stands between a tap and the prayer times.
  }
}

/**
 * Start routing notification taps to Bönetider. Returns the unsubscribe.
 *
 * Fires for a tap on the alert itself AND for its action button — expo-notifications
 * reports both through the same response listener, distinguished only by
 * `actionIdentifier`, and both mean "show me the prayer times" here.
 *
 * A tap that STARTED the app is normally already waiting as the last response when this
 * mounts, so it is reported from there as cold. One that arrives through the listener is
 * cold only in the first moments of a launch (see appLaunch.isLaunchMoment): expo can hand
 * the launch response to a listener added after it landed.
 */
export function subscribeNotificationRouting(): () => void {
  try {
    reportOpened(Notifications.getLastNotificationResponse(), true);
  } catch {
    // Not available: the listener below still sees warm taps.
  }
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    routeToPrayerTimes();
    reportOpened(response, appLaunch.isLaunchMoment(Date.now()));
  });
  return () => subscription.remove();
}
