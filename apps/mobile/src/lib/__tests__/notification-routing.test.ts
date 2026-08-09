import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import {
  PRAYER_TIMES_ROUTE,
  routeToPrayerTimes,
  subscribeNotificationRouting,
} from '@/lib/notification-routing';

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
    const handler = listenerMock.mock.calls[0][0];
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
