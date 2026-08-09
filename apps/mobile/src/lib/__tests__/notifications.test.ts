import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionStatus } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';

import { Platform } from 'react-native';

import {
  alertsPerDay,
  AVAILABLE_SOUNDS,
  channelIdFor,
  foregroundPresentation,
  getNotificationPermissionState,
  horizonDays,
  MAX_DAYS_AHEAD,
  NOTIFY_PRAYERS,
  requestNotificationPermission,
  resetSyncStateForTests,
  syncPrayerNotifications,
} from '@/lib/notifications';
import { stockholmParts } from '@/lib/stockholm-time';
import { DEFAULT_SETTINGS, type PrayerSettings } from '@/lib/settings/types';

// Stockholm — below the Arctic Circle, so all five prayers resolve to valid times
// across the 7-day scheduling window (no polar-circle NaNs to muddy the comparison).
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };

// expo-notifications is mocked in jest.setup.js; read the recorded schedule calls.
const scheduleMock = Notifications.scheduleNotificationAsync as unknown as {
  mock: { calls: [{ content: { title: string; body: string }; trigger: { date: Date } }][] };
  mockClear: () => void;
  mockImplementation: (fn: typeof Notifications.scheduleNotificationAsync) => void;
};
const getPermissionsMock = Notifications.getPermissionsAsync as unknown as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const cancelMock = Notifications.cancelAllScheduledNotificationsAsync as unknown as {
  mock: { calls: unknown[] };
};
const cancelScheduledMock = Notifications.cancelScheduledNotificationAsync as unknown as {
  mock: { calls: [string][] };
};
const getAllScheduledMock =
  Notifications.getAllScheduledNotificationsAsync as unknown as jest.MockedFunction<
    typeof Notifications.getAllScheduledNotificationsAsync
  >;
const requestPermissionsMock =
  Notifications.requestPermissionsAsync as unknown as jest.MockedFunction<
    typeof Notifications.requestPermissionsAsync
  >;
const channelMock = Notifications.setNotificationChannelAsync as unknown as jest.MockedFunction<
  typeof Notifications.setNotificationChannelAsync
>;

/** Run `fn` with Platform.OS pinned, then restore — the channel path is Android-only. */
async function withPlatform<T>(os: 'ios' | 'android', run: () => Promise<T>): Promise<T> {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  try {
    return await run();
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
  }
}

