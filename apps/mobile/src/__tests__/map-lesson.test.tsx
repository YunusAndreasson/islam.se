// The map lesson (MapLessonCard) on the real map — the seam onboarding.test.tsx cannot
// reach (it never mounts bonetider.tsx) and soft-ask-queue.test.tsx doesn't touch (its
// launchMap() always renders with the lesson already behind the user). Three things
// worth pinning here, none obvious from either file alone:
//
//   1. mapLessonPending swaps PrayerDock for MapLessonCard outright — not a smaller
//      overlay alongside it.
//   2. Stepping through the curated examples and dismissing (early or at the end) both
//      work, and both clear the flag the same way.
//   3. The lesson holds the screen's OWN soft-ask sequence back until it's dismissed —
//      armOffer's `!mapLessonPending` guard — so a skipped wizard step still gets its
//      later chance right after, never behind the lesson.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import Bonetider from '@/app/bonetider';
import { IntroProvider, useIntro } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { resetLocationLaunchCountForTests } from '@/lib/location-hint';
import { resetNotificationLaunchCountForTests } from '@/lib/notification-hint';
import { SettingsProvider } from '@/lib/settings/context';
import { __resetDemoCache, MAP_LESSON_EXAMPLES } from '@/lib/solar/demo-year';
import { at, first } from '@/test-utils/at';

// Mirrors bonetider.tsx's own beats — duplicated rather than imported so this asserts the
// SEQUENCE, not the numbers (same reasoning soft-ask-queue.test.tsx gives).
const REVEAL_DELAY_MS = 300;
const REVEAL_HOLD_MS = 2500;
const HINT_AFTER_REVEAL_MS = 700;
const MAP_RENDER_TIMEOUT = 20_000;
// bonetider.tsx's own safety net for the reveal cover. Duplicated rather than imported
// for the same reason as the beats above: this asserts that a net EXISTS, not its value.
const MAP_REVEAL_TIMEOUT_MS = 8000;

function permission(status: 'granted' | 'denied' | 'undetermined') {
  return { status, granted: status === 'granted', canAskAgain: status !== 'denied', expires: 'never' };
}

/** Arms mapLessonPending the same way valkommen.tsx's finish() does — complete() — before
 *  Bonetider ever mounts, so this simulates landing on the map right after the wizard. */
function JustFinishedOnboarding() {
  const { complete } = useIntro();
  useEffect(() => {
    complete();
  }, [complete]);
  return <Bonetider />;
}

async function launchWithLessonPending(): Promise<void> {
  render(
    <SettingsProvider>
      <IntroProvider>
        <LocationProvider>
          <JustFinishedOnboarding />
        </LocationProvider>
      </IntroProvider>
    </SettingsProvider>,
  );
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
  await act(async () => {});
}

/** The gate's work between beats is a chain of awaits (permission read → hint record →
 *  decision), so each beat needs its own settle before the next timer it schedules
 *  exists to advance into — one combined advance() would fire the first timer but miss
 *  the ones its own async callback goes on to schedule. Mirrors soft-ask-queue.test.tsx's
 *  runOfferSequence exactly. */
async function runOfferSequence(): Promise<void> {
  await advance(REVEAL_DELAY_MS);
  await advance(REVEAL_HOLD_MS);
  await advance(HINT_AFTER_REVEAL_MS);
}

