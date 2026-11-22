import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * What the OS should do with an alert that arrives while the app is foregrounded (the
 * user may be staring at the map when ʿAṣr lands). Exported so the platform split below
 * is testable without the native module.
 *
 * `shouldPlaySound` means two different things on the two platforms, and treating it as
 * one thing is what made this wrong:
 *
 *   • iOS — the returned behaviour IS the foreground presentation
 *     (UNNotificationPresentationOptions). The content's own `sound` is not consulted,
 *     so a "Tyst" choice has to be honoured right here or every silent alert becomes
 *     audible the moment the app happens to be open.
 *
 *   • Android — the CHANNEL is the sound (frozen at creation, which is why each choice
 *     gets its own channel; see channelIdFor). expo maps `shouldPlaySound: false` onto
 *     NotificationCompat.setSilent(true), which does NOT merely mute the tone: a silent
 *     notification gets no heads-up at all, so a "Tyst" alert used to slide quietly into
 *     the shade instead of appearing over the map — the one moment it had to be seen.
 *     Deferring to the channel gives the right answer for every choice: silent → no
 *     sound (its channel has none) but still a HIGH-importance banner, default → the
 *     system tone, adhan → the adhan. It also retires the old known limitation that an
 *     in-foreground adhan would be replaced by the default tone.
 */
export function foregroundPresentation(silent: boolean): Notifications.NotificationBehavior {
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: Platform.OS === 'android' ? true : !silent,
    shouldSetBadge: false,
  };
}

// Set once at module load. The `silent` flag rides on the scheduled content — see the
// `data` field in syncPrayerNotifications.
Notifications.setNotificationHandler({
  handleNotification: async (notification) =>
    foregroundPresentation(notification.request.content.data?.silent === true),
});

// A notification action can start JS before the navigator exists. Keep the response
// until the root mounts. The normal cold-launch route still applies the introduction gate.
type Response = Notifications.NotificationResponse;
const launchResponses: Response[] = [];
let launchListener: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined =
  Notifications.addNotificationResponseReceivedListener((response) => launchResponses.push(response));

export function subscribeNotificationResponses(
  onLaunch: (response: Response) => void,
  onTap: (response: Response) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(onTap);
  launchListener?.remove();
  launchListener = undefined;
  for (const response of launchResponses.splice(0)) onLaunch(response);
  try {
    // An action that reached native before JS started may only be available here.
    const response = Notifications.getLastNotificationResponse();
    if (response) onLaunch(response);
  } catch {
    // Platforms without the last-response API still deliver taps to the listener.
  }
  return () => subscription.remove();
}
