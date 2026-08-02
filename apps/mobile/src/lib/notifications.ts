// Local prayer notifications — the one thing a prayer app must do that a beautiful
// viewer can't: tell you it's time, even when the app is closed. We schedule the
// user's own prayer times (same adhan settings + location as everything else) as
// local notifications for a rolling window of days, and re-sync whenever the
// settings, the location, or the app's foreground state change. No server, no
// push — purely on-device, so it works offline.
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { brand } from '@/theme/tokens';
import {
  computePrayerTimes,
  formatTime,
  type LatLng,
  PRAYER_LABELS,
  PRAYER_ORDER,
  type PrayerKey,
} from './prayer-times';
import type { NotificationSettings, NotificationSoundKey, PrayerSettings } from './settings/types';
import { notificationSignature } from './settings/compute-signature';
import { stockholmParts, stockholmPrayerDate } from './stockholm-time';

// The five obligatory prayers. Sunrise marks the end of Fajr's window, not a prayer
// — so it is offered through settings.notifications.fajrWindowEnd instead of living
// here. Keeping it OUT of this constant is what makes that framing survive the next
// refactor; notifications.test.ts asserts it.
export const NOTIFY_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
export type NotifyPrayerKey = (typeof NOTIFY_PRAYERS)[number];
export type NotificationPermissionState = 'unknown' | 'granted' | 'denied' | 'undetermined';

const CATEGORY_ID = 'prayer-reminder';
const PRAYER_NOTIFICATION_IDS_KEY = 'prayerNotificationIds:v1';
const SYNC_STAMP_KEY = 'prayerNotificationSync:v1';

// An Android channel's SOUND is frozen at creation — it can never be changed — so a
// sound choice IS a channel. The ids are versioned from the start so the next time
// importance or vibration needs to change, that too is a fresh id rather than another
// migration. v1 was the single 'prayers' channel.
const CHANNEL_VERSION = 2;
const LEGACY_CHANNEL_ID = 'prayers';
const CHANNEL_GROUP_ID = 'prayers';

// iOS keeps at most 64 PENDING notification requests per app and silently drops the
// rest; 60 leaves headroom. Android has no such cap, but AlarmManager gets unhappy
// somewhere past ~500 exact alarms, and every one is re-registered on boot.
const IOS_PENDING_BUDGET = 60;
const ANDROID_PENDING_BUDGET = 400;
// Past a month a schedule is likelier to be stale (the user moved, changed method)
// than useful, so this caps the horizon however much budget is left over.
export const MAX_DAYS_AHEAD = 30;

/**
 * The bundled adhan filename, or null until an audio file ships. Flipping this needs an
 * `eas build` — the file is a native bundle resource (iOS) / res/raw entry (Android)
 * written by the expo-notifications config plugin, never an OTA update.
 */
export const ADHAN_SOUND_FILE: string | null = null;
export const HAS_ADHAN_SOUND = ADHAN_SOUND_FILE !== null;
/** The sound choices THIS BUILD can actually play — drives both the settings UI and the
 *  set of Android channels created. */
export const AVAILABLE_SOUNDS: readonly NotificationSoundKey[] = HAS_ADHAN_SOUND
  ? ['default', 'silent', 'adhan']
  : ['default', 'silent'];

let syncGeneration = 0;
let channelsEnsured = false;
// A cold start always performs a real sync; the stamp only suppresses the redundant
// re-syncs that every foreground would otherwise trigger.
let firstSyncDone = false;

/** Test seam — mirrors resetNotificationLaunchCountForTests() in ./notification-hint.ts. */
export function resetSyncStateForTests(): void {
  firstSyncDone = false;
  channelsEnsured = false;
}

// Show prayer alerts even when the app is foregrounded (the user may be staring at
// the map when Asr lands). Set once at module load.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // A "Tyst" alert must stay silent even with the app open. This handler overrides
    // both the Android channel and the iOS content sound, so hard-coding
    // shouldPlaySound: true here (what this used to do) would make every silent choice
    // audible the moment the app happened to be foregrounded. The flag rides on the
    // scheduled content — see the `data` field in syncPrayerNotifications.
    //
    // Known limitation, not a bug: because this overrides channel sounds, a future
    // adhan alert arriving in-foreground plays the default tone instead.
    const silent = notification.request.content.data?.silent === true;
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: !silent,
      shouldSetBadge: false,
    };
  },
});

/** A persisted choice this build cannot honour degrades to the system sound. */
export function resolveSound(key: NotificationSoundKey): NotificationSoundKey {
  return key === 'adhan' && !HAS_ADHAN_SOUND ? 'default' : key;
}

/** iOS reads content.sound: false = silent, true = the system default, a string = a
 *  filename bundled by the expo-notifications config plugin's `sounds` array. */
