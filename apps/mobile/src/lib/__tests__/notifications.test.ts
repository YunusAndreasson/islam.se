import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionStatus } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';

import { syncPrayerNotifications } from '../notifications';
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
    // Title: "<prayer> om 15 min" — the countdown is the headline, not an afterthought.
    expect(content.title).toMatch(/ om 15 min$/);
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
});