async function waitForPermissionRequest(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (getPermissionsMock.mock.calls.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function withNotifications(patch: Partial<PrayerSettings['notifications']>): PrayerSettings {
  return {
    ...DEFAULT_SETTINGS,
    notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true, ...patch },
  };
}

/** Every slot on the SAME heads-up — what the retired scalar `leadMinutes` used to
 *  express. Lead is per-prayer now, so the tests that only care about "some uniform
 *  offset" say so through this rather than hand-writing six identical keys. */
function withUniformLead(
  minutes: number,
  patch: Partial<PrayerSettings['notifications']> = {},
): PrayerSettings {
  return withNotifications({
    lead: {
      fajr: minutes,
      sunrise: minutes,
      dhuhr: minutes,
      asr: minutes,
      maghrib: minutes,
      isha: minutes,
    },
    ...patch,
  });
}

/** Sorted epoch-ms of every notification the last sync scheduled. */
function scheduledTimes(): number[] {
  return scheduleMock.mock.calls
    .map((call) => call[0].trigger.date.getTime())
    .sort((a, b) => a - b);
}

describe('syncPrayerNotifications lead time', () => {
  beforeEach(async () => {
    scheduleMock.mockClear();
    jest.clearAllMocks();
    scheduleMock.mockImplementation(async () => 'id');
    // clearAllMocks keeps implementations, so a test that stubs the OS's pending list
    // would otherwise leak its orphans into every test after it.
    getAllScheduledMock.mockImplementation(async () => []);
    resetSyncStateForTests();
    await AsyncStorage.clear();
  });

  it('fires each alert its lead time before the prayer time', async () => {
    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    const atPrayerTime = scheduledTimes();

    scheduleMock.mockClear();
    await syncPrayerNotifications(STOCKHOLM, withUniformLead(15));
    const withLead = scheduledTimes();

    expect(atPrayerTime.length).toBeGreaterThan(0);
    expect(withLead.length).toBeGreaterThan(0);

    // The contract: every heads-up fire time maps to a prayer-time fire exactly
    // 15 minutes later. Match the sets rather than their first/last elements: in
    // northern summer Isha can cross midnight and change chronological ordering,
    // while a near-now lead alert may legitimately be skipped.
    const atPrayerSet = new Set(atPrayerTime);
    const matched = withLead.filter((fireAt) => atPrayerSet.has(fireAt + 15 * 60_000));
    // The pending-notification budget can also cut the final day at a different
    // prayer when the near-now skip changes the number of available slots. Thus at
    // most the two horizon edges are unmatched; every interior alert must shift.
    expect(matched.length).toBeGreaterThanOrEqual(Math.min(atPrayerTime.length, withLead.length) - 2);

    // Same prayers scheduled either way — at most one boundary case can differ when
    // shifting earlier brings a near-now prayer below the skip threshold.
    expect(Math.abs(atPrayerTime.length - withLead.length)).toBeLessThanOrEqual(1);
  });

  // The whole point of the notification is glanceability: the bold title must answer
  // "which prayer, how soon", and the lighter body carries the exact clock time. A
  // regression here (countdown buried in the body, or no countdown at all) silently
  // defeats the feature, so lock the copy contract for both lead modes.
  it('leads the title with a countdown when a lead offset is set', async () => {
    await syncPrayerNotifications(STOCKHOLM, withUniformLead(15));
    const { content } = scheduleMock.mock.calls[0][0];
    // Title: "<prayer> om 15 min" — the countdown is the headline, not an
    // afterthought. The space before "min" is NBSP (fast mellanslag) so the
    // unit never wraps away from its number in a narrow banner.
    expect(content.title).toMatch(/ om 15 min$/);
    // Body: the durable clock time, e.g. "Klockan 14:32".
    expect(content.body).toMatch(/^Klockan \d{2}:\d{2}$/);
  });

  it('says it is time now when there is no lead offset', async () => {
    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    const { content } = scheduleMock.mock.calls[0][0];
    expect(content.title).toMatch(/^Dags för /);
    expect(content.body).toMatch(/^Klockan \d{2}:\d{2}$/);
  });

  it('schedules nothing when notifications are disabled', async () => {
    await syncPrayerNotifications(STOCKHOLM, {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false },
    });
    expect(scheduledTimes()).toHaveLength(0);
  });

  it('cancels only previously scheduled prayer notifications by id', async () => {
    let nextId = 0;
    scheduleMock.mockImplementation(async () => `prayer-${++nextId}`);

    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    const scheduledCount = scheduleMock.mock.calls.length;
    expect(scheduledCount).toBeGreaterThan(0);

    scheduleMock.mockClear();
    await syncPrayerNotifications(STOCKHOLM, {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false },
    });

    expect(cancelMock.mock.calls).toHaveLength(0);
    expect(cancelScheduledMock.mock.calls).toHaveLength(scheduledCount);
    expect(cancelScheduledMock.mock.calls[0][0]).toBe('prayer-1');
    expect(scheduleMock.mock.calls).toHaveLength(0);
  });

  it('sweeps up its own orphans when the persisted id list is gone', async () => {
    // THE BUG THIS PREVENTS: the id list is only a cache. A failed AsyncStorage write,
    // a crash between scheduling and persisting, or the user clearing app storage
    // leaves the OS holding alerts the app has forgotten. The next sync then scheduled
    // a SECOND full set on top — every prayer alerting twice — and on iOS, which keeps
    // only the 64 soonest pending requests, the orphans silently pushed genuine later
    // alerts off the end. So the OS's pending list is swept for our own tag too.
    getAllScheduledMock.mockImplementation(async () => [
      { identifier: 'orphan-1', content: { data: { source: 'prayer-times' } } },
      { identifier: 'orphan-2', content: { data: { key: 'asr', source: 'prayer-times' } } },
      // Something else entirely — must survive. The tag is what bounds the sweep.
      { identifier: 'not-ours', content: { data: { source: 'something-else' } } },
      // Malformed / dataless entries must not throw the sweep.
      { identifier: 'bare', content: {} },
    ] as unknown as Notifications.NotificationRequest[]);

    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));

    const cancelled = cancelScheduledMock.mock.calls.map(([id]) => id);
    expect(cancelled).toContain('orphan-1');
    expect(cancelled).toContain('orphan-2');
    expect(cancelled).not.toContain('not-ours');
    expect(cancelled).not.toContain('bare');
  });

  it('tags every scheduled alert so a later sync can find it without storage', async () => {
    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    expect(scheduleMock.mock.calls.length).toBeGreaterThan(0);
    for (const [request] of scheduleMock.mock.calls) {
      expect((request.content as { data?: { source?: string } }).data?.source).toBe('prayer-times');
    }
  });

  it('does not let an older enabled sync schedule after a newer disabled sync wins', async () => {
    let resolvePermission!: (value: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>) => void;
    getPermissionsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );

    const oldSync = syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    await waitForPermissionRequest();

    await syncPrayerNotifications(STOCKHOLM, {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false },
    });
    resolvePermission({
      granted: true,
      canAskAgain: true,
      status: PermissionStatus.GRANTED,
      expires: 'never',
    });
    await oldSync;

    expect(scheduledTimes()).toHaveLength(0);
  });

  // Regression: a superseded sync used to abandon the notifications it had ALREADY
  // scheduled before noticing it was stale — they were never saved (so no later sync's
  // cancel pass could find them) and never cancelled, leaving orphans that fired as
  // duplicate alerts alongside the newer sync's set. A stale sync must cancel every
  // id it created, not just bail.
  it('cancels its already-scheduled notifications when a newer sync supersedes it mid-run', async () => {
    let nextId = 0;
    let releaseThird!: () => void;
    const thirdScheduled = new Promise<void>((resolveScheduled) => {
      const gate = new Promise<void>((release) => {
        releaseThird = release;
      });
      scheduleMock.mockImplementation(async () => {
        const id = `old-${++nextId}`;
        if (nextId === 3) {
          resolveScheduled();
          await gate; // hold the old sync here while the newer sync wins
        }
        return id;
      });
    });

    const oldSync = syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    await thirdScheduled; // old sync has created old-1, old-2 and is creating old-3

    scheduleMock.mockImplementation(async () => 'new-id');
    const newSync = syncPrayerNotifications(STOCKHOLM, {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false },
    });
    releaseThird();
    await Promise.all([oldSync, newSync]);

    // Every notification the stale sync managed to schedule must be cancelled —
    // including the ones created BEFORE the newer sync started.
    const cancelled = cancelScheduledMock.mock.calls.map((call) => call[0]);
    expect(cancelled).toEqual(expect.arrayContaining(['old-1', 'old-2', 'old-3']));
    // And nothing of the stale run survives in storage for a later sync to trip on.
    expect(await AsyncStorage.getItem('prayerNotificationIds:v1')).toBeNull();
  });
});