function iosSoundFor(key: NotificationSoundKey): boolean | string {
  const s = resolveSound(key);
  if (s === 'silent') return false;
  if (s === 'adhan' && ADHAN_SOUND_FILE) return ADHAN_SOUND_FILE;
  return true;
}

/** Android reads the CHANNEL, never the notification, from API 26 up. */
export function channelIdFor(key: NotificationSoundKey): string {
  return `prayers-${resolveSound(key)}-v${CHANNEL_VERSION}`;
}

/** Whether an alert is enabled for a slot. Sunrise is gated by its own flag — the
 *  framing that keeps it a marker rather than a sixth prayer. */
export function isAlertEnabled(n: NotificationSettings, key: PrayerKey): boolean {
  return key === 'sunrise' ? n.fajrWindowEnd : n.prayers[key];
}

/** Alerts this settings object produces per FULL day: the enabled prayers plus the
 *  optional Fajr-window marker. Drives the horizon — turning prayers off buys days. */
export function alertsPerDay(n: NotificationSettings): number {
  return NOTIFY_PRAYERS.filter((k) => n.prayers[k]).length + (n.fajrWindowEnd ? 1 : 0);
}

/**
 * How many days of alerts fit under the platform's pending-notification budget, given
 * how many fire per day. Pure and exported so the horizon math is testable without the
 * OS. Clamped to {@link MAX_DAYS_AHEAD} so a user with a single prayer enabled doesn't
 * pin two months of stale alarms.
 */
export function horizonDays(perDay: number, budget: number): number {
  if (perDay <= 0) return 0;
  return Math.max(1, Math.min(MAX_DAYS_AHEAD, Math.floor(budget / perDay)));
}

/**
 * Title + body for one alert. Extracted as a pure function so the Swedish copy contract
 * is testable without running the scheduler. NBSP (fast mellanslag) between the numeral
 * and "min" so the unit can never wrap away from its number in a narrow banner.
 */
export function alertContent(
  key: PrayerKey,
  at: Date,
  lead: number,
): { title: string; body: string } {
  if (key === 'sunrise') {
    return {
      title: lead > 0 ? `Fajr-tiden slutar om ${lead} min` : 'Fajr-tiden är slut',
      body: `Soluppgång ${formatTime(at)}`,
    };
  }
  const label = PRAYER_LABELS[key];
  return {
    // Lead with the glanceable answer in the bold title — which prayer, how soon — and
    // demote the exact clock time to the lighter body as the durable fact.
    title: lead > 0 ? `${label} om ${lead} min` : `Dags för ${label}`,
    body: `Klockan ${formatTime(at)}`,
  };
}

/**
 * Will the OS actually deliver our alerts?
 *
 * `status.granted` alone is NOT the answer on iOS: provisional authorization (the
 * "quiet" tier, where notifications land in the notification centre without ever
 * interrupting) reports `granted: false` while still delivering everything we
 * schedule. Reading only `.granted` would tell a provisional user their prayer
 * reminders are blocked while they are in fact arriving.
 */
function isAllowed(status: Notifications.NotificationPermissionsStatus): boolean {
  return (
    status.granted || status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

const CHANNEL_META: Record<NotificationSoundKey, { name: string; description: string }> = {
  default: {
    name: 'Bönetider – standardljud',
    description: 'Påminnelser med systemets notisljud.',
  },
  silent: { name: 'Bönetider – tyst', description: 'Påminnelser som visas utan ljud.' },
  adhan: { name: 'Bönetider – adhan', description: 'Påminnelser med ett kort böneutrop.' },
};

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (channelsEnsured) return;
  // One group, so the categories nest under "Bönetider" in Android's notification
  // settings instead of sitting as unrelated top-level rows.
  await Notifications.setNotificationChannelGroupAsync(CHANNEL_GROUP_ID, { name: 'Bönetider' });
  // The pre-v2 single channel can never be given a different sound (Android freezes a
  // channel's sound at creation), so it is RETIRED rather than reused — otherwise it
  // lingers as a permanently-unused category in the user's system settings. Deleting is
  // idempotent, and safe precisely because these ids are never recycled: recreating a
  // deleted id would resurrect the user's old, possibly muted, channel settings.
  await Notifications.deleteNotificationChannelAsync(LEGACY_CHANNEL_ID).catch(() => undefined);
  for (const sound of AVAILABLE_SOUNDS) {
    await Notifications.setNotificationChannelAsync(channelIdFor(sound), {
      name: CHANNEL_META[sound].name,
      description: CHANNEL_META[sound].description,
      groupId: CHANNEL_GROUP_ID,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 120, 250],
      // The channel accent is the MARK's blue, not the UI accent — this colour tints
      // the app's glyph in the Android shade, so it is the logo speaking, and it has to
      // match `expo-notifications.color` in app.json (both are `brand.blue.light`).
      // They used to disagree: app.json said #2a557f while this said accent #33437a, two
      // blues 20° apart on one notification. The LIGHT variant specifically — a channel's
      // colour is frozen at creation and lives in the OS shade, so it cannot follow the
      // app's theme.
      lightColor: brand.blue.light,
      // The `sound` key carries a THREE-way contract in expo's native channel manager
      // (AndroidXNotificationsChannelManager): key ABSENT → the system default tone;
      // key present and NULL → no sound at all; key present with a string → a res/raw
      // basename. All three cases are load-bearing here, which is why 'default' spreads
      // nothing rather than passing some "default" string.
      ...(sound === 'default' ? {} : { sound: sound === 'silent' ? null : ADHAN_SOUND_FILE }),
    });
  }
  channelsEnsured = true;
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

/** Read the current permission WITHOUT prompting — safe to call on any render. */
export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (isAllowed(current)) return 'granted';
    return current.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unknown';
  }
}

