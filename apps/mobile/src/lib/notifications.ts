// Local prayer notifications — the one thing a prayer app must do that a beautiful
// viewer can't: tell you it's time, even when the app is closed. We schedule the
// user's own prayer times (same adhan settings + location as everything else) as
// local notifications for a rolling window of days, and re-sync whenever the
// settings, the location, or the app's foreground state change. No server, no
// push — purely on-device, so it works offline.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { palette } from '../theme/tokens';
import {
  computePrayerTimes,
  formatTime,
  type LatLng,
  PRAYER_LABELS,
  type PrayerKey,
} from './prayer-times';
import type { PrayerSettings } from './settings/types';
import { stockholmPrayerDate } from './stockholm-time';

// The five obligatory prayers. Sunrise marks the end of Fajr's window, not a prayer
// — so it's offered on the map but never as an alert.
export const NOTIFY_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type NotifyPrayerKey = (typeof NOTIFY_PRAYERS)[number];
export type NotificationPermissionState = 'unknown' | 'granted' | 'denied' | 'undetermined';

const CHANNEL_ID = 'prayers';
const CATEGORY_ID = 'prayer-reminder';
// iOS caps pending notifications at 64; 7 days × 5 prayers = 35, comfortably under,
// and we re-sync on every foreground so the window keeps rolling forward.
const DAYS_AHEAD = 7;
const PRAYER_NOTIFICATION_IDS_KEY = 'prayerNotificationIds:v1';
let syncGeneration = 0;

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
async function requestNotificationPermission(): Promise<boolean> {
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
    // The notification LED accent = the app's brand indigo, single-sourced from the
    // design tokens (was a stale hardcoded `#46527f` left over from before the palette
    // was refined to Prussian). `palette` is the static light palette tokens.ts exposes
    // for non-themed call-sites like this one.
    lightColor: palette.accent,
  });
}

async function ensureNotificationCategory(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: 'open-prayer-times',
      buttonTitle: 'Visa bönetider',
      options: { opensAppToForeground: true },
    },
  ]);
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    return current.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unknown';
  }
}

async function loadPrayerNotificationIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PRAYER_NOTIFICATION_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function savePrayerNotificationIds(ids: readonly string[]): Promise<void> {
  await AsyncStorage.setItem(PRAYER_NOTIFICATION_IDS_KEY, JSON.stringify(ids));
}

async function cancelPrayerNotifications(): Promise<void> {
  const ids = await loadPrayerNotificationIds();
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  await AsyncStorage.removeItem(PRAYER_NOTIFICATION_IDS_KEY);
}

/**
 * Reconcile scheduled prayer notifications with the current settings + location.
 * Clears only this module's previously scheduled prayer IDs, then (if enabled and
 * permitted) schedules every selected prayer for the next {@link DAYS_AHEAD} days
 * that lies in the future. Idempotent — safe to call on any relevant change or foreground.
 */
export async function syncPrayerNotifications(
  coords: LatLng,
  settings: PrayerSettings,
): Promise<void> {
  const generation = ++syncGeneration;
  const scheduledIds: string[] = [];
  try {
    await cancelPrayerNotifications();
    if (generation !== syncGeneration) return;
    if (!settings.notifications.enabled) return;

    const granted = await requestNotificationPermission();
    if (generation !== syncGeneration) return;
    if (!granted) return;
    await ensureAndroidChannel();
    await ensureNotificationCategory();
    if (generation !== syncGeneration) return;

    // Heads-up offset: fire this many minutes before the prayer so the user can
    // set out for the mosque before the adhan. 0 = exactly at the prayer time.
    const leadMs = Math.max(0, settings.notifications.leadMinutes) * 60_000;

    const now = Date.now();
    for (let d = 0; d < DAYS_AHEAD; d++) {
      if (generation !== syncGeneration) return;
      const dayMidday = stockholmPrayerDate(now, d);
      const times = computePrayerTimes(coords, dayMidday, settings);

      for (const key of NOTIFY_PRAYERS) {
        if (!settings.notifications.prayers[key]) continue;
        const at = times[key];
        if (!(at instanceof Date) || Number.isNaN(at.getTime())) continue;
        // The alert fires `leadMs` before the prayer; the body still shows the real
        // prayer time so the user knows when it lands.
        const fireAt = new Date(at.getTime() - leadMs);
        // Skip anything already past (or within the next minute — too late to be useful).
        if (fireAt.getTime() <= now + 60_000) continue;
        if (generation !== syncGeneration) return;

        const label = PRAYER_LABELS[key as PrayerKey];
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            // Lead with the glanceable answer in the bold title — which prayer, how
            // soon — and demote the exact clock time to the lighter body as the
            // durable fact. The alert fires exactly `leadMs` before the prayer, so
            // "om N min" is correct at the moment it buzzes; with no lead offset it
            // fires at the time itself, so the message is simply "now".
            // NBSP (fast mellanslag) between the numeral and "min" so the unit can
            // never wrap away from its number in a narrow notification banner.
            title: leadMs > 0 ? `${label} om ${settings.notifications.leadMinutes} min` : `Dags för ${label}`,
            body: `Klockan ${formatTime(at)}`,
            // `true` = the OS default sound (iOS reads this; on Android the channel
            // governs). A string here would be treated as a custom bundled filename.
            sound: true,
            categoryIdentifier: CATEGORY_ID,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt,
            channelId: CHANNEL_ID,
          },
        });
        if (generation !== syncGeneration) {
          await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
          return;
        }
        scheduledIds.push(id);
      }
    }
    if (generation !== syncGeneration) {
      await Promise.all(scheduledIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
      return;
    }
    await savePrayerNotificationIds(scheduledIds);
  } catch {
    if (scheduledIds.length > 0) await savePrayerNotificationIds(scheduledIds).catch(() => undefined);
    // Notifications are a best-effort enhancement — never let a scheduling failure
    // (permissions revoked mid-flight, OS quota) crash the app.
  }
}
