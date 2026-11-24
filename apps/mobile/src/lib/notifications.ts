// Local prayer notifications — the one thing a prayer app must do that a beautiful
// viewer can't: tell you it's time, even when the app is closed. We schedule the
// user's own prayer times (same adhan settings + location as everything else) as
// local notifications for a rolling window of days, and re-sync whenever the
// settings, the location, or the app's foreground state change. No server, no
// push — purely on-device, so it works offline.
import { markSetupHandoff, recoveryVisit } from './analytics/return-setup';
import { uuid } from 'expo';
import * as Notifications from 'expo-notifications';
import { storage } from './storage';
import { REMINDERS_DECLINED_KEY } from './notification-hint';
import { Platform } from 'react-native';

import { trackPermissionPrompt, trackPermissionResult } from '@/lib/analytics/permission-events';
import type { PermissionSource } from '@/lib/analytics';
import { brand } from '@/theme/tokens';
import { computeNightTimes } from './night-times';
import { alertContent, nightAlertContent, NOTIFICATION_TEXT_VERSION } from './alert-copy';
import { computePrayerTimes, type LatLng, PRAYER_ORDER, type PrayerKey } from './prayer-times';
import type {
  NotificationSettings,
  NotificationSoundKey,
  ObligatoryPrayerKey,
  PrayerSettings,
} from './settings/types';
import { computeSignature, notificationSignature } from './settings/compute-signature';
import { getDisplayZone, zonePrayerDate } from './zone-time';

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
const ANDROID_PROMPT_SHOWN_KEY = 'notificationPermissionAsked:v1';

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
/** Stamped into every scheduled alert's `data` so the OS's own pending list can be used
 *  to find our notifications when the persisted id list is not trustworthy. */
const PRAYER_TAG = 'prayer-times';

// An Android channel's SOUND is frozen at creation — it can never be changed — so a
// sound choice IS a channel. The ids are versioned from the start so the next time
// importance or vibration needs to change, that too is a fresh id rather than another
// migration. v1 was the single 'prayers' channel.
const CHANNEL_VERSION: number = 2;
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
let currentSync: { key: string; result: Promise<boolean>; force: boolean } | null = null;
let syncQueue: Promise<void> = Promise.resolve();
let channelsEnsured = false;
let categoryEnsured = false;
// Expo retains request records even when reboot/package-update rearming fails.
// Only this process's successful AlarmManager calls can substantiate those records.
const registeredAndroidAlarms = new Set<string>();

/** Test seam — mirrors resetNotificationLaunchCountForTests() in ./notification-hint.ts. */
export function resetSyncStateForTests(): void {
  registeredAndroidAlarms.clear();
  channelsEnsured = false;
  categoryEnsured = false;
}

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

function fullyAuthorized(status: Notifications.NotificationPermissionsStatus): boolean {
  return Platform.OS === 'ios'
    ? status.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    : status.granted;
}

/** A saved OS handoff may finish after process death. This read can never open a dialog. */
export async function readReminderAuthorization(): Promise<NotificationPermissionState> {
  try {
    const state = await Notifications.getPermissionsAsync();
    if (fullyAuthorized(state)) return 'granted';
    if (Platform.OS === 'android' && state.canAskAgain && !await storage.getItem(ANDROID_PROMPT_SHOWN_KEY)) return 'undetermined';
    return state.status === 'denied' || !state.canAskAgain || isAllowed(state) ? 'denied' : 'undetermined';
  } catch {
    return 'unknown';
  }
}

/** Next deliverable occurrence of each switch, including tomorrow and a late previous Isha. */
export function upcomingPrayerAlerts(coords: LatLng, settings: PrayerSettings, now: number): NextAlert[] {
  const alerts: NextAlert[] = [];
  for (let d = -1; d <= 1; d++) {
    const times = computePrayerTimes(coords, zonePrayerDate(now, d), settings);
    alerts.push(...alertsForDay(times, settings.notifications, now));
  }
  return alerts.filter(a => a.key !== 'sunrise' && a.key !== 'lastThird')
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

// Expo converts iOS DATE inputs to relative UNTimeIntervalNotificationTriggers.
// Calendar components keep the absolute instant readable from a pending iOS request.
function datedTrigger(date: Date, channelId: string, n: NotificationSettings): Notifications.NotificationTriggerInput {
  if (Platform.OS === 'ios') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR, timezone: 'UTC', repeats: false,
      year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
      hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(),
    };
  }
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId, ...deliveryFor(n) };
}