describe('the map lesson', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    resetLocationLaunchCountForTests();
    resetNotificationLaunchCountForTests();
    __resetDemoCache();
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue(permission('undetermined') as never);
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValue(permission('undetermined') as never);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it(
    'takes the dock\'s slot on the one landing it is armed for',
    async () => {
      await launchWithLessonPending();

      expect(screen.getByText(first(MAP_LESSON_EXAMPLES, 'MAP_LESSON_EXAMPLES').fact)).toBeTruthy();
      expect(screen.getByLabelText('Nästa exempel')).toBeTruthy();
      // The dock it replaced is gone, not just covered — same slot, mutually exclusive.
      expect(screen.queryByLabelText('Föregående dag')).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );

  it(
    'steps forward and back through the curated examples',
    async () => {
      await launchWithLessonPending();

      fireEvent.press(screen.getByLabelText('Nästa exempel'));
      expect(screen.getByText(at(MAP_LESSON_EXAMPLES, 1, 'MAP_LESSON_EXAMPLES').fact)).toBeTruthy();
      expect(screen.queryByText(first(MAP_LESSON_EXAMPLES, 'MAP_LESSON_EXAMPLES').fact)).toBeNull();

      fireEvent.press(screen.getByLabelText('Föregående exempel'));
      expect(screen.getByText(first(MAP_LESSON_EXAMPLES, 'MAP_LESSON_EXAMPLES').fact)).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  it(
    'turns the last example\'s forward control into the finishing action',
    async () => {
      await launchWithLessonPending();

      for (let i = 1; i < MAP_LESSON_EXAMPLES.length; i++) {
        fireEvent.press(screen.getByLabelText('Nästa exempel'));
      }
      expect(screen.getByText(MAP_LESSON_EXAMPLES.at(-1)!.fact)).toBeTruthy();
      expect(screen.queryByLabelText('Nästa exempel')).toBeNull();

      fireEvent.press(screen.getByLabelText('Klart'));

      expect(screen.queryByText(MAP_LESSON_EXAMPLES.at(-1)!.fact)).toBeNull();
      expect(screen.queryByLabelText('Föregående dag')).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  it(
    'can be skipped outright, from the first example',
    async () => {
      await launchWithLessonPending();

      fireEvent.press(screen.getByLabelText('Stäng'));

      expect(screen.queryByText(first(MAP_LESSON_EXAMPLES, 'MAP_LESSON_EXAMPLES').fact)).toBeNull();
      // The dock is back — same slot the lesson borrowed.
      expect(screen.queryByLabelText('Föregående dag')).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  it(
    'holds the map\'s own soft-ask sequence back until it is dismissed',
    async () => {
      await launchWithLessonPending();
      await runOfferSequence();

      // Both permissions are undetermined — on any other launch this sequence would
      // have surfaced a card by now. Behind the lesson, it must not have.
      expect(screen.queryByText('Visa tider för din plats')).toBeNull();
      expect(screen.queryByText('Påminn om bönetider')).toBeNull();

      fireEvent.press(screen.getByLabelText('Stäng'));
      await runOfferSequence();

      // Dismissing hands the screen straight to the sequence a skipped wizard step left
      // waiting — the soft-ask asymmetry's "later, calmer chance", now redeemed.
      expect(screen.queryByText('Visa tider för din plats')).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  // THE BUG: MapLibre fills its own surface with a pale grey until the first tiles
  // composite, so this landing — the very first time the map is ever drawn — arrived as a
  // near-white flash across a dark screen, seconds long on a cold cache. There is no prop
  // for that fill (v11's Map takes no load colour, and androidView="texture" makes no
  // difference: it belongs to the renderer, not the surface), so the screen covers the
  // basemap itself until it has really drawn.
  //
  // The cover is asserted by TESTID rather than by colour: what must hold is that the
  // basemap is hidden exactly between mount and first paint. Which colour hides it is
  // nordicStyle's business, and basemapGroundFor is what keeps it honest.
  describe('the map reveal', () => {
    it(
      'covers the basemap from the first frame, and uncovers it only once it has drawn',
      async () => {
        await launchWithLessonPending();

        // Present before the map says anything at all: the flash happened in the very
        // first frames, so a cover that waited for an event would arrive after it.
        expect(screen.queryByTestId('map-reveal-cover')).toBeTruthy();

        await act(async () => {
          fireEvent(screen.getByTestId('sweden-map'), 'didFinishRenderingMapFully');
        });

        expect(screen.queryByTestId('map-reveal-cover')).toBeNull();
      },
      MAP_RENDER_TIMEOUT,
    );

    it(
      'gives up on a map that never finishes, rather than covering it forever',
      async () => {
        await launchWithLessonPending();
        expect(screen.queryByTestId('map-reveal-cover')).toBeTruthy();

        // `…MapFully` means every tile in view arrived, which offline never does. Without
        // this net the cover would be permanent and the map simply unreachable — a far
        // worse failure than the flash it exists to hide.
        await advance(MAP_REVEAL_TIMEOUT_MS);

        expect(screen.queryByTestId('map-reveal-cover')).toBeNull();
      },
      MAP_RENDER_TIMEOUT,
    );

    it(
      'uncovers a map that failed outright, so the notice about it can be read',
      async () => {
        await launchWithLessonPending();
        expect(screen.queryByTestId('map-reveal-cover')).toBeTruthy();

        await act(async () => {
          fireEvent(screen.getByTestId('sweden-map'), 'didFailLoadingMap');
        });

        // A map that has given up should be shown as the flat ground it is going to stay,
        // with its notice on top — not as a screen still pretending to load.
        expect(screen.queryByTestId('map-reveal-cover')).toBeNull();
      },
      MAP_RENDER_TIMEOUT,
    );
  });
});
