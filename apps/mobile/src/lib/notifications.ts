// Local prayer notifications — the one thing a prayer app must do that a beautiful
// viewer can't: tell you it's time, even when the app is closed. We schedule the
// user's own prayer times (same adhan settings + location as everything else) as
// local notifications for a rolling window of days, and re-sync whenever the
// settings, the location, or the app's foreground state change. No server, no
// push — purely on-device, so it works offline.
import * as Notifications from 'expo-notifications';
import { storage } from './storage';
import { Platform } from 'react-native';

import { trackPermissionPrompt, trackPermissionResult } from '@/lib/analytics/permission-events';
import type { PermissionSource } from '@/lib/analytics';
import { brand } from '@/theme/tokens';
import { computeNightTimes } from './night-times';
import { alertContent, nightAlertContent } from './alert-copy';
import { computePrayerTimes, type LatLng, PRAYER_ORDER, type PrayerKey } from './prayer-times';
import type {
  NotificationSettings,
  NotificationSoundKey,
  ObligatoryPrayerKey,
  PrayerSettings,
} from './settings/types';
import { notificationSignature } from './settings/compute-signature';
import { getDisplayZone, zoneParts, zonePrayerDate } from './zone-time';

/** One of the five obligatory prayers — a slot key that is not the sunrise marker. */
export type NotifyPrayerKey = ObligatoryPrayerKey;

// The five obligatory prayers, in chronological order. Sunrise marks the end of Fajr's
// window, not a prayer — so it is offered through settings.notifications.fajrWindowEnd
// instead of living here. Keeping it OUT of this list is what makes that framing survive
// the next refactor; notifications.test.ts asserts it.
//
// FILTERED from PRAYER_ORDER rather than re-typed. As a hand-written list this was the
// quietest of the four copies of the slot key set: adding a prayer everywhere else and
// forgetting it here produces no type error anywhere — the prayer simply never notifies,
// which no screen shows and no test would think to look for.
export const NOTIFY_PRAYERS: readonly NotifyPrayerKey[] = PRAYER_ORDER.filter(
  (key): key is NotifyPrayerKey => key !== 'sunrise',
);
export type NotificationPermissionState = 'unknown' | 'granted' | 'denied' | 'undetermined';

const CATEGORY_ID = 'prayer-reminder';

/**
 * iOS: the notification-centre thread every prayer alert joins. ONE thread, not one per
 * day — the night's last third and Fajr straddle midnight, and a per-day key would split a
 * single night across two stacks. Today these are the app's only notifications, so iOS
 * already stacks them together; the key pins that, so a future non-prayer notification
 * gets its own stack instead of joining this one.
 *
 * NOT on Android. Since expo-notifications 58.1.1 the same field is an Android group key,
 * and Expo then posts a summary notification of its own above the group — an extra entry
 * nobody asked for.
 */
const PRAYER_THREAD = 'prayer-times';
const threadFields = (): { threadIdentifier?: string } =>
  Platform.OS === 'ios' ? { threadIdentifier: PRAYER_THREAD } : {};

/** Android: alarm-clock delivery when the reader opted into it (see
 *  NotificationSettings.alarmClock for the system-wide price). Nothing on iOS, which has no
 *  such distinction. */
function deliveryFor(n: NotificationSettings): { delivery?: 'alarmClock' } {
  return Platform.OS === 'android' && n.alarmClock ? { delivery: 'alarmClock' } : {};
}

/** Whether Android lets this app set exact alarms — 'unknown' when the platform cannot say. */
export type ExactAlarmState = 'granted' | 'denied' | 'unknown';

/**
 * Android's exact-alarm permission ("Alarm och påminnelser"). Always granted on iOS, below
 * Android 12, and on Android 13+ for an app declaring USE_EXACT_ALARM — which this one does
 * — so 'denied' is in practice Android 12/12L after the reader revoked it. Never throws.
 */