// The permission layer guards a resource that cannot be replenished: iOS grants exactly
// ONE notification prompt per install. Everything here protects that single shot, or the
// correctness of reading the answer back.
describe('notification permission', () => {
  beforeEach(async () => {
    scheduleMock.mockClear();
    jest.clearAllMocks();
    scheduleMock.mockImplementation(async () => 'id');
    // clearAllMocks keeps implementations, so a test that stubs the OS's pending list
    // would otherwise leak its orphans into every test after it.
    getAllScheduledMock.mockImplementation(async () => []);
    resetSyncStateForTests();
    await AsyncStorage.clear();
  });

  // THE load-bearing invariant. syncPrayerNotifications runs on mount and on every
  // AppState → 'active', so if it ever asks, the OS dialog appears with no tap behind it
  // and a reflexive "Don't allow" permanently kills prayer reminders. It must only ever
  // READ. (This used to call requestNotificationPermission() internally.)
  it('never prompts from a background sync, even when permission is undetermined', async () => {
    getPermissionsMock.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: PermissionStatus.UNDETERMINED,
      expires: 'never',
    });

    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));

    expect(requestPermissionsMock).not.toHaveBeenCalled();
    // And with no permission it must not schedule either.
    expect(scheduledTimes()).toHaveLength(0);
  });

  // iOS provisional ("quiet") authorization delivers everything we schedule but reports
  // granted:false. Reading only `.granted` told those users their reminders were blocked
  // while the alerts were in fact arriving — and made the sync refuse to schedule at all.
  it('treats iOS provisional authorization as allowed', async () => {
    getPermissionsMock.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: PermissionStatus.UNDETERMINED,
      expires: 'never',
      ios: { status: Notifications.IosAuthorizationStatus.PROVISIONAL },
    } as unknown as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    expect(await getNotificationPermissionState()).toBe('granted');
    // Not just cosmetic: the sync must actually schedule for a provisional user.
    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    expect(scheduledTimes().length).toBeGreaterThan(0);
  });

  it('reports denied only when the OS will not ask again', async () => {
    getPermissionsMock.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: PermissionStatus.DENIED,
      expires: 'never',
    });
    expect(await getNotificationPermissionState()).toBe('denied');

    getPermissionsMock.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: PermissionStatus.UNDETERMINED,
      expires: 'never',
    });
    expect(await getNotificationPermissionState()).toBe('undetermined');
  });

  // Android 13+ shows the POST_NOTIFICATIONS dialog only once a channel exists — expo's
  // own permission example creates the channel first for exactly this reason. Requesting
  // before creating it (the previous order) can leave the prompt unshown, which looks
  // identical to a user who declined.
  it('creates every Android channel before asking for permission', async () => {
    getPermissionsMock.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: PermissionStatus.UNDETERMINED,
      expires: 'never',
    });

    const order: string[] = [];
    channelMock.mockImplementation(async () => {
      order.push('channel');
      return null;
    });
    requestPermissionsMock.mockImplementation(async () => {
      order.push('request');
      return {
        granted: true,
        canAskAgain: true,
        status: PermissionStatus.GRANTED,
        expires: 'never',
      };
    });

    await withPlatform('android', () => requestNotificationPermission());

    // A sound choice IS a channel (Android freezes a channel's sound at creation), so
    // there is one per available sound now — but the ORDERING contract is unchanged and
    // is what this test exists for: every channel exists before the prompt fires.
    expect(order[order.length - 1]).toBe('request');
    expect(order.filter((step) => step === 'channel')).toHaveLength(AVAILABLE_SOUNDS.length);
    expect(order.indexOf('request')).toBe(order.length - 1);
  });

  // The handler sets shouldSetBadge:false and nothing in the app ever writes a badge
  // count, so asking for badge authorization would claim a capability we never exercise.
  it('asks for alert and sound but not badge', async () => {
    getPermissionsMock.mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: PermissionStatus.UNDETERMINED,
      expires: 'never',
    });

    await requestNotificationPermission();

    expect(requestPermissionsMock).toHaveBeenCalledWith({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
  });

  // Asking again after a hard denial is a silent no-op at the OS level, so spending a
  // round-trip on it would just return a confusing "undetermined-looking" result. Report
  // the truth so the caller can offer the system-settings route instead.
  it('does not re-ask once the OS refuses to ask again', async () => {
    getPermissionsMock.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: PermissionStatus.DENIED,
      expires: 'never',
    });

    expect(await requestNotificationPermission()).toBe('denied');
    expect(requestPermissionsMock).not.toHaveBeenCalled();
  });

  it('reports granted without prompting when permission is already held', async () => {
    getPermissionsMock.mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: PermissionStatus.GRANTED,
      expires: 'never',
    });

    expect(await requestNotificationPermission()).toBe('granted');
    expect(requestPermissionsMock).not.toHaveBeenCalled();
  });
});

