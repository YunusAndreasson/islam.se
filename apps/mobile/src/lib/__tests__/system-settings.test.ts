// Where the app hands the reader over to the OS, and — since this change — the fact that
// "the OS" is not one destination.
//
// Two things stop a correctly scheduled Android alert without the app being able to see or
// fix either: a notification CHANNEL muted from the shade (a sound choice is a channel, and
// a channel's sound is frozen at creation), and an OEM battery manager putting a
// rarely-opened app into a sleep that drops exact alarms. Both live on their own system
// screens. `Linking.openSettings()` reaches neither — it opens the app's generic page and
// leaves the reader to find the right sub-screen themselves, which for battery optimisation
// on a Samsung is several levels down under a name that varies by ROM.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import {
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  openNotificationSettings,
  openSystemSettings,
} from '@/lib/system-settings';

const startActivity = IntentLauncher.startActivityAsync as unknown as jest.MockedFunction<
  typeof IntentLauncher.startActivityAsync
>;
const openSettings = Linking.openSettings as unknown as jest.MockedFunction<
  typeof Linking.openSettings
>;

/** Run with Platform.OS pinned, then restore. */
function withPlatform(os: 'ios' | 'android', run: () => void): void {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  try {
    run();
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
  }
}

afterEach(() => {
  startActivity.mockClear();
  openSettings.mockClear();
  startActivity.mockResolvedValue({ resultCode: -1 });
});

describe('a permission hand-off', () => {
  it('goes to the app page on both platforms', () => {
    // Unchanged, and deliberately so: a permission genuinely does live on the app's own
    // settings page everywhere. Only the two below needed somewhere else to go.
    withPlatform('android', openSystemSettings);
    withPlatform('ios', openSystemSettings);
    expect(openSettings).toHaveBeenCalledTimes(2);
    expect(startActivity).not.toHaveBeenCalled();
  });
});

describe('the notification hand-off', () => {
  it('opens this app\'s channel list on Android', () => {
    withPlatform('android', openNotificationSettings);

    const [action, params] = startActivity.mock.calls[0] ?? [];
    expect(action).toBe(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS);
    // Without the package extra this intent opens the SYSTEM-WIDE notification settings and
    // the reader has to find this app in a list of every app on the phone.
    expect(params?.extra).toEqual({ 'android.provider.extra.APP_PACKAGE': 'se.islam.mobile' });
  });

  it('falls back to the app page on iOS, where channels do not exist', () => {
    withPlatform('ios', openNotificationSettings);

    expect(startActivity).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalled();
  });

  it('falls back to the app page when the ROM will not answer the intent', async () => {
    startActivity.mockRejectedValueOnce(new Error('no activity found to handle Intent'));

    withPlatform('android', openNotificationSettings);
    await Promise.resolve();
    await Promise.resolve();

    // A dead end is the one outcome that is worse than the generic page.
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('the battery-optimisation hand-off', () => {
  it('opens the exemption list on Android', () => {
    withPlatform('android', openBatteryOptimizationSettings);

    expect(startActivity.mock.calls[0]?.[0]).toBe(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
    );
  });

  it('never sends an iOS reader looking for a setting that does not exist', () => {
    withPlatform('ios', openBatteryOptimizationSettings);

    expect(startActivity).not.toHaveBeenCalled();
  });
});

describe('the exact-alarm hand-off', () => {
  const requestExact = jest.mocked(Notifications.requestExactAlarmPermissionsAsync);
  afterEach(() => {
    requestExact.mockClear();
  });

  it('opens Android\'s "Alarm och påminnelser" page for this app', () => {
    withPlatform('android', openExactAlarmSettings);
    expect(requestExact).toHaveBeenCalledTimes(1);
    expect(openSettings).not.toHaveBeenCalled();
  });

  // It rejects only when SCHEDULE_EXACT_ALARM is undeclared. A tap must still land the
  // reader somewhere they can act, not on nothing.
  it('falls back to the app page when the request cannot open', async () => {
    requestExact.mockRejectedValueOnce(new Error('SCHEDULE_EXACT_ALARM not declared'));
    withPlatform('android', openExactAlarmSettings);
    await Promise.resolve();
    await Promise.resolve();
    expect(openSettings).toHaveBeenCalled();
  });

  it('never calls the Android-only API on iOS', () => {
    withPlatform('ios', openExactAlarmSettings);
    expect(requestExact).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalled();
  });
});
