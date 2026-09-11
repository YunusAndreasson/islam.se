// The notice a reader gets when the basemap is missing because the phone has no network.
//
// ⚠️ THE HOLE THIS COVERS WAS MEASURED, NOT REASONED ABOUT. lib/map/map-diagnostics watches
// MapLibre's native log stream for failed tile requests, and that watcher is blind in the
// single most likely offline situation: on Android, MapLibre sees the OS report no
// connectivity and DEFERS its requests rather than letting them fail, so nothing is logged
// at all. The reader — in a mosque basement, on a train through Norrland, in flight mode —
// got flat land with correct prayer lines floating on it and no word about which half of
// the screen was broken.
//
// Three behaviours are pinned here, and the third is the one a refactor is most likely to
// undo, because it looks like a simplification.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';

import Bonetider from '@/app/bonetider';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { resetLocationLaunchCountForTests } from '@/lib/location-hint';
import { resetNotificationLaunchCountForTests } from '@/lib/notification-hint';
import { SettingsProvider } from '@/lib/settings/context';
import { storage } from '@/lib/storage';

// bonetider.tsx's own safety net for the reveal cover — after this it stops waiting for the
// map and shows whatever it has. Duplicated rather than imported because what matters here
// is that a net exists, not its value.
const MAP_REVEAL_TIMEOUT_MS = 8000;

const OFFLINE_COPY = /Ingen internetanslutning/;

// Every test here renders the whole Bönetider screen — MapLibre, the Skia solar overlay and
// the map datasets — which is the heaviest render in the suite, and the same reason
// screens.test.tsx gives its map tests headroom past jest's 5 s default. This file had been
// living on that default and went red on 2026-09-12 with a timeout rather than a failed
// assertion, on an unchanged commit, while a native build and an emulator were saturating
// the machine. The budget is the sibling suite's; nothing about what is asserted changes.
const MAP_RENDER_TIMEOUT = 20_000;
jest.setTimeout(MAP_RENDER_TIMEOUT);

const networkState = Network.useNetworkState as unknown as jest.MockedFunction<
  typeof Network.useNetworkState
>;

function permission(status: 'granted' | 'denied' | 'undetermined') {
  return { status, granted: status === 'granted', canAskAgain: status !== 'denied', expires: 'never' };
}

function tree() {
  return (
    <SettingsProvider>
      <IntroProvider>
        <LocationProvider>
          <Bonetider />
        </LocationProvider>
      </IntroProvider>
    </SettingsProvider>
  );
}

async function launchMap(): Promise<ReturnType<typeof render>> {
  const result = render(tree());
  await act(async () => {});
  return result;
}

/**
 * Flip the connectivity the screen sees.
 *
 * The re-render is not test ceremony — it is what the real `useNetworkState` does. It is a
 * hook backed by a native subscription, so a connectivity change re-renders every consumer;
 * a jest.fn whose return value is swapped changes nothing until something else renders. Skip
 * this and the screen keeps reading the previous value from its last render, which is the
 * shape of a bug that does not exist.
 */
async function setOffline(
  view: ReturnType<typeof render>,
  offline: boolean,
): Promise<void> {
  networkState.mockReturnValue({ isConnected: !offline, isInternetReachable: !offline });
  await act(async () => {
    view.rerender(tree());
  });
}

/** What MapLibre fires when every tile in the viewport has arrived and composited — the
 *  only honest evidence the basemap is actually there. */
async function reportFullRender(): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId('sweden-map'), 'didFinishRenderingMapFully');
  });
}

beforeEach(async () => {
  await storage.removeItem('locationHintSeen:v1');
  await storage.removeItem('notificationHintSeen:v1');
  jest.clearAllMocks();
  resetLocationLaunchCountForTests();
  resetNotificationLaunchCountForTests();
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission('granted') as never);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted') as never);
  networkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the offline notice', () => {
  it('says nothing on a working connection', async () => {
    await launchMap();
    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('appears when the phone is offline and the basemap never completed', async () => {
    networkState.mockReturnValue({ isConnected: false, isInternetReachable: false });

    await launchMap();

    expect(screen.getByText(OFFLINE_COPY)).toBeTruthy();
  });

  it('stays up after the reveal cover gives up, which is when it matters most', async () => {
    // THE REGRESSION THIS EXISTS FOR. The screen has two latches that look interchangeable
    // and are not: `mapPainted` is also set by the safety-net timeout — "stop waiting and
    // show what we have" — while `mapComplete` is only ever set by the map reporting that
    // every tile arrived. Reading the notice off the former cleared it eight seconds into
    // an outage, leaving the reader with a blank map and no explanation: the exact state
    // the notice was written for.
    networkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await launchMap();

    await act(async () => {
      jest.advanceTimersByTime(MAP_REVEAL_TIMEOUT_MS);
    });
    await act(async () => {});

    expect(screen.getByText(OFFLINE_COPY)).toBeTruthy();
  });

  it('comes back when the reader pans somewhere new while offline', async () => {
    // THE REGRESSION THIS PINS. `mapComplete` was briefly a one-way latch, which made the
    // notice a cold-launch-only affair: open the app online, go offline on a train, pan
    // north into tiles the ambient cache never held, and the reader gets blank land under
    // correct prayer lines with nothing to explain it — MapLibre on Android defers those
    // requests rather than failing them, so the log watcher stays silent too. Moving the map
    // while offline is the one moment the app can know that what is on screen may not be
    // there, so it stops claiming the basemap is complete until the map says otherwise.
    networkState.mockReturnValue({ isConnected: true, isInternetReachable: true });
    const view = await launchMap();
    await reportFullRender();
    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();

    await setOffline(view, true);
    await act(async () => {
      fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', {
        nativeEvent: { zoom: 6, bounds: [11.15, 55.35, 23.7, 69.0] },
      });
    });

    expect(screen.getByText(OFFLINE_COPY)).toBeTruthy();
  });

  it('withdraws again once the panned-to region renders completely', async () => {
    // The other half: offline over a fully cached region, the pan is followed by a settled
    // full render, and the notice must not sit there complaining about a map that is fine.
    networkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await launchMap();
    await reportFullRender();

    await act(async () => {
      fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', {
        nativeEvent: { zoom: 6, bounds: [11.15, 55.35, 23.7, 69.0] },
      });
    });
    await reportFullRender();

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });

  it('keeps quiet over a complete map, cached or otherwise', async () => {
    // The ambient cache (lib/map/offline) means a returning reader gets the whole basemap
    // with no network at all. Announcing "du är offline" over a map that is visibly fine is
    // the app complaining about nothing, and teaches the reader to ignore the notice for
    // the times it is real.
    networkState.mockReturnValue({ isConnected: false, isInternetReachable: false });
    await launchMap();
    expect(screen.getByText(OFFLINE_COPY)).toBeTruthy();

    await reportFullRender();

    expect(screen.queryByText(OFFLINE_COPY)).toBeNull();
  });
});
