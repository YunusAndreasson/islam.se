import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionStatus } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';

import { Platform } from 'react-native';

import {
  getNotificationPermissionState,
  requestNotificationPermission,
  syncPrayerNotifications,
} from '../notifications';
import { DEFAULT_SETTINGS, type PrayerSettings } from '../settings/types';

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
    await AsyncStorage.clear();
  });

  it('fires the alert leadMinutes before the prayer time', async () => {
    await syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 0 }));
    const atPrayerTime = scheduledTimes();

    scheduleMock.mockClear();
    await syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 15 }));
    const withLead = scheduledTimes();

    expect(atPrayerTime.length).toBeGreaterThan(0);
    expect(withLead.length).toBeGreaterThan(0);

    // The contract: a heads-up offset shifts the FIRE time exactly 15 min earlier —
    // it must not recompute or drop prayers. The furthest-future alert (last in each
    // sorted list = the final day's Isha) is immune to the "too soon to be useful"
    // skip near `now`, so its offset is the clean invariant to assert.
    const last0 = atPrayerTime[atPrayerTime.length - 1];
    const last15 = withLead[withLead.length - 1];
    expect(last0 - last15).toBe(15 * 60_000);

    // Same prayers scheduled either way — at most one boundary case can differ when
    // shifting earlier brings a near-now prayer below the skip threshold.
    expect(Math.abs(atPrayerTime.length - withLead.length)).toBeLessThanOrEqual(1);
  });

  // The whole point of the notification is glanceability: the bold title must answer
  // "which prayer, how soon", and the lighter body carries the exact clock time. A
  // regression here (countdown buried in the body, or no countdown at all) silently
  // defeats the feature, so lock the copy contract for both lead modes.
  it('leads the title with a countdown when a lead offset is set', async () => {
    await syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 15 }));
    const { content } = scheduleMock.mock.calls[0][0];
    // Title: "<prayer> om 15 min" — the countdown is the headline, not an
    // afterthought. The space before "min" is NBSP (fast mellanslag) so the
    // unit never wraps away from its number in a narrow banner.
    expect(content.title).toMatch(/ om 15 min$/);
    // Body: the durable clock time, e.g. "Klockan 14:32".
    expect(content.body).toMatch(/^Klockan \d{2}:\d{2}$/);
  });

  it('says it is time now when there is no lead offset', async () => {
    await syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 0 }));
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

    await syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 0 }));
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

  it('does not let an older enabled sync schedule after a newer disabled sync wins', async () => {
    let resolvePermission!: (value: Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>) => void;
    getPermissionsMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePermission = resolve;
        }),
    );

    const oldSync = syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 0 }));
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

    const oldSync = syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 0 }));
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

    await syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 0 }));

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
    await syncPrayerNotifications(STOCKHOLM, withNotifications({ leadMinutes: 0 }));
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
  it('creates the Android channel before asking for permission', async () => {
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

    expect(order).toEqual(['channel', 'request']);
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