// The alert content the scheduler produced, typed loosely — jest.setup's mock records the
// raw argument object, and these tests reach into fields the narrow mock type omits.
type ScheduledCall = {
  content: { title: string; body: string; sound: unknown; data?: { silent?: boolean } };
  trigger: { date: Date; channelId?: string };
};
const scheduled = (): ScheduledCall[] =>
  (scheduleMock.mock.calls as unknown as [ScheduledCall][]).map((c) => c[0]);

/** How many distinct Stockholm calendar days the last sync covered. */
function daysSpanned(): number {
  const days = scheduled().map((c) => {
    const { y, mo, d } = stockholmParts(c.trigger.date.getTime());
    return `${y}-${mo}-${d}`;
  });
  return new Set(days).size;
}

function onlyPrayers(...keys: readonly string[]): PrayerSettings['notifications']['prayers'] {
  return {
    fajr: keys.includes('fajr'),
    dhuhr: keys.includes('dhuhr'),
    asr: keys.includes('asr'),
    maghrib: keys.includes('maghrib'),
    isha: keys.includes('isha'),
  };
}

// The horizon is the app's core promise made durable: reminders must keep arriving for
// as long as the platform will hold them, not stop a week after the user last opened the
// app. iOS caps PENDING requests at 64 and silently drops the rest, so the window has to
// be derived from how many alerts a day actually produces.
describe('notification horizon', () => {
  beforeEach(async () => {
    scheduleMock.mockClear();
    jest.clearAllMocks();
    scheduleMock.mockImplementation(async () => 'id');
    // clearAllMocks keeps implementations, so a test that stubs the OS's pending list
    // would otherwise leak its orphans into every test after it.
    getAllScheduledMock.mockImplementation(async () => []);
    resetSyncStateForTests();
    await AsyncStorage.clear();
  });

  it('divides the budget by the per-day alert count, clamped to the month', () => {
    expect(horizonDays(6, 60)).toBe(10);
    expect(horizonDays(5, 60)).toBe(12); // today's 7-day window was 35 of 64 slots
    expect(horizonDays(3, 60)).toBe(20);
    expect(horizonDays(1, 60)).toBe(MAX_DAYS_AHEAD); // clamped, not 60 days
    expect(horizonDays(0, 60)).toBe(0);
    expect(horizonDays(6, 400)).toBe(MAX_DAYS_AHEAD); // Android: clamped, not 66
  });

  it('counts the enabled prayers plus the optional Fajr-window marker', () => {
    const n = DEFAULT_SETTINGS.notifications;
    expect(alertsPerDay(n)).toBe(5);
    expect(alertsPerDay({ ...n, fajrWindowEnd: true })).toBe(6);
    expect(alertsPerDay({ ...n, prayers: onlyPrayers('fajr') })).toBe(1);
    expect(alertsPerDay({ ...n, prayers: onlyPrayers() })).toBe(0);
  });

  it('reaches further ahead when fewer prayers are enabled', async () => {
    await withPlatform('ios', async () => {
      await syncPrayerNotifications(STOCKHOLM, withUniformLead(0, { fajrWindowEnd: true }));
      const dense = daysSpanned();
      const denseCalls = scheduleMock.mock.calls.length;

      scheduleMock.mockClear();
      resetSyncStateForTests();
      await AsyncStorage.clear();
      await syncPrayerNotifications(
        STOCKHOLM,
        withUniformLead(0, { prayers: onlyPrayers('fajr') }),
      );
      const sparse = daysSpanned();

      // The adaptation is the contract, not the exact day counts — a budget tweak must
      // not churn this test.
      expect(sparse).toBeGreaterThan(dense);
      expect(denseCalls).toBeLessThan(64);
      expect(scheduleMock.mock.calls.length).toBeLessThan(64);
    });
  });

  it('never exceeds the iOS pending cap for any enabled combination', async () => {
    const keys = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;
    await withPlatform('ios', async () => {
      for (let count = 1; count <= keys.length; count++) {
        for (const windowEnd of [false, true]) {
          scheduleMock.mockClear();
          resetSyncStateForTests();
          await AsyncStorage.clear();
          await syncPrayerNotifications(
            STOCKHOLM,
            withUniformLead(0, {
              prayers: onlyPrayers(...keys.slice(0, count)),
              fajrWindowEnd: windowEnd,
            }),
          );
          // 64 is a hard platform limit: past it iOS drops requests silently, so a
          // regression here loses the FURTHEST-OUT reminders with no error anywhere.
          expect(scheduleMock.mock.calls.length).toBeLessThan(64);
        }
      }
    });
  });

  it('uses a much longer window on Android, which has no pending cap', async () => {
    await withPlatform('android', async () => {
      await syncPrayerNotifications(STOCKHOLM, withUniformLead(0, { fajrWindowEnd: true }));
      expect(daysSpanned()).toBe(MAX_DAYS_AHEAD);
      expect(scheduleMock.mock.calls.length).toBeLessThanOrEqual(400);
    });
  });

  // syncPrayerNotifications runs on mount AND every foreground. At a 30-day Android
  // horizon an unguarded re-sync is 180 cancels + 180 schedules, a dozen times a day.
  it('skips a redundant re-sync when nothing relevant changed', async () => {
    const settings = withUniformLead(0);
    await syncPrayerNotifications(STOCKHOLM, settings);
    expect(scheduleMock.mock.calls.length).toBeGreaterThan(0);

    scheduleMock.mockClear();
    await syncPrayerNotifications(STOCKHOLM, settings);
    expect(scheduleMock.mock.calls).toHaveLength(0);
  });

  it('re-syncs when a prayer is toggled off', async () => {
    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    scheduleMock.mockClear();
    await syncPrayerNotifications(
      STOCKHOLM,
      withUniformLead(0, { prayers: onlyPrayers('fajr', 'dhuhr', 'asr', 'maghrib') }),
    );
    expect(scheduleMock.mock.calls.length).toBeGreaterThan(0);
  });
});