function nativeFireTime(trigger: Notifications.NotificationRequest['trigger']): number | null {
  if (!trigger || !('type' in trigger)) return null;
  if (trigger.type === 'date' && 'value' in trigger && typeof trigger.value === 'number' && Number.isFinite(trigger.value)) return trigger.value;
  if (trigger.type !== 'calendar' || !('dateComponents' in trigger) || trigger.repeats) return null;
  const parts = trigger.dateComponents;
  if (!parts || typeof parts !== 'object') return null;
  const { timeZone, year, month, day, hour, minute, second } = parts as Partial<Notifications.CalendarNotificationTrigger['dateComponents']>;
  if ((timeZone !== 'UTC' && timeZone !== 'GMT') || year == null || month == null ||
    day == null || hour == null || minute == null || second == null) return null;
  const time = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isFinite(time) ? time : null;
}

function prayerDateKey(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
}

// UNCalendarNotificationTrigger exposes whole seconds. Some calculated times
// (including the last third of the night) have fractional seconds.
function scheduledInstant(date: Date): number {
  const time = date.getTime();
  return Platform.OS === 'ios' ? Math.floor(time / 1000) * 1000 : time;
}

function civilSlot(key: string, at: number) {
  return prayerDateKey(zonePrayerDate(at)) + '/' + key;
}

// Build the native payload once. Its trigger and rendered content are also the
// inputs to the ID, so a payload change cannot silently reuse an old alarm.
function planPrayerRequest(context: string, date: Date, alert: AlertCandidate, n: NotificationSettings, exact: ExactAlarmState) {
  const { key, at, fireAt, lead, sound } = alert;
  const prayerDate = prayerDateKey(date);
  const channel = channelIdFor(sound);
  const trigger = datedTrigger(fireAt, channel, n);
  const content = {
    ...(key === 'lastThird' ? nightAlertContent(at) : alertContent(key, at, lead)),
    sound: iosSoundFor(sound), interruptionLevel: 'timeSensitive' as const, categoryIdentifier: CATEGORY_ID, ...threadFields(),
  };
  const selected = key === 'lastThird' ? n.lastThird : isAlertEnabled(n, key);
  const digest = uuid.v5(JSON.stringify([
    prayerDate, key, at.getTime(), fireAt.getTime(), lead, sound, n.enabled, selected, n.alarmClock,
    Platform.OS === 'android' && exact === 'denied', channel, NOTIFICATION_TEXT_VERSION, trigger, content,
  ]), context);
  const slot = civilSlot(key, at.getTime());
  const identifier = [PRAYER_TAG, context, slot, digest].join('/');
  const data = { key, lead, sound, context, prayerDate, prayerAt: at.getTime(), silent: resolveSound(sound) === 'silent',
    source: PRAYER_TAG, alertIdentity: identifier };
  return { ...alert, slot, prayerDate, context, identifier, channel, request: { identifier, trigger, content: { ...content, data } } };
}

function scheduleContext(coords: LatLng, settings: PrayerSettings, groupGps = false): string {
  const place = settings.locationMode === 'manual' ? settings.manualLocation : null;
  // The store identified GPS places to ~100 m. A metre of jitter can keep the
  // place ID; the independently computed trigger still has to match its time.
  const position = !place && groupGps ? [coords.latitude.toFixed(3), coords.longitude.toFixed(3)]
    : [coords.latitude, coords.longitude];
  return JSON.stringify([...position, place?.name, place?.county, computeSignature(settings), getDisplayZone()]);
}

// The full signature belongs in app-private storage. Android exposes notification
// extras to every notification listener the reader has authorized.
async function contextToken(signature: string, create: boolean): Promise<string | null> {
  // A private installation namespace makes the same place/calculation reproducible
  // after a restart or round trip without exposing a dictionary of Swedish towns.
  const key = 'prayerScheduleNamespace:v1';
  let namespace = await storage.getItem(key);
  if (!namespace) {
    if (!create) return null;
    namespace = uuid.v4();
    await storage.setItem(key, namespace);
  }
  return uuid.v5(signature, namespace);
}