/**
 * Fire the OS permission prompt. **Only ever call this from an explicit user gesture** —
 * iOS grants exactly one prompt per install, and once it is spent the only way back is
 * the system Settings app. Everything else in this module reads the permission instead
 * (see getNotificationPermissionState / syncPrayerNotifications), so the dialog has
 * exactly two entry points, both a direct tap: the map's notification hint and the
 * Inställningar toggle.
 *
 * Returns the settled state so the caller can react to the user's answer in the same
 * turn as their tap — no polling, no lag.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (isAllowed(current)) return 'granted';
    // Already refused at the OS level: asking again is a silent no-op, so report the
    // truth and let the caller offer the system-settings route instead.
    if (!current.canAskAgain) return 'denied';
    // The channels must exist BEFORE the prompt on Android 13+ — expo's own permission
    // example creates one first, noting "a channel is needed for the permissions prompt
    // to appear". Requesting first and creating afterwards can leave the
    // POST_NOTIFICATIONS dialog unshown.
    await ensureAndroidChannels();
    const next = await Notifications.requestPermissionsAsync({
      // Alert + sound only. The handler above never sets a badge and nothing in the app
      // writes a badge count, so asking for badge authorization would claim a capability
      // we never use. Ask for exactly what we exercise.
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    return isAllowed(next) ? 'granted' : 'denied';
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

async function cancelByIds(ids: readonly string[]): Promise<void> {
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

async function cancelPrayerNotifications(): Promise<void> {
  const ids = await loadPrayerNotificationIds();
  await cancelByIds(ids);
  await AsyncStorage.removeItem(PRAYER_NOTIFICATION_IDS_KEY);
}

/**
 * What the last successful sync covered. The day component makes the window roll
 * forward once per Stockholm calendar day; the signature and coordinate catch a real
 * change. Coordinates are rounded to ~100 m — finer is meaningless for prayer times and
 * would defeat the stamp entirely on a device with jittery GPS.
 */
function syncStampFor(coords: LatLng, settings: PrayerSettings): string {
  const { y, mo, d } = stockholmParts(Date.now());
  return JSON.stringify([
    `${y}-${mo}-${d}`,
    notificationSignature(settings),
    `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}`,
  ]);
}

/**
 * Reconcile scheduled prayer notifications with the current settings + location.
 * Clears only this module's previously scheduled prayer IDs, then (if enabled and
 * permitted) schedules every selected alert for as many days ahead as the platform's
 * pending-notification budget allows. Idempotent — safe to call on any relevant change
 * or foreground.
 */
