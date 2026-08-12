// The map's two soft asks, as ONE ordered queue.
//
// The app stands in front of two OS permission dialogs — location and notifications — and
// each is spent exactly once per install. Both are therefore offered by a card that
// explains first, and both cards land on the same piece of screen after the daybreak
// intro. That makes their interaction, not either card on its own, the thing most likely
// to go wrong: two unprompted cards stacking, or the second one's single retry being
// silently burned on launches where it was never rendered.
//
// The contract, asserted below:
//   1. At most ONE card per launch.
//   2. Location goes first — a reminder for the wrong city's Fajr is a reminder at the
//      wrong time, so the position question is a prerequisite for the reminder question.
//   3. A deferred card is DEFERRED, not consumed: its own record is untouched.
//   4. A user who already named their city is never asked for GPS on top of it.
//   5. Nothing fires behind the introduction, which asks the same two questions itself.
//
// (The cards themselves are covered in components/map/{Location,Notification}Hint.test.tsx;
// the frequency policy in lib/__tests__/{hints,notification-hint}.test.ts. This file only
// exercises the sequencing that bonetider.tsx owns.)
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';

import Bonetider from '@/app/bonetider';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { resetLocationLaunchCountForTests } from '@/lib/location-hint';
import { resetNotificationLaunchCountForTests } from '@/lib/notification-hint';
import { SettingsProvider } from '@/lib/settings/context';

const SETTINGS_KEY = 'prayerSettings:v1';
const LOCATION_HINT_KEY = 'locationHintSeen:v1';
const NOTIFICATION_HINT_KEY = 'notificationHintSeen:v1';

// Mirrors the beat timings in bonetider.tsx. Duplicated rather than exported because the
// test asserts the SEQUENCE, not the numbers — if a beat is retuned, this still passes.
const REVEAL_DELAY_MS = 300;
const REVEAL_HOLD_MS = 2500;
const HINT_AFTER_REVEAL_MS = 700;

const MAP_RENDER_TIMEOUT = 20_000;

/** `introSeen` decides whether the map may arm its queue at all. The default is the
 *  settled world these tests are about: the introduction is behind the user. Passing
 *  false stands the wizard back up in front of the map. */
function withProviders(node: ReactNode, introSeen = true) {
  return (
    <SettingsProvider>
      {introSeen ? (
        // No IntroProvider: useOptionalIntroStatus falls back to 'done', which is exactly
        // how every other screen test mounts this screen.
        <LocationProvider>{node}</LocationProvider>
      ) : (
        <IntroProvider>
          <LocationProvider>{node}</LocationProvider>
        </IntroProvider>
      )}
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

function setPermissions(location: 'granted' | 'denied' | 'undetermined', notifications: 'granted' | 'denied' | 'undetermined') {
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission(location) as never);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission(notifications) as never);
}

/** Renders the map and brings it to the state where the offer gate is armed: the camera
 *  has settled (every overlay is gated on the first settled region event). */
async function launchMap(introSeen = true): Promise<void> {
  render(withProviders(<Bonetider />, introSeen));
  await act(async () => {});

  await act(async () => {
    fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', {
      nativeEvent: { zoom: 4.5, bounds: [11.15, 55.35, 23.7, 69.0] },
    });
  });

}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  // The gate's work is a chain of awaits (permission read → hint record → decision), so
  // the timer firing is only the start of it.
  await act(async () => {});
}

/** Runs the whole launch sequence: the gate decides, the dock reveals the day's times,
 *  holds, shuts, and only then does a card arrive. */
async function runOfferSequence(): Promise<void> {
  await advance(REVEAL_DELAY_MS);
  await advance(REVEAL_HOLD_MS);
  await advance(HINT_AFTER_REVEAL_MS);
}

const locationCard = () => screen.queryByText('Visa tider för din plats');
const notificationCard = () => screen.queryByText('Påminn om bönetider');