export async function getExactAlarmState(): Promise<ExactAlarmState> {
  try {
    const response = await Notifications.getExactAlarmPermissionsAsync();
    return response.granted ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}
const PRAYER_NOTIFICATION_IDS_KEY = 'prayerNotificationIds:v1';
const SYNC_STAMP_KEY = 'prayerNotificationSync:v1';
/** Stamped into every scheduled alert's `data` so the OS's own pending list can be used
 *  to find our notifications when the persisted id list is not trustworthy. */
const PRAYER_TAG = 'prayer-times';

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
const ADHAN_SOUND_FILE: string | null = null;
export const HAS_ADHAN_SOUND = ADHAN_SOUND_FILE !== null;
/** The sound choices THIS BUILD can actually play — drives both the settings UI and the
 *  set of Android channels created. */
export const AVAILABLE_SOUNDS: readonly NotificationSoundKey[] = HAS_ADHAN_SOUND
  ? ['default', 'silent', 'adhan']
  : ['default', 'silent'];

let syncGeneration = 0;
// Native cancellation, scheduling and storage writes must settle before the next
// reconciliation starts. A generation guard alone cannot undo a cancellation that
// was already awaiting the OS when a newer run created its replacement alarms.
let syncQueue: Promise<void> = Promise.resolve();
let channelsEnsured = false;
let categoryEnsured = false;
// A cold start always performs a real sync; the stamp only suppresses the redundant
// re-syncs that every foreground would otherwise trigger.
let firstSyncDone = false;

/** Test seam — mirrors resetNotificationLaunchCountForTests() in ./notification-hint.ts. */
export function resetSyncStateForTests(): void {
  firstSyncDone = false;
  channelsEnsured = false;
  categoryEnsured = false;
}

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

/** A persisted choice this build cannot honour degrades to the system sound. */
function resolveSound(key: NotificationSoundKey): NotificationSoundKey {
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

/** Alerts this settings object produces per FULL day: the enabled prayers plus the two
 *  optional non-prayer markers (the Fajr window closing, the night's last third). Drives
 *  the horizon — turning alerts off buys days, turning them on costs days. */
export function alertsPerDay(n: NotificationSettings): number {
  return (
    NOTIFY_PRAYERS.filter((k) => n.prayers[k]).length +
    (n.fajrWindowEnd ? 1 : 0) +
    (n.lastThird ? 1 : 0)
  );
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

/** The next alert this settings object will produce, and when it fires. */
export interface NextAlert {
  /** Which slot — a prayer key, or the night's last third, which is keyed by nothing. */
  key: PrayerKey | 'lastThird';
  /** What the alert is ABOUT: the prayer time, or the moment the last third begins. */
  at: Date;
  /** When the alert actually arrives — `at` minus the slot's lead. */
  fireAt: Date;
}

type AlertCandidate = NextAlert & { lead: number; sound: NotificationSoundKey };

function alertsForDay(
  times: ReturnType<typeof computePrayerTimes>,
  settings: NotificationSettings,
  cutoff: number,
): AlertCandidate[] {
  const alerts: AlertCandidate[] = [];
  const add = (key: NextAlert['key'], at: Date, lead: number, sound: NotificationSoundKey): void => {
    const fire = at.getTime() - lead * 60_000;
    if (Number.isFinite(fire) && fire > cutoff) {
      alerts.push({ key, at, fireAt: new Date(fire), lead, sound });
    }
  };

  for (const key of PRAYER_ORDER) {
    if (isAlertEnabled(settings, key)) add(key, times[key], Math.max(0, settings.lead[key]), settings.sound[key]);
  }
  if (settings.lastThird) {
    const at = computeNightTimes(times).lastThird;
    if (at) add('lastThird', at, 0, settings.lastThirdSound);
  }
  return alerts;
}

/**
 * When will the next reminder actually arrive?
 *
 * The Påminnelser screen lets a reader set a lead per prayer, a sound per prayer, a
 * Fajr-window marker and a night alert, and used to show none of them landing anywhere:
 * changing a lead from 0 to 20 moved the string "20 min innan" and nothing else, while
 * the scheduling itself happens silently in a root-level effect. A setting whose effect
 * the reader cannot see is a setting they cannot judge — the same reason the calculation
 * screen grew a pinned preview strip.
 *
 * Derived from the scheduler's OWN rules rather than a second opinion about them, so the
 * two cannot drift: {@link isAlertEnabled} decides which slots count, the lead is
 * subtracted exactly as {@link syncPrayerNotifications} subtracts it, and every future
 * fire time is eligible. Candidates from yesterday, today
 * and tomorrow are collected and the earliest wins, because a lead can pull an alert
 * across midnight and the night's last third belongs to the day whose evening began it.
 *
 * Pure — no OS, no permission read. Returns null when nothing is scheduled at all
 * (reminders off, every slot off, or a polar day where no time resolves).
 */
export function nextAlertAt(
  coords: LatLng,
  settings: PrayerSettings,
  now: number,
): NextAlert | null {
  const n = settings.notifications;
  if (!n.enabled) return null;

  let best: NextAlert | null = null;
  // The previous evening can still own an upcoming Isha or last-third alert.
  for (let d = -1; d < 2; d++) {
    const times = computePrayerTimes(coords, zonePrayerDate(now, d), settings);
    for (const { key, at, fireAt } of alertsForDay(times, n, now)) {
      if (best === null || fireAt < best.fireAt) best = { key, at, fireAt };
    }
  }
  return best;
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
  // Idempotent on the OS side, but it is still a bridge round-trip on every sync and
  // the category never changes within a session — same posture as the channels.
  if (categoryEnsured) return;
  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: 'open-prayer-times',
      buttonTitle: 'Visa bönetider',
      options: { opensAppToForeground: true },
    },
  ]);
  categoryEnsured = true;
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
 * exactly three entry points, each a direct tap: the introduction's notification step,
 * the map's notification hint and the Inställningar toggle. `source` says which, for the
 * Permission Prompt Shown / Permission Result events.
 *
 * Returns the settled state so the caller can react to the user's answer in the same
 * turn as their tap — no polling, no lag.
 */
export async function requestNotificationPermission(
  source: PermissionSource,
): Promise<NotificationPermissionState> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (isAllowed(current)) {
      trackPermissionResult('notifications', source, true, false);
      return 'granted';
    }
    // Already refused at the OS level: asking again is a silent no-op, so report the
    // truth and let the caller offer the system-settings route instead.
    if (!current.canAskAgain) {
      trackPermissionResult('notifications', source, false, false);
      return 'denied';
    }
    // The channels must exist BEFORE the prompt on Android 13+ — expo's own permission
    // example creates one first, noting "a channel is needed for the permissions prompt
    // to appear". Requesting first and creating afterwards can leave the
    // POST_NOTIFICATIONS dialog unshown.
    await ensureAndroidChannels();
    trackPermissionPrompt('notifications', source);
    const next = await Notifications.requestPermissionsAsync({
      // Alert + sound only. The handler above never sets a badge and nothing in the app
      // writes a badge count, so asking for badge authorization would claim a capability
      // we never use. Ask for exactly what we exercise.
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    const granted = isAllowed(next);
    trackPermissionResult('notifications', source, granted, true);
    return granted ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

async function loadPrayerNotificationIds(): Promise<string[]> {
  try {
    const raw = await storage.getItem(PRAYER_NOTIFICATION_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function savePrayerNotificationIds(ids: readonly string[]): Promise<void> {
  await storage.setItem(PRAYER_NOTIFICATION_IDS_KEY, JSON.stringify(ids));
}

async function cancelByIds(ids: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  // Do not create a replacement horizon while an old alarm could still fire. Wait
  // for every cancellation, retain the saved IDs, and let the next sync retry.
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Could not cancel every prayer notification');
  }
}

/**
 * Every pending alert THIS module is responsible for.
 *
 * The persisted id list is the fast path, not the truth. It can be missing while the
 * OS still holds the notifications: a failed storage write, a crash between
 * scheduling and persisting, a superseded sync that saved on the error path, or the
 * user clearing app storage (Android) — the alarms and UNNotificationRequests survive
 * all of those. Orphans are not cosmetic: the next sync would schedule a SECOND full
 * set, so every prayer alerts twice, and on iOS — which keeps only the 64 soonest
 * pending requests — the orphans push genuine later alerts silently off the end.
 *
 * So the OS's own pending list is swept for anything carrying our `source` tag and
 * unioned in. The tag is what keeps this from cancelling notifications the app might
 * schedule for some other purpose later; alerts from builds before the tag existed are
 * still covered by the stored ids, which those builds wrote under the same key.
 */
async function reconcilePendingIds(desired: Set<string>, retained: Map<string, string>): Promise<void> {
  const ids = new Set(await loadPrayerNotificationIds());
  try {
    for (const request of await Notifications.getAllScheduledNotificationsAsync()) {
      const data = request?.content?.data;
      if (data?.source !== PRAYER_TAG) continue;
      const identity = data.alertIdentity;
      if (typeof identity === 'string' && desired.has(identity) && !retained.has(identity)) {
        retained.set(identity, request.identifier);
        ids.delete(request.identifier);
      } else {
        ids.add(request.identifier);
      }
    }
  } catch {
    // Enumeration unavailable (older OS surface, native error) — the stored list alone
    // still covers every normal run.
  }
  await cancelByIds([...ids]);
  if (retained.size) await savePrayerNotificationIds([...retained.values()]);
  else await storage.removeItem(PRAYER_NOTIFICATION_IDS_KEY);
}

/**
 * What the last successful sync covered. The day component makes the window roll
 * forward once per calendar day; the signature and coordinate catch a real
 * change. Coordinates are rounded to ~100 m — finer is meaningless for prayer times and
 * would defeat the stamp entirely on a device with jittery GPS.
 *
 * ⚠️ THE ZONE IS IN HERE FOR THE BODY TEXT, NOT THE TRIGGERS. A reader who lands in another
 * country keeps the same trigger INSTANTS — those come from the coordinate and the calendar
 * date, both of which the stamp already carries. What moves is what the alert SAYS: its body
 * is built with formatTime, so a notification scheduled in Stockholm and delivered in Mecka
 * would announce the Stockholm clock time for a prayer arriving on the Mecka one. Without
 * the zone here that text stays wrong until the calendar date happens to roll over.
 */
function syncStampFor(coords: LatLng, settings: PrayerSettings, exact: ExactAlarmState): string {
  const { y, mo, d } = zoneParts(Date.now());
  return JSON.stringify([
    `${y}-${mo}-${d}`,
    getDisplayZone(),
    notificationSignature(settings),
    `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}`,
    // Android fixes an alarm's delivery path when it is SET: without the permission it is
    // inexact, and granting it later does not upgrade alarms already scheduled. So a grant
    // must count as a change, or every alert stays inexact until the date rolls over.
    // 'unknown' counts as exact, so a read that fails in the background cannot make the
    // stamp flap and re-plan the whole horizon on every wake-up.
    exact === 'denied' ? 'inexact' : 'exact',
  ]);
}

/**
 * Reconcile scheduled prayer notifications with the current settings + location.
 * Keeps one matching pending request per alert, cancels obsolete prayer requests,
 * and fills the remaining slots within the platform's pending-notification budget. Idempotent — safe to call on any relevant change
 * or foreground. Returns false if the reconciliation failed.
 */
export function syncPrayerNotifications(
  coords: LatLng,
  settings: PrayerSettings,
): Promise<boolean> {
  const generation = ++syncGeneration;
  const sync = syncQueue.then(async () => {
    if (generation !== syncGeneration) return true;
    await reconcilePrayerNotifications(coords, settings, generation);
    return true;
  });
  // A failed best-effort reconciliation must never poison subsequent requests.
  syncQueue = sync.then(() => undefined, () => undefined);
  return sync.catch(() => false);
}

async function reconcilePrayerNotifications(
  coords: LatLng,
  settings: PrayerSettings,
  generation: number,
): Promise<void> {
  const retained = new Map<string, string>();
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
    const exact = await getExactAlarmState();
    const stamp = syncStampFor(coords, settings, exact);
    if (firstSyncDone) {
      const previous = await storage.getItem(SYNC_STAMP_KEY).catch(() => null);
      if (previous === stamp) return;
    }

    if (generation !== syncGeneration) return;
    // The persisted stamp describes the alarms we are about to remove. Invalidate
    // its session cache BEFORE touching them: A → B → A must rebuild A if B was
    // superseded after cancelling it, even though the saved stamp still says A.
    firstSyncDone = false;
    const perDay = alertsPerDay(n);
    if (!n.enabled || perDay === 0) {
      await reconcilePendingIds(new Set(), retained);
      return;
    }

    // CHECK, never ask. This runs on mount and on every foreground, so prompting from
    // here would fire the OS dialog with no tap behind it — and spend iOS's single
    // lifetime prompt on a moment the user never asked for. Permission is requested only
    // from requestNotificationPermission(), which is wired to explicit taps.
    const permission = await Notifications.getPermissionsAsync();
    if (generation !== syncGeneration) return;
    if (!isAllowed(permission)) {
      await reconcilePendingIds(new Set(), retained);
      return;
    }
    await ensureAndroidChannels();
    await ensureNotificationCategory();
    if (generation !== syncGeneration) return;

    const budget = Platform.OS === 'ios' ? IOS_PENDING_BUDGET : ANDROID_PENDING_BUDGET;
    // The +1 day reclaims the PARTIAL first day (today's already-past alerts are
    // skipped); the in-loop budget check below is the hard cap that actually protects
    // the platform limit.
    const maxDays = Math.min(MAX_DAYS_AHEAD, horizonDays(perDay, budget) + 1);

    const now = Date.now();
    // One calendar resolve for the whole horizon: zonePrayerDate(now, d)
    // would re-derive the SAME Stockholm Y/M/D from `now` (an Intl format) on each
    // iteration. Resolve day 0 once and step the calendar locally — the Date constructor
    // rolls month/year boundaries exactly like the helper's own d+offset.
    const day0 = zonePrayerDate(now);
    const days: (AlertCandidate & { identity: string })[][] = [];
    const desired = new Set<string>();
    for (let d = -1; d < maxDays && desired.size < budget; d++) {
      const date = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + d, 12);
      const times = computePrayerTimes(coords, date, settings);
      const day = [];
      for (const alert of alertsForDay(times, n, now)) {
        const identity = JSON.stringify([alert.key, alert.fireAt.getTime(), alert.lead,
          alert.sound, getDisplayZone(), deliveryFor(n), exact === 'denied']);
        if (desired.has(identity)) continue;
        day.push({ ...alert, identity });
        desired.add(identity);
        if (desired.size === budget) break;
      }
      days.push(day);
    }

    await reconcilePendingIds(desired, retained);
    for (const day of days) {
      if (generation !== syncGeneration) {
        await bailStale();
        return;
      }
      const batch: Promise<string>[] = [];
      for (const { key, at, fireAt, lead, sound, identity } of day) {
        if (retained.has(identity) || fireAt.getTime() <= Date.now()) continue;
        batch.push(
          Notifications.scheduleNotificationAsync({
            content: {
              ...(key === 'lastThird' ? nightAlertContent(at) : alertContent(key, at, lead)),
              sound: iosSoundFor(sound),
              // The foreground handler reads silent and a later sync finds requests by source.
              data: { key, silent: resolveSound(sound) === 'silent', source: PRAYER_TAG, alertIdentity: identity },
              interruptionLevel: 'timeSensitive',
              categoryIdentifier: CATEGORY_ID,
              ...threadFields(),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: fireAt,
              channelId: channelIdFor(sound),
              ...deliveryFor(n),
            },
          }),
        );
      }

      // A rejected sibling must not make us abandon successful or still-pending
      // requests. Collect every ID before cleanup/persistence or the next sync.
      const results = await Promise.allSettled(batch);
      for (const result of results) {
        if (result.status === 'fulfilled') scheduledIds.push(result.value);
      }
      if (results.some((result) => result.status === 'rejected')) {
        throw new Error('Could not schedule every prayer notification');
      }
    }
    if (generation !== syncGeneration) {
      await bailStale();
      return;
    }
    await savePrayerNotificationIds([...retained.values(), ...scheduledIds]);
    // Stamp only on the success path, so a failed or bailed run always re-syncs.
    await storage.setItem(SYNC_STAMP_KEY, stamp);
    firstSyncDone = true;
  } catch (error) {
    // Notifications are a best-effort enhancement — never let a scheduling failure
    // (permissions revoked mid-flight, OS quota) crash the app. If this run is still
    // the current one, save whatever was scheduled so the next sync can cancel it;
    // if a newer sync has taken over, saving would CLOBBER its saved ids (orphaning
    // them), so cancel this run's notifications instead.
    if (generation === syncGeneration) {
      if (scheduledIds.length > 0) await savePrayerNotificationIds([...retained.values(), ...scheduledIds]).catch(() => undefined);
    } else {
      await cancelByIds(scheduledIds);
    }
    throw error;
  }
}
