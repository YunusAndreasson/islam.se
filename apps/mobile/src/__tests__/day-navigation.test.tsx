// Day navigation, driven through the real map screen.
//
// The unit suites cover the parts: stockholm-time.test.ts the calendar arithmetic,
// useSolarClock.test.ts the clock contract, grid-cache.test.ts the memo, PrayerDock.test.tsx
// the controls. What only shows up when they are wired together is the set of things that
// must NOT happen when the user leaves today — because each of them is a subsystem that
// was written when today was the only day the app could show:
//
//   • the notification scheduler must not re-plan alerts around a browsed date;
//   • the soft-ask cards must not appear there, and must not SPEND a showing;
//   • the grid must not be rebuilt for a day already visited.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';

import Bonetider from '@/app/bonetider';
import { LocationProvider } from '@/lib/location/context';
import { resetLocationLaunchCountForTests } from '@/lib/location-hint';
import { resetNotificationLaunchCountForTests } from '@/lib/notification-hint';
import { SettingsProvider } from '@/lib/settings/context';
import * as field from '@/lib/solar/field';
import { __resetGridCache } from '@/lib/solar/grid-cache';

const LOCATION_HINT_KEY = 'locationHintSeen:v1';
const NOTIFICATION_HINT_KEY = 'notificationHintSeen:v1';
const MAP_RENDER_TIMEOUT = 30_000;

function withProviders(node: ReactNode) {
  return (
    <SettingsProvider>
      <LocationProvider>{node}</LocationProvider>
    </SettingsProvider>
  );
}

function permission(status: 'granted' | 'denied' | 'undetermined') {
  return {
    status,
    granted: status === 'granted',
    canAskAgain: status !== 'denied',
    expires: 'never',
  };
}

/** Renders the map and brings it to the state a user actually navigates from: camera
 *  settled. (There is no launch sweep to sit through any more — the map paints at the
 *  present moment from the first frame.) */
async function launchMap(): Promise<void> {
  render(withProviders(<Bonetider />));
  await act(async () => {});
  await act(async () => {
    fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', {
      nativeEvent: { zoom: 4.5, bounds: [11.15, 55.35, 23.7, 69.0] },
    });
  });
}

async function step(direction: 'Nästa dag' | 'Föregående dag'): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: direction }));
  });
}

// A fixed Stockholm mid-morning. Two tests below assert the dock is NOT showing
// "i morgon", which is only true while the day still has a prayer ahead of it — so on the
// real wall clock this suite went green all day and red every evening after ʿIshāʾ, on an
// unchanged commit. Only `Date` is faked; every timer API is left real so React Testing
// Library's async `act()` still flushes normally.
const PINNED_NOW = Date.UTC(2026, 4, 20, 7, 0, 0); // 20 May 2026, 09:00 Europe/Stockholm
const REAL_TIMER_APIS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'nextTick',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'performance',
  'hrtime',
] as const;

describe('stepping days on the map', () => {
  beforeEach(async () => {
    jest.useFakeTimers({ now: PINNED_NOW, doNotFake: [...REAL_TIMER_APIS] });
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    resetNotificationLaunchCountForTests();
    resetLocationLaunchCountForTests();
    __resetGridCache();
    // Both permissions answered, so the soft-ask queue has nothing to offer and the
    // tests below are about day navigation alone. (The one test that needs a live offer
    // sets its own permissions.)
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission('granted') as never);
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted') as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it(
    'moves the dock to another day and back again',
    async () => {
      await launchMap();
      // On today the dock says nothing about the day — there is nothing to say.
      expect(screen.queryByText('i morgon')).toBeNull();

      await step('Nästa dag');
      expect(screen.getByText('i morgon')).toBeTruthy();
      expect(screen.getByLabelText('Återgå till i dag')).toBeTruthy();

      await step('Nästa dag');
      expect(screen.getByText('i övermorgon')).toBeTruthy();

      // Back past today, to make sure the label follows in both directions.
      await step('Föregående dag');
      await step('Föregående dag');
      await step('Föregående dag');
      expect(screen.getByText('i går')).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  it(
    'returns to today — and to live mode — from the chip',
    async () => {
      await launchMap();
      await step('Nästa dag');

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Återgå till i dag'));
      });

      expect(screen.queryByText('i morgon')).toBeNull();
      // Live again, so the countdown is back and there is no return chip to press.
      expect(screen.queryByLabelText('Återgå till i dag')).toBeNull();
      expect(screen.queryByLabelText('Återgå till nu')).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );

  // THE COST THIS GUARDS. Each grid is 3752 adhan computations — 200–600 ms of blocked JS
  // on a mid-range Android. Stepping +1, −1, +1 visits only two distinct days, so it must
  // build exactly twice; a cache that missed would still render a correct map, just with a
  // stall on every single tap and nothing in the UI to show for it.
  it(
    'builds each visited day once, however often it is revisited',
    async () => {
      const buildGrid = jest.spyOn(field, 'buildGrid');
      await launchMap();
      const afterLaunch = buildGrid.mock.calls.length;

      await step('Nästa dag');
      await step('Föregående dag');
      await step('Nästa dag');
      await step('Föregående dag');

      // Two distinct days visited (today and tomorrow); today was already built at launch.
      expect(buildGrid.mock.calls.length - afterLaunch).toBe(1);
    },
    MAP_RENDER_TIMEOUT,
  );

  // The scheduler plans from the real clock and the user's settings, never from whatever
  // day happens to be on screen. Its independence from the viewed day is currently
  // STRUCTURAL — notifications.ts does not import the clock at all — and this is what
  // keeps it that way.
  it(
    'never re-plans notifications because of a browsed day',
    async () => {
      await launchMap();
      jest.mocked(Notifications.scheduleNotificationAsync).mockClear();

      for (let i = 0; i < 4; i++) await step('Nästa dag');
      await step('Föregående dag');

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    },
    MAP_RENDER_TIMEOUT,
  );
});

// The soft asks belong to the app's opening moment. A user who has travelled to next
// Friday is doing something deliberate, and a card about permissions on top of it is an
// interruption — worse, one that would burn a showing from a budget of two.
describe('the soft-ask queue while browsing another day', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    resetNotificationLaunchCountForTests();
    resetLocationLaunchCountForTests();
    __resetGridCache();
    jest.useFakeTimers();
    // A live offer waiting to happen: both permissions unasked.
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission('undetermined') as never);
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('undetermined') as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it(
    'shows no card on a stepped day, and spends no showing doing it',
    async () => {
      await launchMap();
      // Step away INSIDE the gate's 300 ms arming delay: the effect's cleanup runs first,
      // so the sequence aborts before noteNotificationShown() rather than after it. This is the exact
      // race the gate's "commit first, persist afterwards" ordering was written for.
      await step('Nästa dag');

      await act(async () => {
        jest.advanceTimersByTime(10_000);
      });
      await act(async () => {});

      expect(screen.queryByText('Visa tider för din plats')).toBeNull();
      expect(screen.queryByText('Påminn om bönetider')).toBeNull();
      // Not merely hidden — never counted. If a showing had been recorded, a user who
      // browsed on their first two launches would reach the two-showing cap having seen
      // nothing, and would never learn either feature exists.
      const locationRecord = await AsyncStorage.getItem(LOCATION_HINT_KEY);
      expect(locationRecord == null || JSON.parse(locationRecord).shown === 0).toBe(true);
      expect(await AsyncStorage.getItem(NOTIFICATION_HINT_KEY)).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );
});
