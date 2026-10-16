// The map's Moon disc lights when you face the Moon — the compass's twin, and with one
// qualification the compass does not need: the Moon is under the horizon for about half of
// every day, and a lit disc pointing at nothing is a promise the reader can check by looking
// out of the window and find false.
//
// Both halves are asserted through the accessibility label, because that is the only place
// the state reaches text; the tint is a colour prop on a native glass surface and asserting
// it here would test the mock, not the app.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import type { ReactNode } from 'react';

import { MoonButton } from '@/components/nav/MoonButton';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { moonAppearance } from '@/lib/moon/ephemeris';
import { SettingsProvider } from '@/lib/settings/context';

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

/** Stockholm — the position jest.setup's location mock hands out. */
const HERE = { latitude: 59.3293, longitude: 18.0686 };

// Two instants on one day, chosen for the Moon's altitude and nothing else: late evening,
// when it is well up, and the middle of the day, when it is not. Both sit on a ten-minute
// boundary so `useCoarseNow`'s bucket lands exactly on them.
const MOON_UP = Date.UTC(2026, 7, 24, 21, 0, 0);
const MOON_DOWN = Date.UTC(2026, 7, 24, 10, 30, 0);

function withProviders(node: ReactNode) {
  return (
    <SettingsProvider>
      <IntroProvider>
        <LocationProvider>{node}</LocationProvider>
      </IntroProvider>
    </SettingsProvider>
  );
}

/** Install a heading emitter and hand back the function that fires it. Accuracy 3 = trusted;
 *  below 2 the lock is gated off entirely, which is `deriveAimStatus`' own contract. */
function headingEmitter(): (heading: number, accuracy?: number) => Promise<void> {
  type Emit = (h: { trueHeading: number; magHeading: number; accuracy: number }) => void;
  let emit: Emit | null = null;
  jest.mocked(Location.watchHeadingAsync).mockImplementation((async (cb: Emit) => {
    emit = cb;
    return { remove: jest.fn() };
  }) as never);
  return async (heading, accuracy = 3) => {
    await waitFor(() => expect(emit).not.toBeNull());
    await act(async () => {
      emit?.({ trueHeading: heading, magHeading: heading, accuracy });
    });
  };
}

async function mount(): Promise<void> {
  await render(withProviders(<MoonButton active />));
  await act(async () => {
    await Promise.resolve();
  });
}

describe('MoonButton — the map disc that lights when you face the Moon', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.mocked(Location.watchHeadingAsync).mockReset();
    jest
      .mocked(Location.watchHeadingAsync)
      .mockImplementation((async () => ({ remove: jest.fn() })) as never);
    // Passive chrome CHECKS the permission and never requests it — the home screen must not
    // raise an OS dialog at a reader who only opened the map.
    jest.mocked(Location.getForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'granted', granted: true })) as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lights up when the phone points at a Moon that is up', async () => {
    jest.useFakeTimers({ now: MOON_UP, doNotFake: [...REAL_TIMER_APIS] });
    const sky = moonAppearance(HERE, new Date(MOON_UP));
    // The precondition, asserted rather than assumed: if the ephemeris ever moves, this
    // should fail as "the Moon was not up at the pinned instant" and not as a mystery.
    expect(sky.altitude).toBeGreaterThan(0);

    const emit = headingEmitter();
    await mount();
    expect(screen.getByRole('button', { name: /^Månen – (?!du ser)/ })).toBeTruthy();

    await emit(sky.azimuth);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Månen – du ser mot månen/ })).toBeTruthy(),
    );
  });

  it('stays dark for a Moon under the horizon, however exactly you point at it', async () => {
    // The one claim this control must not make. The direction is perfectly correct here —
    // `deriveAimStatus` is aligned — and there is still nothing in the sky to look at, so the
    // disc must not celebrate. A regression would light the map's Moon at noon.
    jest.useFakeTimers({ now: MOON_DOWN, doNotFake: [...REAL_TIMER_APIS] });
    const sky = moonAppearance(HERE, new Date(MOON_DOWN));
    expect(sky.altitude).toBeLessThan(0);

    const emit = headingEmitter();
    await mount();
    await emit(sky.azimuth);

    expect(screen.queryByRole('button', { name: /du ser mot månen/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Månen – / })).toBeTruthy();
  });

  it('refuses to light on a reading the OS says it cannot trust', async () => {
    // The calibration gate, carried in from lib/aim rather than re-implemented here: during
    // the magnetometer's warm-up the heading can be tens of degrees out, so a disc that lit
    // on it would be pointing the reader at an empty patch of sky with full confidence.
    jest.useFakeTimers({ now: MOON_UP, doNotFake: [...REAL_TIMER_APIS] });
    const sky = moonAppearance(HERE, new Date(MOON_UP));

    const emit = headingEmitter();
    await mount();
    await emit(sky.azimuth, 0);

    expect(screen.queryByRole('button', { name: /du ser mot månen/ })).toBeNull();
  });
});