describe('the map offers at most one soft ask per launch', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    resetNotificationLaunchCountForTests();
    resetLocationLaunchCountForTests();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it(
    'asks for location first and leaves the notification hint completely untouched',
    async () => {
      setPermissions('undetermined', 'undetermined');

      await launchMap();
      await runOfferSequence();

      expect(locationCard()).toBeTruthy();
      // Contract 1: the two cards never share the screen.
      expect(notificationCard()).toBeNull();
      // Contract 3, and the reason lib/hints gives each store its own launch guard: the
      // notification hint is DEFERRED, not consumed. If this record existed, launches
      // spent showing the location card would tick the notification card's retry clock
      // forward, and a user who dismissed location twice could reach the two-showing cap
      // on a card they had never seen — never learning prayer reminders exist at all.
      expect(await AsyncStorage.getItem(NOTIFICATION_HINT_KEY)).toBeNull();

      const stored = JSON.parse((await AsyncStorage.getItem(LOCATION_HINT_KEY)) as string);
      expect(stored).toEqual({ launches: 1, shown: 1, resolved: false });
    },
    MAP_RENDER_TIMEOUT,
  );

  it(
    'does not follow one card with the other in the same launch',
    async () => {
      setPermissions('undetermined', 'undetermined');

      await launchMap();
      await runOfferSequence();
      fireEvent.press(screen.getByLabelText('Stäng'));

      // Give the sequence every chance to restart: the gate's conditions are all still
      // true after a dismissal, and only introOfferDone stops it.
      await advance(REVEAL_DELAY_MS + REVEAL_HOLD_MS + HINT_AFTER_REVEAL_MS);

      expect(locationCard()).toBeNull();
      expect(notificationCard()).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );

  it(
    'moves on to reminders once the location question is settled',
    async () => {
      setPermissions('granted', 'undetermined');

      await launchMap();
      await runOfferSequence();

      expect(notificationCard()).toBeTruthy();
      expect(locationCard()).toBeNull();
      // The queue drained rather than skipped: nothing was recorded against location.
      expect(await AsyncStorage.getItem(LOCATION_HINT_KEY)).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );

  // Contract 4. Someone who has picked a city by hand has answered the location question
  // in the way the app offered them; asking for GPS on top of that second-guesses them.
  it(
    'never asks for GPS from a user who already named their city',
    async () => {
      await AsyncStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          locationMode: 'manual',
          manualLocation: { name: 'Göteborg', latitude: 57.7089, longitude: 11.9746 },
        }),
      );
      setPermissions('undetermined', 'undetermined');

      await launchMap();
      await runOfferSequence();

      expect(locationCard()).toBeNull();
      expect(notificationCard()).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  // The dock opening itself is part of the OFFER, not a standalone animation: if there is
  // nothing to ask, a daily user must not sit through the reveal on every cold launch.
  it(
    'stays quiet — and shows no card at all — when both permissions are answered',
    async () => {
      setPermissions('granted', 'granted');

      await launchMap();
      await runOfferSequence();

      expect(locationCard()).toBeNull();
      expect(notificationCard()).toBeNull();
      expect(await AsyncStorage.getItem(LOCATION_HINT_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(NOTIFICATION_HINT_KEY)).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );

  // Contract 5, added with the introduction (src/app/valkommen). The intro asks these same
  // two questions with a screen of context in front of them, and covers the map while it
  // does. If the queue armed anyway it would spend a showing on a card nobody can see —
  // and could put the OS dialog on screen BEHIND the wizard, which is the exact failure
  // the soft asks exist to prevent. index.tsx already routes a pending intro away from the
  // map; this asserts the second guard, for any path that doesn't go through it.
  it(
    'never fires behind the introduction',
    async () => {
      setPermissions('undetermined', 'undetermined');

      await launchMap(false);
      await runOfferSequence();

      expect(locationCard()).toBeNull();
      expect(notificationCard()).toBeNull();
      // Deferred, not consumed — the introduction has not answered anything on the user's
      // behalf, so neither card may have spent one of its two showings.
      expect(await AsyncStorage.getItem(LOCATION_HINT_KEY)).toBeNull();
      expect(await AsyncStorage.getItem(NOTIFICATION_HINT_KEY)).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );
});