async function channelDelivery(id: string): Promise<'allowed' | 'blocked' | 'unknown'> {
  try {
    const channel = await Notifications.getNotificationChannelAsync(id);
    if (!channel || channel.importance === Notifications.AndroidImportance.NONE) return 'blocked';
    if (channel.groupId) {
      const group = await Notifications.getNotificationChannelGroupAsync(channel.groupId);
      if (!group) return 'unknown';
      if (group.isBlocked) return 'blocked';
    }
    return 'allowed';
  } catch {
    return 'unknown';
  }
}

export interface PrayerEvidence {
  auth: 'full' | 'off' | 'limited' | 'unknown';
  pending: 'some' | 'none' | 'unknown';
  alerts: NextAlert[];
  channelBlocked?: boolean;
}

/** Read-only observation. A stored preference and a successful scheduling call cannot certify delivery. */
export async function readPrayerEvidence(coords: LatLng, settings: PrayerSettings): Promise<PrayerEvidence> {
  const generation = syncGeneration;
  const requests = settings.notifications.enabled
    ? await Notifications.getAllScheduledNotificationsAsync().catch(() => null) : [];
  const android = Platform.OS === 'android';
  const registered = android ? await loadPrayerNotificationIds().catch(() => null) : [];
  const context = settings.notifications.enabled ? await contextToken(scheduleContext(coords, settings, true), false).catch(() => undefined) : null;
  const channels = new Map<string, Awaited<ReturnType<typeof channelDelivery>>>();
  if (android && requests && registered) {
    const ids = new Set(requests.filter(r => r.content?.data?.context === context && registered.includes(r.identifier))
      .map(r => r.trigger && 'channelId' in r.trigger ? r.trigger.channelId : null));
    await Promise.all([...ids].map(async id => { if (typeof id === 'string') channels.set(id, await channelDelivery(id)); }));
  }
  const exact = android ? await getExactAlarmState() : 'granted';
  const grant = await Notifications.getPermissionsAsync().catch(() => null);
  const tier = grant?.ios?.status;
  const limited = tier === Notifications.IosAuthorizationStatus.PROVISIONAL || tier === Notifications.IosAuthorizationStatus.EPHEMERAL;
  const auth = !grant || (Platform.OS === 'ios' && tier == null) ? 'unknown'
    : fullyAuthorized(grant) ? 'full' : limited ? 'limited' : 'off';
  if (generation !== syncGeneration || !requests || !registered || context === undefined) return { auth, pending: 'unknown', alerts: [] };
  const now = Date.now();
  const acknowledged = new Set(registered);
  let channelBlocked = false;
  let uncertain = false;
  const pending = new Map<string, NativeRequest>();
  const unreadable = new Set<string>();
  const owners = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const request of requests) {
    const data = request.content.data;
    const fire = nativeFireTime(request.trigger);
    if (fire === null && context && request.identifier.startsWith(PRAYER_TAG + '/' + context + '/')) {
      unreadable.add(request.identifier);
    }
    if (data?.source !== PRAYER_TAG) continue;
    const at = typeof data.prayerAt === 'number' ? data.prayerAt : legacyOccurrence(request)?.at;
    if (typeof data.key === 'string' && at !== undefined && Number.isFinite(at)) {
      const slot = civilSlot(data.key, at);
      if (owners.has(slot) && owners.get(slot) !== request.identifier) duplicates.add(slot);
      owners.set(slot, request.identifier);
    }
    if (!context || data.context !== context || fire == null || fire <= now) continue;
    if (android) {
      if (!registeredAndroidAlarms.has(request.identifier) || !acknowledged.has(request.identifier)) {
        uncertain = true;
        continue;
      }
      const id = request.trigger && 'channelId' in request.trigger ? request.trigger.channelId : null;
      const delivery = typeof id === 'string' && channels.get(id);
      if (delivery !== 'allowed') {
        if (delivery === 'blocked') channelBlocked = true;
        else uncertain = true;
        continue;
      }
    }
    pending.set(request.identifier, request);
  }
  const verified: NextAlert[] = [];
  for (let offset = -1; context && (pending.size || unreadable.size) && offset < MAX_DAYS_AHEAD; offset++) {
    const date = zonePrayerDate(now, offset);
    const times = computePrayerTimes(coords, date, settings);
    for (const alert of alertsForDay(times, settings.notifications, now)) {
      if (alert.key === 'sunrise' || alert.key === 'lastThird') continue;
      const plan = planPrayerRequest(context, date, alert, settings.notifications, exact);
      if (unreadable.delete(plan.identifier)) uncertain = true;
      const request = pending.get(plan.identifier);
      if (request && matchesPlan(request, plan)) {
        if (duplicates.size && duplicates.has(civilSlot(alert.key, alert.at.getTime()))) uncertain = true;
        else verified.push(alert);
      }
      pending.delete(plan.identifier);
    }
  }
  return { auth, pending: verified.length ? 'some' : uncertain ? 'unknown' : 'none', ...(channelBlocked && { channelBlocked }),
    alerts: auth === 'full' ? verified.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()) : [] };
}

