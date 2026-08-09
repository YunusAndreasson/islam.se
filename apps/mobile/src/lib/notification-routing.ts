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
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

/** The home screen — the map with the prayer dock. */
export const PRAYER_TIMES_ROUTE = '/bonetider';

/** Navigate to Bönetider, swallowing the failure if the navigator isn't ready yet
 *  (a response can arrive before the root layout has mounted its stack). */
export function routeToPrayerTimes(): void {
  try {
    router.navigate(PRAYER_TIMES_ROUTE);
  } catch {
    // Nothing to recover: the user is already looking at whatever the app showed.
  }
}

/**
 * Start routing notification taps to Bönetider. Returns the unsubscribe.
 *
 * Fires for a tap on the alert itself AND for its action button — expo-notifications
 * reports both through the same response listener, distinguished only by
 * `actionIdentifier`, and both mean "show me the prayer times" here.
 */
export function subscribeNotificationRouting(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(() => {
    routeToPrayerTimes();
  });
  return () => subscription.remove();
}
