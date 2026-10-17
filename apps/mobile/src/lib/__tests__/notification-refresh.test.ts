// The background wake-up that keeps the rolling notification window advancing.
//
// The bug this suite exists for cannot be seen by using the app: it only appears for a
// reader who DOESN'T. iOS holds at most 60 of our pending alerts, which is about a
// fortnight of prayers, so an app that is never opened simply stops notifying — silently,
// with a correct-looking Påminnelser screen. Everything below is about the task the OS
// calls in that situation, and about it doing the right thing in the states the OS can put
// us in (reminders off, background execution restricted, storage unreadable).
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { readCachedFix } from '@/lib/location/gps-cache';
import { resetSyncStateForTests } from '@/lib/notifications';
import { SETTINGS_STORAGE_KEY } from '@/lib/settings/store';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { storage } from '@/lib/storage';

import {
  PRAYER_REFRESH_TASK,
  registerNotificationRefresh,
} from '@/lib/notification-refresh';
import { syncPrayerLiveActivity } from '@/widget/live-activity';
import { syncPrayerWidget } from '@/widget/sync';

// The two surfaces the wake-up also refreshes, observed rather than run: both reach their
// native module through a dynamic import Jest cannot execute, so what is worth pinning here
// is THAT and HOW this task calls them.
jest.mock('@/widget/sync', () => ({ syncPrayerWidget: jest.fn(async () => {}) }));
jest.mock('@/widget/live-activity', () => ({ syncPrayerLiveActivity: jest.fn(async () => {}) }));
const widgetSync = jest.mocked(syncPrayerWidget);
const liveActivitySync = jest.mocked(syncPrayerLiveActivity);

const defineTask = TaskManager.defineTask as unknown as jest.MockedFunction<
  (name: string, executor: () => Promise<number>) => void
>;
const registerTask = BackgroundTask.registerTaskAsync as unknown as jest.MockedFunction<
  typeof BackgroundTask.registerTaskAsync
>;
const getStatus = BackgroundTask.getStatusAsync as unknown as jest.MockedFunction<
  typeof BackgroundTask.getStatusAsync
>;
const scheduleMock = Notifications.scheduleNotificationAsync as unknown as jest.MockedFunction<
  typeof Notifications.scheduleNotificationAsync
>;

/** The function the OS would call on a wake-up — captured from the module-scope
 *  defineTask, which is the only place it is ever handed out. */
function taskExecutor(): () => Promise<number> {
  const call = defineTask.mock.calls.find(([name]) => name === PRAYER_REFRESH_TASK);
  if (!call) throw new Error('the refresh task was never defined — nothing would wake the app');
  return call[1];
}

const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };

beforeEach(async () => {
  await storage.removeItem(SETTINGS_STORAGE_KEY);
  await storage.removeItem('lastGpsCoords:v1');
  resetSyncStateForTests();
  scheduleMock.mockClear();
  widgetSync.mockClear();
  liveActivitySync.mockClear();
  registerTask.mockClear();
  getStatus.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Available);
});

describe('the task definition', () => {
  it('is registered at import time, not on mount', () => {
    // The OS starts a bare JS runtime and looks the task up by name immediately. A
    // definition that waited for a component would not exist yet and the wake-up — which
    // iOS grants sparingly and may not grant again for days — would be spent on nothing.
    expect(() => taskExecutor()).not.toThrow();
  });
});

describe('a background wake-up', () => {
  it('re-seeds the window from the cached fix', async () => {
    await storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } }),
    );
    await storage.setItem('lastGpsCoords:v1', JSON.stringify(STOCKHOLM));

    const result = await taskExecutor()();

    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(scheduleMock.mock.calls.length).toBeGreaterThan(0);
  });

  it('schedules no alerts when reminders are switched off', async () => {
    await storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false } }),
    );

    const result = await taskExecutor()();

    // Reporting Success here is deliberate: there was nothing to do, and reporting failure
    // would teach the scheduler to back off from a task that is working correctly.
    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('schedules for the default location when no fix was ever cached', async () => {
    // A reader who picked a city by hand, or who never granted location: the task cannot
    // start the GPS from the background, so the resolution table's fallback IS the answer.
    await storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } }),
    );
    expect(await readCachedFix()).toBeNull();

    const result = await taskExecutor()();

    expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(scheduleMock.mock.calls.length).toBeGreaterThan(0);
  });

  it('survives a notification centre that refuses, and never throws into the OS', async () => {
    // syncPrayerNotifications already swallows scheduling failures by design — permissions
    // revoked mid-flight, an OS quota — and saves whatever it managed to schedule. What
    // this pins is the boundary above it: whatever happens in there, the executor RESOLVES.
    // An executor that rejected would surface to the OS as a crashed background task, and
    // both platforms respond to that by scheduling us less often — turning one bad wake-up
    // into a lastingly worse one.
    await storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } }),
    );
    scheduleMock.mockRejectedValueOnce(new Error('notification centre unavailable'));

    await expect(taskExecutor()()).resolves.toBe(BackgroundTask.BackgroundTaskResult.Success);
  });
});

describe('the other surfaces the same wake-up refreshes', () => {
  const remindersOff = JSON.stringify({
    ...DEFAULT_SETTINGS,
    notifications: { ...DEFAULT_SETTINGS.notifications, enabled: false },
  });

  // Neither is a reminder, so switching reminders off must not freeze the widget on a past
  // prayer or leave a stale »Dags för …« on the Lock Screen overnight.
  it('re-pushes the widget and reconciles the Live Activity even with reminders off', async () => {
    await storage.setItem(SETTINGS_STORAGE_KEY, remindersOff);
    await taskExecutor()();
    expect(widgetSync).toHaveBeenCalledTimes(1);
    expect(liveActivitySync).toHaveBeenCalledTimes(1);
  });

  // ActivityKit refuses to START an activity from the background. The task may update or
  // end one, never start one.
  it('never asks for a Live Activity to be started', async () => {
    await storage.setItem(SETTINGS_STORAGE_KEY, remindersOff);
    await taskExecutor()();
    const options = liveActivitySync.mock.calls[0]?.[4];
    expect(options).toEqual({ canStart: false });
  });

  it('re-seeds the alerts before anything else gets a chance to fail', async () => {
    await storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true } }),
    );
    widgetSync.mockRejectedValueOnce(new Error('WidgetKit unavailable'));

    await taskExecutor()();

    // A widget that cannot reload must never cost the reader their alerts.
    expect(scheduleMock.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('registration', () => {
  it('asks the OS to start waking us', async () => {
    await registerNotificationRefresh();

    expect(registerTask).toHaveBeenCalledWith(PRAYER_REFRESH_TASK, {
      minimumInterval: expect.any(Number),
    });
  });

  it('stays quiet when background execution is restricted', async () => {
    // Low Power Mode, Background App Refresh switched off, a managed device. A normal
    // state to be in — not an error, and not something to pester the OS about.
    getStatus.mockResolvedValue(BackgroundTask.BackgroundTaskStatus.Restricted);

    await registerNotificationRefresh();

    expect(registerTask).not.toHaveBeenCalled();
  });

  it('never throws, whatever the scheduler says', async () => {
    getStatus.mockRejectedValueOnce(new Error('no background scheduler'));

    await expect(registerNotificationRefresh()).resolves.toBeUndefined();
  });
});