// A sound choice is an Android CHANNEL (a channel's sound is frozen at creation) and an
// iOS content field. Getting the two confused silently makes every alert audible, or
// every alert mute — with nothing in the UI to show for it.
describe('notification sounds', () => {
  beforeEach(async () => {
    scheduleMock.mockClear();
    jest.clearAllMocks();
    scheduleMock.mockImplementation(async () => 'id');
    // clearAllMocks keeps implementations, so a test that stubs the OS's pending list
    // would otherwise leak its orphans into every test after it.
    getAllScheduledMock.mockImplementation(async () => []);
    resetSyncStateForTests();
    await AsyncStorage.clear();
  });

  it('routes each alert to the channel matching its sound choice', async () => {
    await withPlatform('android', async () => {
      await syncPrayerNotifications(
        STOCKHOLM,
        withUniformLead(0, {
          sound: { ...DEFAULT_SETTINGS.notifications.sound, fajr: 'silent' },
        }),
      );
      const byTitle = (needle: string) =>
        scheduled().filter((c) => c.content.title.includes(needle));
      expect(byTitle('Fajr').length).toBeGreaterThan(0);
      for (const call of byTitle('Fajr')) {
        expect(call.trigger.channelId).toBe(channelIdFor('silent'));
      }
      for (const call of byTitle('Maghrib')) {
        expect(call.trigger.channelId).toBe(channelIdFor('default'));
      }
    });
  });

  // THE PLATFORM CONTRACT: expo's native channel manager keys off containsKey("sound").
  // ABSENT means the system default tone; present-and-null means no sound at all. Passing
  // some "default" string instead would make Android hunt res/raw for a file named
  // "default", find nothing, and fall back — and passing nothing for the silent channel
  // would make a "Tyst" choice audible.
  it('omits sound entirely for the default channel and nulls it for the silent one', async () => {
    await withPlatform('android', async () => {
      await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
      const configs = new Map(
        (channelMock.mock.calls as unknown as [string, Record<string, unknown>][]).map(
          ([id, cfg]) => [id, cfg],
        ),
      );
      const dflt = configs.get(channelIdFor('default'));
      const silent = configs.get(channelIdFor('silent'));
      expect(dflt).toBeDefined();
      expect(silent).toBeDefined();
      expect('sound' in (dflt as object)).toBe(false);
      expect(silent).toHaveProperty('sound', null);
    });
  });

  it('retires the pre-v2 channel, which can never be given a new sound', async () => {
    await withPlatform('android', async () => {
      await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
      expect(Notifications.deleteNotificationChannelAsync).toHaveBeenCalledWith('prayers');
    });
  });

  it('silences the iOS notification and flags it for the foreground handler', async () => {
    await withPlatform('ios', async () => {
      await syncPrayerNotifications(
        STOCKHOLM,
        withUniformLead(0, {
          sound: { ...DEFAULT_SETTINGS.notifications.sound, fajr: 'silent' },
        }),
      );
      const fajr = scheduled().filter((c) => c.content.title.includes('Fajr'));
      const other = scheduled().filter((c) => c.content.title.includes('Maghrib'));
      expect(fajr.length).toBeGreaterThan(0);
      for (const call of fajr) {
        expect(call.content.sound).toBe(false);
        // The handler would otherwise force sound on whenever the app is foregrounded.
        expect(call.content.data?.silent).toBe(true);
      }
      for (const call of other) {
        expect(call.content.sound).toBe(true);
        expect(call.content.data?.silent).toBe(false);
      }
    });
  });

  it('mutes a silent alert in the foreground on iOS, but defers to the channel on Android', async () => {
    // Two platforms, two meanings for one flag. On iOS the returned behaviour IS the
    // foreground presentation, so silence has to be decided here. On Android the channel
    // already carries the sound — and expo maps shouldPlaySound:false onto
    // NotificationCompat.setSilent(true), which suppresses the HEADS-UP BANNER too. A
    // "Tyst" prayer alert therefore used to slip into the shade unseen while the user was
    // looking at the app. If this test fails, that silent-means-invisible bug is back.
    await withPlatform('ios', async () => {
      expect(foregroundPresentation(true).shouldPlaySound).toBe(false);
      expect(foregroundPresentation(false).shouldPlaySound).toBe(true);
    });
    await withPlatform('android', async () => {
      expect(foregroundPresentation(true).shouldPlaySound).toBe(true);
      expect(foregroundPresentation(false).shouldPlaySound).toBe(true);
    });
    // Either way the alert is shown — that is the whole point of handling it.
    expect(foregroundPresentation(true).shouldShowBanner).toBe(true);
    expect(foregroundPresentation(true).shouldShowList).toBe(true);
    // Nothing in the app writes a badge count, and permission is never requested for
    // one, so claiming a badge here would be claiming a capability we don't have.
    expect(foregroundPresentation(true).shouldSetBadge).toBe(false);
  });

  // Ships-without-a-file is the whole design: the plumbing exists, the audio does not.
  it('falls back to the system sound when no adhan file is bundled', async () => {
    await withPlatform('android', async () => {
      await syncPrayerNotifications(
        STOCKHOLM,
        withUniformLead(0, {
          sound: { ...DEFAULT_SETTINGS.notifications.sound, isha: 'adhan' },
        }),
      );
      const isha = scheduled().filter((c) => c.content.title.includes('Isha'));
      for (const call of isha) {
        expect(call.content.sound).toBe(true);
        expect(call.trigger.channelId).toBe(channelIdFor('default'));
      }
    });
  });
});

