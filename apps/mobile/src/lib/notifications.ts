// Local prayer notifications — the one thing a prayer app must do that a beautiful
// viewer can't: tell you it's time, even when the app is closed. We schedule the
// user's own prayer times (same adhan settings + location as everything else) as
// local notifications for a rolling window of days, and re-sync whenever the
// settings, the location, or the app's foreground state change. No server, no
// push — purely on-device, so it works offline.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  computePrayerTimes,
  formatTime,
  type LatLng,
  PRAYER_LABELS,
  type PrayerKey,
} from './prayer-times';
import type { PrayerSettings } from './settings/types';

// The five obligatory prayers. Sunrise marks the end of Fajr's window, not a prayer
// — so it's offered on the map but never as an alert.
export const NOTIFY_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type NotifyPrayerKey = (typeof NOTIFY_PRAYERS)[number];

const CHANNEL_ID = 'prayers';
// iOS caps pending notifications at 64; 7 days × 5 prayers = 35, comfortably under,
// and we re-sync on every foreground so the window keeps rolling forward.
const DAYS_AHEAD = 7;
const DAY_MS = 86_400_000;

// Show prayer alerts even when the app is foregrounded (the user may be staring at
// the map when Asr lands). Set once at module load.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Ask for permission if not already granted. Returns whether we may post alerts. */
export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Bönetider',
    importance: Notifications.AndroidImportance.HIGH,
    // Omit `sound` so the channel uses the system default notification tone. Passing
    // the string 'default' makes expo-notifications look for a *custom* bundled file
    // named "default" (none exists) and warn — a HIGH-importance channel already
    // plays the default sound when none is set.
    vibrationPattern: [0, 250, 120, 250],
    lightColor: '#46527f',
  });
}

/**
 * Reconcile scheduled notifications with the current settings + location. Always
 * clears first, then (if enabled and permitted) schedules every selected prayer for
 * the next {@link DAYS_AHEAD} days that lies in the future. Idempotent — safe to
 * call on any change or foreground.
 */
export async function syncPrayerNotifications(
  coords: LatLng,
  settings: PrayerSettings,
): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!settings.notifications.enabled) return;

    const granted = await requestNotificationPermission();
    if (!granted) return;
    await ensureAndroidChannel();

    const now = Date.now();
    for (let d = 0; d < DAYS_AHEAD; d++) {
      const dayMidday = new Date(now + d * DAY_MS);
      dayMidday.setHours(12, 0, 0, 0);
      const times = computePrayerTimes(coords, dayMidday, settings);

      for (const key of NOTIFY_PRAYERS) {
        if (!settings.notifications.prayers[key]) continue;
        const at = times[key];
        if (!(at instanceof Date) || Number.isNaN(at.getTime())) continue;
        // Skip anything already past (or within the next minute — too late to be useful).
        if (at.getTime() <= now + 60_000) continue;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: PRAYER_LABELS[key as PrayerKey],
            body: `Bönetid ${formatTime(at, settings)}`,
            // `true` = the OS default sound (iOS reads this; on Android the channel
            // governs). A string here would be treated as a custom bundled filename.
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at,
            channelId: CHANNEL_ID,
          },
        });
      }
    }
  } catch {
    // Notifications are a best-effort enhancement — never let a scheduling failure
    // (permissions revoked mid-flight, OS quota) crash the app.
  }
}

/** Cancel everything — used when the user turns notifications off. */
export async function clearPrayerNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}