export async function verifyPrayerSchedule(coords: LatLng, settings: PrayerSettings): Promise<PrayerEvidence> {
  const synced = syncPrayerNotifications(coords, settings, true);
  const generation = syncGeneration;
  await synced;
  if (generation !== syncGeneration) return { auth: 'unknown', pending: 'unknown', alerts: [] };
  return readPrayerEvidence(coords, settings);
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
    if (!current.canAskAgain) return 'denied';
    // Android 13+ reports denied/askable both before the dialog and after a
    // first refusal. Only the former is an invitation for the map's soft ask.
    if (Platform.OS === 'android' && current.status === 'denied' &&
        await storage.getItem(ANDROID_PROMPT_SHOWN_KEY) !== null) return 'denied';
    return 'undetermined';
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
    if (fullyAuthorized(current)) {
      trackPermissionResult('notifications', source, true, false);
      return 'granted';
    }
    // Already refused at the OS level: asking again is a silent no-op, so report the
    // truth and let the caller offer the system-settings route instead.
    const denial = await storage.getItem(REMINDERS_DECLINED_KEY);
    const visit = denial ? await recoveryVisit() : null;
    if (!current.canAskAgain || isAllowed(current) || (denial !== null &&
      (source === 'first_reading' || (visit && visit.started <= Number(denial))))) {
      trackPermissionResult('notifications', source, false, false);
      return 'denied';
    }
    // The channels must exist BEFORE the prompt on Android 13+ — expo's own permission
    // example creates one first, noting "a channel is needed for the permissions prompt
    // to appear". Requesting first and creating afterwards can leave the
    // POST_NOTIFICATIONS dialog unshown.
    await ensureAndroidChannels();
    void markSetupHandoff('alert', true);
    trackPermissionPrompt('notifications', source);
    const next = await Notifications.requestPermissionsAsync({
      // Alert + sound only. The handler above never sets a badge and nothing in the app
      // writes a badge count, so asking for badge authorization would claim a capability
      // we never use. Ask for exactly what we exercise.
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    void markSetupHandoff('alert', false);
    const granted = fullyAuthorized(next);
    if (Platform.OS === 'android') {
      // Losing the marker must never turn the OS's actual answer into 'unknown'.
      await storage.setItem(ANDROID_PROMPT_SHOWN_KEY, '1').catch(() => undefined);
    }
    trackPermissionResult('notifications', source, granted, true);
    return granted ? 'granted' : 'denied';
  } catch {
    return 'unknown';
  }
}

async function loadPrayerNotificationIds(): Promise<string[]> {
  const raw = await storage.getItem(PRAYER_NOTIFICATION_IDS_KEY);
  try {
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
  for (const id of ids) registeredAndroidAlarms.delete(id);
  const results = await Promise.allSettled(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  // Wait for every native result so a failed cancellation remains eligible for retry.
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Could not cancel every prayer notification');
  }
}

type PlannedAlert = ReturnType<typeof planPrayerRequest>;

type NativeRequest = Notifications.NotificationRequest;
type Slot = { plan: PlannedAlert; previous?: NativeRequest; keepOnFailure: boolean };

function matchesPlan(request: NativeRequest, plan: PlannedAlert): boolean {
  const data = request.content.data;
  if (data?.source !== PRAYER_TAG || data.alertIdentity !== plan.identifier || data.key !== plan.key ||
      data.context !== plan.context || data.prayerDate !== plan.prayerDate || data.prayerAt !== plan.at.getTime() ||
      data.lead !== plan.lead || data.sound !== plan.sound) return false;
  const trigger = request.trigger;
  const nativeTime = nativeFireTime(trigger);
  if (nativeTime !== scheduledInstant(plan.fireAt)) return false;
  return Platform.OS === 'ios' || (trigger != null && 'channelId' in trigger && trigger.channelId === plan.channel);
}

// The store format has no owning date. Its identity preserves the absolute
// trigger even on iOS, where the native request reads back as a relative interval.
function legacyOccurrence(request: NativeRequest) {
  const data = request.content.data;
  if (typeof data?.alertIdentity !== 'string') return null;
  try {
    const [key, fire, lead] = JSON.parse(data.alertIdentity);
    if (key === data.key && typeof fire === 'number' && Number.isFinite(fire) && typeof lead === 'number') {
      return { key: String(key), fire, at: fire + lead * 60_000 };
    }
  } catch { /* No usable occurrence in this legacy record. */ }
  return null;
}

// Store requests omit place and calculation from their extras. The private stamp
// from the last completed 1.3.8 sync records both at the store's GPS precision.
async function legacyContext(coords: LatLng, settings: PrayerSettings, exact: ExactAlarmState) {
  const [stamp, record] = await Promise.all([
    storage.getItem('prayerNotificationSync:v1'), storage.getItem('prayerScheduleContext:v1'),
  ]);
  // The older formats predate versioned text and used version 2 of the channels.
  const compatible = NOTIFICATION_TEXT_VERSION === 1 && CHANNEL_VERSION === 2;
  let store = false;
  let token: string | undefined;
  try {
    const [, zone, signature, position, delivery] = JSON.parse(stamp ?? 'null') ?? [];
    const [calculation, notifications] = JSON.parse(signature);
    store = compatible && notifications.enabled &&
      notifications.alarmClock === settings.notifications.alarmClock && delivery === (exact === 'denied' ? 'inexact' : 'exact') &&
      zone === getDisplayZone() && position === [coords.latitude.toFixed(3), coords.longitude.toFixed(3)].join(',') &&
      JSON.stringify(calculation) === computeSignature(settings);
  } catch { /* An incomplete store stamp cannot establish provenance. */ }
  try {
    const previous = JSON.parse(record ?? 'null');
    if (compatible && previous?.signature === scheduleContext(coords, settings) && typeof previous.token === 'string') token = previous.token;
  } catch { /* The pre-hash context is optional. */ }
  return { store, token, delivery: deliveryFor(settings.notifications), inexact: exact === 'denied' };
}

function classifyRequests(plans: PlannedAlert[], pending: NativeRequest[], saved: string[], legacy?: Awaited<ReturnType<typeof legacyContext>>) {
  const slots = plans.map((plan): Slot => ({ plan, keepOnFailure: false }));
  const byOwner = new Map(slots.map(s => [s.plan.key + '/' + s.plan.prayerDate, s]));
  const byId = new Map(slots.map(s => [s.plan.identifier, s]));
  const byInstant = new Map(slots.map(s => [s.plan.key + '/' + s.plan.fireAt.getTime(), s]));
  const byCivilDay = new Map(slots.map(s => [s.plan.key + '/' + prayerDateKey(zonePrayerDate(s.plan.at.getTime())), s]));
  const obsolete = new Set(saved.filter(id => !byId.has(id)));
  for (const request of pending) {
    const data = request.content.data;
    const id = request.identifier;
    const wanted = byId.get(id);
    const deterministic = id.startsWith(PRAYER_TAG + '/');
    if (!wanted && !deterministic && data?.source !== PRAYER_TAG && !obsolete.has(id)) continue;
    obsolete.add(id);
    let slot = wanted;
    let fire = nativeFireTime(request.trigger);
    let legacyMatches = false;
    if (!wanted && typeof data?.key === 'string' && typeof data.prayerDate === 'string') {
      slot = byOwner.get(data.key + '/' + data.prayerDate);
      if (!deterministic && slot && legacy?.token && data.context === legacy.token) {
        const p = slot.plan;
        const occurrence = [legacy.token, p.prayerDate, p.key, p.at.getTime(), p.fireAt.getTime(), p.lead, p.sound];
        // The earlier token format also stored the display zone in each identity.
        legacyMatches = data.alertIdentity === JSON.stringify([...occurrence, legacy.delivery, legacy.inexact]) ||
          data.alertIdentity === JSON.stringify([...occurrence, getDisplayZone(), legacy.delivery, legacy.inexact]);
      }
    } else if (!wanted && !deterministic) {
      const old = legacyOccurrence(request);
      if (old) {
        slot = byInstant.get(old.key + '/' + old.fire) ?? byCivilDay.get(old.key + '/' + prayerDateKey(zonePrayerDate(old.at)));
        if (slot && legacy?.store && saved.includes(id)) {
          const p = slot.plan;
          legacyMatches = data?.alertIdentity === JSON.stringify([
            p.key, p.fireAt.getTime(), p.lead, p.sound, getDisplayZone(), legacy.delivery, legacy.inexact,
          ]);
        }
        // The store's iOS DATE trigger reads back as a relative interval.
        if (Platform.OS === 'ios' && request.trigger && 'type' in request.trigger && request.trigger.type === 'timeInterval') fire = old.fire;
      }
    }
    if (!slot) continue;
    const target = scheduledInstant(slot.plan.fireAt);
    const withinTolerance = fire !== null && Math.abs(fire - target) <= 60_000;
    // The deterministic ID establishes ownership even when Expo cannot decode
    // the trigger or extras. Retention and positive delivery evidence are separate.
    const keepOnFailure = wanted ? fire === null || withinTolerance : legacyMatches && withinTolerance;
    if (!slot.previous || (keepOnFailure && !slot.keepOnFailure) || (keepOnFailure === slot.keepOnFailure && wanted)) {
      slot.previous = request;
      slot.keepOnFailure = keepOnFailure;
    }
  }
  for (const slot of slots) if (slot.previous) obsolete.delete(slot.previous.identifier);
  return { slots, obsolete };
}

async function applyReminderSet(plans: PlannedAlert[], generation: number,
  legacy?: Awaited<ReturnType<typeof legacyContext>>) {
  const [stored, snapshot] = await Promise.allSettled([loadPrayerNotificationIds(), Notifications.getAllScheduledNotificationsAsync()]);
  if (generation !== syncGeneration) return;
  const saved = stored.status === 'fulfilled' ? stored.value : [];
  const pending = snapshot.status === 'fulfilled' ? snapshot.value : [];
  const { slots, obsolete } = classifyRequests(plans, pending, saved, legacy);
  if (stored.status === 'rejected' || snapshot.status === 'rejected') {
    // With a known empty set, every identifiable prayer request can be cancelled.
    if (!plans.length) await cancelByIds([...obsolete]);
    throw new Error('Could not read the pending reminder set');
  }
  await cancelByIds([...obsolete]);
  const known = new Set(saved.filter(id => !obsolete.has(id)));
  for (const slot of slots) if (slot.previous) known.add(slot.previous.identifier);
  for (const id of registeredAndroidAlarms) if (!known.has(id)) registeredAndroidAlarms.delete(id);
  const android = Platform.OS === 'android';
  const foreignCount = pending.filter(r => !known.has(r.identifier) && !obsolete.has(r.identifier)).length;
  const stale = new Set(slots.flatMap(s => s.previous && !s.keepOnFailure ? [s.previous.identifier] : []));
  async function retire(ids: string[]) {
    await cancelByIds(ids);
    for (const id of ids) { known.delete(id); stale.delete(id); }
  }
  let failed = false;
  try {
    if (slots.length) { await ensureAndroidChannels(); await ensureNotificationCategory(); }
    // A stale alarm using the target ID cannot be the fallback for an in-place
    // write. Remove it before Expo persists the new trigger, including on a crash.
    const targetIds = new Set(slots.map(s => s.plan.identifier));
    const atCapacity = !android && known.size + foreignCount >= 64;
    await retire([...stale].filter(id => atCapacity || targetIds.has(id)));
    for (let i = 0; i < slots.length && generation === syncGeneration;) {
      const free = 64 - foreignCount - known.size;
      const batch = slots.slice(i, i + (android ? 8 : Math.min(4, Math.max(1, free))));
      i += batch.length;
      const writes = await Promise.all(batch.map(async slot => {
        const id = slot.plan.identifier;
        const previous = slot.previous;
        if (previous?.identifier === id && matchesPlan(previous, slot.plan) && (!android || registeredAndroidAlarms.has(id))) return null;
        if (slot.plan.fireAt.getTime() <= Date.now()) return null;
        if (!android && free <= 0 && !known.has(id)) { failed = true; return null; }
        try {
          const armed = await Notifications.scheduleNotificationAsync(slot.plan.request);
          known.add(armed);
          if (android) registeredAndroidAlarms.add(armed);
          // Roll back an unverified migration when an exact original exists.
          // An in-place registration has just replaced the stale native request.
          if (slot.keepOnFailure && previous?.identifier !== armed) stale.add(armed);
          else stale.delete(armed);
          return { slot, armed };
        } catch {
          if (android) {
            registeredAndroidAlarms.delete(id);
            // Expo records the new request even if AlarmManager rejects it.
            if (!known.has(id)) stale.add(id);
          }
          if (slot.plan.fireAt.getTime() > Date.now()) failed = true;
          return null;
        }
      }));
      if (generation !== syncGeneration) break;
      const needProof = writes.some(w => w?.slot.previous);
      // One failed read cannot certify this batch. Later batches can still be
      // registered, and retire() keeps each exact fallback through the failure.
      const readback = needProof ? await Notifications.getAllScheduledNotificationsAsync().catch(() => []) : [];
      if (generation !== syncGeneration) break;
      for (const write of writes) {
        if (!write?.slot.previous) continue;
        if (!readback.some(r => r.identifier === write.armed && matchesPlan(r, write.slot.plan))) {
          failed = true;
          continue;
        }
        stale.delete(write.armed);
        const old = write.slot.previous.identifier;
        if (old !== write.armed) stale.add(old);
      }
      // Also remove stale predecessors of rejected registrations in this batch.
      const finished = batch.flatMap(slot => [slot.previous?.identifier, slot.plan.identifier]);
      await retire([...stale].filter(id => finished.includes(id)));
    }
  } finally {
    await retire([...stale]);
    // The next run is serialized behind this write, even after a partial native
    // failure or a change of intent. It can identify both sides of an unfinished swap.
    if (known.size === 0) {
      if (saved.length) await storage.removeItem(PRAYER_NOTIFICATION_IDS_KEY);
    } else if (known.size !== saved.length || !saved.every(id => known.has(id))) {
      await savePrayerNotificationIds([...known]);
    }
  }
  if (failed) throw new Error('Some desired prayer reminders could not be registered or verified');
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
  force = false,
): Promise<boolean> {
  const key = JSON.stringify([scheduleContext(coords, settings), notificationSignature(settings)]);
  if (currentSync?.key === key && (!force || currentSync.force)) return currentSync.result;
  const generation = ++syncGeneration;
  const sync = syncQueue.then(async () => {
    if (generation !== syncGeneration) return false;
    await reconcilePrayerNotifications(coords, settings, generation);
    return generation === syncGeneration;
  });
  syncQueue = sync.then(() => undefined, () => undefined);
  const result = sync.catch(() => false).finally(() => {
    if (generation === syncGeneration) currentSync = null;
  });
  currentSync = { key, result, force };
  return result;
}

async function reconcilePrayerNotifications(
  coords: LatLng,
  settings: PrayerSettings,
  generation: number,
): Promise<void> {
  const n = settings.notifications;
  const perDay = alertsPerDay(n);
  const allowed = n.enabled && perDay > 0 && isAllowed(await Notifications.getPermissionsAsync());
  if (generation !== syncGeneration) return;
  if (!allowed) return applyReminderSet([], generation);

  const exact = await getExactAlarmState();
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
  const context = await contextToken(scheduleContext(coords, settings, true), true);
  if (!context) throw new Error('Missing reminder context');
  const legacy = await legacyContext(coords, settings, exact);
  const desired = new Map<string, PlannedAlert>();
  for (let d = -1; d < maxDays && desired.size < budget; d++) {
    const date = new Date(day0.getFullYear(), day0.getMonth(), day0.getDate() + d, 12);
    const times = computePrayerTimes(coords, date, settings);
    for (const alert of alertsForDay(times, n, now)) {
      const plan = planPrayerRequest(context, date, alert, n, exact);
      if (desired.has(plan.slot)) continue;
      desired.set(plan.slot, plan);
      if (desired.size === budget) break;
    }
  }

  if (generation !== syncGeneration) return;
  await applyReminderSet([...desired.values()], generation, legacy);
}
