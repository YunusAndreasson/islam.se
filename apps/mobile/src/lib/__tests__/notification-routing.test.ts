import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { analytics } from '@/lib/analytics';
import {
  notificationAction,
  notificationPrayer,
  PRAYER_TIMES_ROUTE,
  routeToPrayerTimes,
  subscribeNotificationRouting,
} from '@/lib/notification-routing';
import { first } from '@/test-utils/at';

const listenerMock =
  Notifications.addNotificationResponseReceivedListener as unknown as jest.MockedFunction<
    typeof Notifications.addNotificationResponseReceivedListener
  >;
const navigateMock = router.navigate as unknown as jest.MockedFunction<typeof router.navigate>;

describe('notification routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listenerMock.mockImplementation(() => ({ remove: jest.fn() }));
  });

  it('sends a tapped alert to Bönetider', () => {
    // The alert's action button says "Visa bönetider". A cold start honours that by
    // way of the "/" redirect, but a warm app used to just foreground whichever sheet
    // was open — so tapping a prayer reminder could land you in Inställningar.
    subscribeNotificationRouting();
    const handler = first(first(listenerMock.mock.calls, 'listener calls'), 'listener arg');
    handler({} as never);
    expect(navigateMock).toHaveBeenCalledWith(PRAYER_TIMES_ROUTE);
  });

  it('navigates rather than pushes, so the map is never stacked on itself', () => {
    // Bönetider is the root of the stack; `push` would leave a second copy of the map
    // behind the first, and Android's back button would walk through the duplicates.
    routeToPrayerTimes();
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('survives a response that arrives before the navigator is ready', () => {
    // expo-notifications can deliver a response during startup; a throw here would take
    // down the root layout for a notification the user did nothing wrong to send.
    navigateMock.mockImplementationOnce(() => {
      throw new Error('navigation not ready');
    });
    expect(() => routeToPrayerTimes()).not.toThrow();
  });

  it('unsubscribes the listener it registered', () => {
    const remove = jest.fn();
    listenerMock.mockImplementation(() => ({ remove }));
    subscribeNotificationRouting()();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

/** A tap on a scheduled prayer alert, shaped as expo-notifications delivers it. */
function tap(id: string, key: unknown, actionIdentifier = Notifications.DEFAULT_ACTION_IDENTIFIER) {
  return {
    actionIdentifier,
    notification: { request: { identifier: id, content: { data: { key, silent: false, source: 'prayer-times' } } } },
  } as unknown as Notifications.NotificationResponse;
}

/** analytics.track, recorded: what each test reads back is exactly what was sent. */
const spyOnTrack = () => jest.spyOn(analytics, 'track').mockResolvedValue(undefined);

describe('Notification Opened', () => {
  const lastResponseMock = jest.mocked(Notifications.getLastNotificationResponse);
  let track: ReturnType<typeof spyOnTrack>;

  beforeEach(() => {
    jest.clearAllMocks();
    listenerMock.mockImplementation(() => ({ remove: jest.fn() }));
    track = spyOnTrack();
  });
  afterEach(() => {
    track.mockRestore();
    lastResponseMock.mockReturnValue(null);
  });

  it('reports the tap that started the app as cold, once, however many times it is delivered', () => {
    // A cold tap is waiting as the last response when the root mounts, and expo can hand
    // the same response to the listener as well. Two events for one tap would double the
    // number this event exists to measure: whether reminders bring readers back.
    lastResponseMock.mockReturnValue(tap('cold-1', 'fajr'));
    subscribeNotificationRouting();
    const handler = first(first(listenerMock.mock.calls, 'listener calls'), 'listener arg');
    handler(tap('cold-1', 'fajr'));
    expect(track.mock.calls).toEqual([
      ['Notification Opened', { prayer: 'fajr', action: 'tap', cold: true }],
    ]);
    // Routing is not analytics' to skip: the duplicate still lands on the prayer times.
    expect(navigateMock).toHaveBeenCalledWith(PRAYER_TIMES_ROUTE);
  });

  it('still routes a response with nothing in it, and reports nothing for it', () => {
    subscribeNotificationRouting();
    const handler = first(first(listenerMock.mock.calls, 'listener calls'), 'listener arg');
    handler({} as never);
    expect(navigateMock).toHaveBeenCalledWith(PRAYER_TIMES_ROUTE);
    expect(track).not.toHaveBeenCalled();
  });

  it('names the alert by its slot and the button by what it is, never by anything else', () => {
    expect(notificationPrayer({ key: 'isha' })).toBe('isha');
    expect(notificationPrayer({ key: 'sunrise' })).toBe('sunrise');
    expect(notificationPrayer({ key: 'lastThird' })).toBe('lastThird');
    // Whatever else an alert might carry is not echoed into Mixpanel.
    expect(notificationPrayer({ key: 'Göteborg 59.3,18.0' })).toBe('other');
    expect(notificationPrayer(undefined)).toBe('other');
    expect(notificationAction(Notifications.DEFAULT_ACTION_IDENTIFIER)).toBe('tap');
    expect(notificationAction('open-prayer-times')).toBe('button');
    expect(notificationAction(undefined)).toBe('other');
  });
});
