import { beforeEach, expect, it, jest } from '@jest/globals';
import type { NotificationResponse } from 'expo-notifications';

import { first } from '@/test-utils/at';

// Native keeps this identifier across bundle updates. Looking it up by the app's
// exported constant would hide a rename that strands existing installations.
const persistedTask = 'prayer-notification-refresh';
const loadWorker = jest.fn(() => ({ refreshPrayerSurfaces: jest.fn(async () => true) }));

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.doMock('@/lib/refresh-prayer-surfaces', loadWorker);
  jest.doMock('expo-router/entry', () => ({})); // Registering the root never renders it.
});

// A background wake-up can be the first execution of an updated bundle. Each fresh JS
// runtime must install its own handlers and rewrite the layouts native renders by name.
it('can service an existing OS registration on both the first and the post-update headless start', async () => {
  for (const boot of ['embedded', 'updated']) {
    jest.resetModules();
    const layouts = new Map<string, string>();
    const registerLayout = (name: string, layout: string) => {
      expect(typeof layout).toBe('string'); // What the installed widget Babel plugin serializes.
      expect(layouts.has(name)).toBe(false); // The two platform widgets share one native name.
      layouts.set(name, layout);
      return {};
    };
    jest.doMock('expo-widgets', () => ({
      createWidget: registerLayout,
      createLiveActivity: registerLayout,
      createCustomNotification: registerLayout,
    }));
    const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    const notifications = jest.requireMock<jest.Mocked<typeof import('expo-notifications')>>('expo-notifications');
    const defineTask = jest.requireMock<{ defineTask: jest.Mock<(name: string, run: () => Promise<number>) => void> }>(
      'expo-task-manager',
    ).defineTask;
    const onRootRegistration = jest.fn(() => {
      expect(defineTask.mock.calls.map(([name]) => name)).toContain(persistedTask);
      expect(notifications.setNotificationHandler.mock.calls).toHaveLength(1);
      expect(notifications.addNotificationResponseReceivedListener.mock.calls).toHaveLength(1);
      expect([...layouts.keys()].sort()).toEqual(
        Platform.OS === 'ios' ? ['PrayerLiveActivity', 'PrayerTimesWidget'] : ['PrayerOngoingNotification', 'PrayerTimesWidget'],
      );
      expect(loadWorker).not.toHaveBeenCalled();
      return {};
    });
    jest.doMock('expo-router/entry', onRootRegistration);
    jest.requireActual('../../index');
    expect(onRootRegistration).toHaveBeenCalledTimes(1);

    const task = defineTask.mock.calls.find(([name]) => name === persistedTask);
    if (!task) throw new Error(`The OS cannot run its persisted refresh on the ${boot} bundle`);
    const { BackgroundTaskResult } = jest.requireMock<typeof import('expo-background-task')>('expo-background-task');
    await expect(task[1]()).resolves.toBe(BackgroundTaskResult.Success);
    expect(loadWorker).toHaveBeenCalledTimes(1);
    loadWorker.mockClear();
  }
});

// An action can arrive before Expo Router has mounted a single screen. Capture it at
// entry and preserve the cold-launch gate, including when native later replays the tap.
it('handles presentation and retains a notification action before the root mounts', async () => {
  jest.doMock('expo-widgets', () => ({
    createWidget: jest.fn(), createLiveActivity: jest.fn(), createCustomNotification: jest.fn(),
  }));
  const notifications = jest.requireMock<jest.Mocked<typeof import('expo-notifications')>>('expo-notifications');
  const { router } = jest.requireMock<jest.Mocked<typeof import('expo-router')>>('expo-router');
  const { analytics } = jest.requireActual<typeof import('@/lib/analytics')>('@/lib/analytics');
  const track = jest.spyOn(analytics, 'track').mockResolvedValue(undefined);
  jest.requireActual('../../index');

  const response: NotificationResponse = {
    actionIdentifier: 'open-prayer-times',
    notification: {
      date: 0,
      request: {
        identifier: 'cold-action',
        trigger: null,
        content: {
          title: 'Fajr', subtitle: null, body: null, sound: null,
          categoryIdentifier: 'prayer-reminder', threadIdentifier: 'prayer-times',
          data: { key: 'fajr', silent: true },
        },
      },
    },
  };
  const [presentation] = first(notifications.setNotificationHandler.mock.calls, 'entry presentation handler');
  if (!presentation) throw new Error('Alerts arriving during startup have no presentation handler');
  await expect(presentation.handleNotification(response.notification)).resolves.toMatchObject({
    shouldShowBanner: true, shouldShowList: true, shouldSetBadge: false,
  });
  const [receive] = first(notifications.addNotificationResponseReceivedListener.mock.calls, 'entry tap handler');
  receive(response);
  expect(track).not.toHaveBeenCalled();
  expect(router.navigate.mock.calls).toHaveLength(0);
  expect(loadWorker).not.toHaveBeenCalled();

  // Native has no cached response here. The action must survive solely via the entry listener.
  const { subscribeNotificationRouting } = jest.requireActual<typeof import('@/lib/notification-routing')>(
    '@/lib/notification-routing',
  );
  const unsubscribe = subscribeNotificationRouting();
  expect(track.mock.calls).toEqual([['Notification Opened', { prayer: 'fajr', action: 'button', cold: true }]]);
  expect(router.navigate.mock.calls).toHaveLength(0);
  const [mountedListener] = first(notifications.addNotificationResponseReceivedListener.mock.calls.slice(1), 'mounted tap handler');
  mountedListener(response);
  expect(track).toHaveBeenCalledTimes(1);
  expect(router.navigate.mock.calls).toEqual([['/bonetider']]);
  unsubscribe();
});