export async function syncPrayerNotifications(
  coords: LatLng,
  settings: PrayerSettings,
): Promise<void> {
  const generation = ++syncGeneration;
  const scheduledIds: string[] = [];
  // A newer sync has taken over: this run's notifications must not survive. The newer
  // run's own cancel pass can't see them (they were never saved), so cancelling them
  // here is the only thing standing between a superseded sync and duplicate alerts.
  const bailStale = async (): Promise<void> => {
    await cancelByIds(scheduledIds);
  };
  try {
    const n = settings.notifications;

    // This runs on mount AND on every foreground. At the old 7×5 that was 35 cancels +
    // 35 schedules each time; at a 30-day Android horizon it would be 180 + 180, a dozen
    // times a day — a real battery and latency cost. Skip when nothing that matters has
    // changed since the last SUCCESSFUL sync. A cold start always does the real thing.
    const stamp = syncStampFor(coords, settings);
    if (firstSyncDone) {
      const previous = await AsyncStorage.getItem(SYNC_STAMP_KEY).catch(() => null);
      if (previous === stamp) return;
    }

    await cancelPrayerNotifications();
    if (generation !== syncGeneration) return;
    if (!n.enabled) return;

    const perDay = alertsPerDay(n);
    if (perDay === 0) return; // nothing enabled — the cancel pass above already ran

    // CHECK, never ask. This runs on mount and on every foreground, so prompting from
    // here would fire the OS dialog with no tap behind it — and spend iOS's single
    // lifetime prompt on a moment the user never asked for. Permission is requested only
    // from requestNotificationPermission(), which is wired to explicit taps.
    const permission = await Notifications.getPermissionsAsync();
    if (generation !== syncGeneration) return;
    if (!isAllowed(permission)) return;
    await ensureAndroidChannels();
    await ensureNotificationCategory();
    if (generation !== syncGeneration) return;

    const budget = Platform.OS === 'ios' ? IOS_PENDING_BUDGET : ANDROID_PENDING_BUDGET;
    // The +1 day reclaims the PARTIAL first day (today's already-past alerts are
    // skipped); the in-loop budget check below is the hard cap that actually protects
    // the platform limit.
    const maxDays = Math.min(MAX_DAYS_AHEAD, horizonDays(perDay, budget) + 1);

    const now = Date.now();
    // One Stockholm calendar resolve for the whole horizon: stockholmPrayerDate(now, d)
    // would re-derive the SAME Stockholm Y/M/D from `now` (an Intl format) on each
    // iteration. Resolve day 0 once and step the calendar locally — the Date constructor
    // rolls month/year boundaries exactly like the helper's own d+offset.
    const day0 = stockholmPrayerDate(now);
    for (let d = 0; d < maxDays; d++) {
      if (scheduledIds.length + 1 > budget) break;
      if (generation !== syncGeneration) {
        await bailStale();
        return;
      }
      const dayMidday = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + d, 12, 0, 0, 0);
      const times = computePrayerTimes(coords, dayMidday, settings);

      // One day's alerts go out as ONE batch — 30 days × 6 slots would otherwise be 180
      // serial bridge round-trips. The batch is small and bounded (≤ 6), so the
      // generation guard between days still bounds how far a superseded sync can
      // over-schedule, and bailStale cancels whatever the last batch created. Do NOT
      // flatten the whole horizon into one Promise.all: the guard would go blind for the
      // entire run.
      const batch: Promise<string>[] = [];
      for (const key of PRAYER_ORDER) {
        if (!isAlertEnabled(n, key)) continue;
        if (scheduledIds.length + batch.length >= budget) break;
        const at = times[key];
        if (!(at instanceof Date) || Number.isNaN(at.getTime())) continue;
        const lead = Math.max(0, n.lead[key]);
        // The alert fires `lead` minutes before the time; the body still shows the real
        // time so the user knows when it lands.
        const fireAt = new Date(at.getTime() - lead * 60_000);
        // Skip anything already past (or within the next minute — too late to be useful).
        if (fireAt.getTime() <= now + 60_000) continue;

        const sound = n.sound[key];
        batch.push(
          Notifications.scheduleNotificationAsync({
            content: {
              ...alertContent(key, at, lead),
              sound: iosSoundFor(sound),
              // Read back by the foreground handler, which would otherwise force sound on.
              data: { key, silent: resolveSound(sound) === 'silent' },
              // Prayer times are the textbook Time Sensitive case: the alert must break
              // through Focus, Sleep and Do Not Disturb — a prayer reminder that a Focus
              // mode silences has failed at the app's one job. Kept even for a SILENT
              // choice: the user asked for quiet, not for suppressed. iOS honours this
              // level ONLY with the matching entitlement (app.json → ios.entitlements);
              // without it the level silently degrades to 'active'. On Android the
              // HIGH-importance channel already carries the equivalent weight.
              interruptionLevel: 'timeSensitive',
              categoryIdentifier: CATEGORY_ID,
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: fireAt,
              channelId: channelIdFor(sound),
            },
          }),
        );
      }
      scheduledIds.push(...(await Promise.all(batch)));
    }
    if (generation !== syncGeneration) {
      await bailStale();
      return;
    }
    await savePrayerNotificationIds(scheduledIds);
    // Stamp only on the success path, so a failed or bailed run always re-syncs.
    await AsyncStorage.setItem(SYNC_STAMP_KEY, stamp).catch(() => undefined);
    firstSyncDone = true;
  } catch {
    // Notifications are a best-effort enhancement — never let a scheduling failure
    // (permissions revoked mid-flight, OS quota) crash the app. If this run is still
    // the current one, save whatever was scheduled so the next sync can cancel it;
    // if a newer sync has taken over, saving would CLOBBER its saved ids (orphaning
    // them), so cancel this run's notifications instead.
    if (generation === syncGeneration) {
      if (scheduledIds.length > 0) await savePrayerNotificationIds(scheduledIds).catch(() => undefined);
    } else {
      await cancelByIds(scheduledIds);
    }
  }
}
