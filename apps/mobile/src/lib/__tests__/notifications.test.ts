import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PermissionStatus } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';

import { syncPrayerNotifications } from '../notifications';
import { DEFAULT_SETTINGS, type PrayerSettings } from '../settings/types';

// Stockholm — below the Arctic Circle, so all five prayers resolve to valid times
// across the 7-day scheduling window (no polar-circle NaNs to muddy the comparison).
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };

// expo-notifications is mocked in jest.setup.js; read the recorded schedule calls.
const scheduleMock = Notifications.scheduleNotificationAsync as unknown as {
  mock: { calls: [{ trigger: { date: Date } }][] };
  mockClear: () => void;
};
const getPermissionsMock = Notifications.getPermissionsAsync as unknown as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const cancelMock = Notifications.cancelAllScheduledNotificationsAsync as unknown as {
  mock: { calls: unknown[] };
};

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
  beforeEach(() => {
    scheduleMock.mockClear();
    jest.clearAllMocks();
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

  it('schedules nothing when notifications are disabled', async () => {
    await syncPrayerNotifications(STOCKHOLM, {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false },
    });
    expect(scheduledTimes()).toHaveLength(0);
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
    await Promise.resolve();
    expect(cancelMock.mock.calls.length).toBeGreaterThan(0);

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