// Shurūq is the END of Fajr's window, not a prayer. That framing is load-bearing in both
// the code and the copy, so it is offered through its own flag rather than as a sixth
// entry in NOTIFY_PRAYERS.
describe('Fajr-window alert', () => {
  beforeEach(async () => {
    scheduleMock.mockClear();
    jest.clearAllMocks();
    scheduleMock.mockImplementation(async () => 'id');
    // clearAllMocks keeps implementations, so a test that stubs the OS's pending list
    // would otherwise leak its orphans into every test after it.
    getAllScheduledMock.mockImplementation(async () => []);
    resetSyncStateForTests();
    await AsyncStorage.clear();
  });

  it('keeps sunrise out of the obligatory-prayer list', () => {
    expect(NOTIFY_PRAYERS).not.toContain('sunrise');
  });

  it('schedules no window alert by default', async () => {
    await syncPrayerNotifications(STOCKHOLM, withUniformLead(0));
    expect(scheduled().filter((c) => /Fajr-tiden/.test(c.content.title))).toHaveLength(0);
  });

  it('warns before the window closes when enabled', async () => {
    await syncPrayerNotifications(
      STOCKHOLM,
      withNotifications({
        fajrWindowEnd: true,
        lead: { ...DEFAULT_SETTINGS.notifications.lead, sunrise: 15 },
      }),
    );
    const warnings = scheduled().filter((c) => /Fajr-tiden/.test(c.content.title));
    expect(warnings.length).toBeGreaterThan(0);
    // Literal NBSP before the unit, like every other numeral+unit pair in the app.
    expect(warnings[0].content.title).toBe('Fajr-tiden slutar om 15 min');
    expect(warnings[0].content.body).toMatch(/^Soluppgång \d{2}:\d{2}$/);
  });

  it('says the window is closed when there is no lead', async () => {
    await syncPrayerNotifications(
      STOCKHOLM,
      withNotifications({
        fajrWindowEnd: true,
        lead: { ...DEFAULT_SETTINGS.notifications.lead, sunrise: 0 },
      }),
    );
    const warnings = scheduled().filter((c) => /Fajr-tiden/.test(c.content.title));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].content.title).toBe('Fajr-tiden är slut');
  });
});
