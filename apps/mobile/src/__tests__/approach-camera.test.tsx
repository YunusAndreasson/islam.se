// The map leans in toward the reader as a prayer approaches (lib/map/approach). The maths
// is tested there; this is the screen's side of it — WHEN the camera may move at all, and
// the settle bookkeeping that keeps the lean from being mistaken for the reader's own hand
// or, worse, adopted as the new home and leaned in on top of.
//
// Every test pins `Date` only (the doNotFake pattern from day-navigation.test.tsx, and for
// the same reason: faking timers breaks RTL's async act flushes). The prayer is computed,
// not hard-coded, so a change to the calculation defaults cannot quietly move the instant
// out of the window under test.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera } from '@maplibre/maplibre-react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import Bonetider from '@/app/bonetider';
import { LocationProvider } from '@/lib/location/context';
import { resetLocationLaunchCountForTests } from '@/lib/location-hint';
import { APPROACH_MAX_ZOOM } from '@/lib/map/approach';
import { resetNotificationLaunchCountForTests } from '@/lib/notification-hint';
import { computePrayerTimes } from '@/lib/prayer-times';
import { SettingsProvider } from '@/lib/settings/context';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { __resetGridCache } from '@/lib/solar/grid-cache';
import { zonePrayerDate } from '@/lib/zone-time';

jest.setTimeout(30_000);

const MIN = 60_000;
// Where jest.setup's GPS mock puts the reader.
const STOCKHOLM = { latitude: 59.3293, longitude: 18.0686 };
const DAY = Date.UTC(2026, 4, 20, 10, 0, 0); // 20 May 2026
const MAGHRIB = computePrayerTimes(STOCKHOLM, zonePrayerDate(DAY), DEFAULT_SETTINGS).maghrib.getTime();
const TEN_BEFORE_MAGHRIB = MAGHRIB - 10 * MIN;
const QUIET_MORNING = Date.UTC(2026, 4, 20, 7, 0, 0); // 09:00 Stockholm, hours from any prayer

const HOME_ZOOM = 4.5;
const SWEDEN = [11.15, 55.35, 23.7, 69.0];
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

type CameraCall = { zoom: number; duration: number; padding: { bottom: number } };
type CameraSpies = { easeTo: jest.Mock<(stop: CameraCall) => void>; fitBounds: jest.Mock };
const camera = (): CameraSpies => (Camera as unknown as { __last: CameraSpies }).__last;

function permission(status: 'granted' | 'denied') {
  return { status, granted: status === 'granted', canAskAgain: status !== 'denied', expires: 'never' };
}

function withProviders(node: ReactNode) {
  return (
    <SettingsProvider>
      <LocationProvider>{node}</LocationProvider>
    </SettingsProvider>
  );
}

async function settle(zoom: number, userInteraction: boolean, bounds = SWEDEN): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', {
      nativeEvent: { zoom, bounds, userInteraction },
    });
  });
}

async function openMap(): Promise<void> {
  render(withProviders(<Bonetider />));
  await act(async () => {});
}

/** Renders the map and lands MapLibre's initial whole-Sweden fit. */
async function launchMap(): Promise<void> {
  await openMap();
  await settle(HOME_ZOOM, false);
}

const APP_STATE = Object.getOwnPropertyDescriptor(AppState, 'currentState');

function pinTo(now: number): void {
  jest.useFakeTimers({ now, doNotFake: [...REAL_TIMER_APIS] });
}

describe('the map leaning toward a prayer', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    resetNotificationLaunchCountForTests();
    resetLocationLaunchCountForTests();
    __resetGridCache();
    // Both permissions answered, so no soft-ask card competes for the first settle.
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission('granted') as never);
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue(permission('granted') as never);
    // The lean only runs while the map is actually in front of the reader (`mapActive`), and
    // react-native's jest mock never reports 'active' (its currentState is a stub function)
    // — foreground the app for these tests.
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  });

  afterEach(() => {
    if (APP_STATE) Object.defineProperty(AppState, 'currentState', APP_STATE);
    jest.useRealTimers();
    __resetGridCache();
  });

  it('opens already leaned in, ten minutes before Maghrib', async () => {
    pinTo(TEN_BEFORE_MAGHRIB);
    await launchMap();

    expect(camera().easeTo).toHaveBeenCalledTimes(1);
    const stop = camera().easeTo.mock.calls[0]![0];
    // Two thirds of the way through the 30 min lead: two thirds of the full lean.
    expect(stop.zoom).toBeCloseTo(HOME_ZOOM + (APPROACH_MAX_ZOOM * 2) / 3, 6);
    // The reveal cover is still up on a cold launch: no visible travel into the lean.
    expect(stop.duration).toBe(0);
    // Framed against the same dock clearance as the initial fit, not the bare viewport.
    expect(stop.padding.bottom).toBeGreaterThan(0);
  });

  it('sends the camera nowhere hours from any prayer', async () => {
    pinTo(QUIET_MORNING);
    await launchMap();
    expect(camera().easeTo).not.toHaveBeenCalled();
  });

  it('takes its own landing as the lean, not as the reader moving the map', async () => {
    pinTo(TEN_BEFORE_MAGHRIB);
    await launchMap();
    const leaned = camera().easeTo.mock.calls[0]![0].zoom;

    // The lean lands. The app did this, so there is still nothing to reset…
    await settle(leaned, false);
    expect(screen.queryByLabelText('Återställ kartan – visa hela Sverige')).toBeNull();
    // …and a reader nudging the map without really moving it has not moved it either:
    // drift is measured from the leaned view the app holds, not from bare home.
    await settle(leaned, true);
    expect(screen.queryByLabelText('Återställ kartan – visa hela Sverige')).toBeNull();

    // Pinching back out to the plain home zoom IS moving away from what the app showed.
    await settle(HOME_ZOOM, true);
    expect(screen.getByLabelText('Återställ kartan – visa hela Sverige')).toBeTruthy();
  });

  it('never adopts the leaned view as home, which would ratchet the lean inward', async () => {
    pinTo(TEN_BEFORE_MAGHRIB);
    await launchMap();
    const first = camera().easeTo.mock.calls[0]![0].zoom;
    await settle(first, false); // the lean landing
    // Had the landing been taken for a re-fit, it would now be home, and the lean would
    // already have gone out again on top of it.
    expect(camera().easeTo).toHaveBeenCalledTimes(1);

    // A genuine re-fit of home arrives later (insets landing, a clamp): home is re-anchored
    // and the lean is re-aimed from IT — the same delta again, never delta on top of delta.
    jest.setSystemTime(TEN_BEFORE_MAGHRIB + 5_000);
    await settle(HOME_ZOOM, false);
    expect(camera().easeTo).toHaveBeenCalledTimes(2);
    expect(camera().easeTo.mock.calls[1]![0].zoom).toBeCloseTo(first, 2);
  });

  it('never moves the camera once the reader has', async () => {
    pinTo(TEN_BEFORE_MAGHRIB);
    await launchMap();
    expect(camera().easeTo).toHaveBeenCalledTimes(1);

    await settle(6, true);
    expect(screen.getByLabelText('Återställ kartan – visa hela Sverige')).toBeTruthy();
    // The prayer draws nearer; the camera is theirs now.
    jest.setSystemTime(MAGHRIB - 2 * MIN);
    await settle(6.2, true);
    expect(camera().easeTo).toHaveBeenCalledTimes(1);
  });

  it('shows the whole country after Återställ, and stays there through the prayer', async () => {
    pinTo(TEN_BEFORE_MAGHRIB);
    await launchMap();
    await settle(6, true);

    fireEvent.press(screen.getByLabelText('Återställ kartan – visa hela Sverige'));
    expect(camera().fitBounds).toHaveBeenCalledTimes(1);
    await settle(HOME_ZOOM, false);

    // The label promised "visa hela Sverige": the lean must not come straight back.
    expect(screen.queryByLabelText('Återställ kartan – visa hela Sverige')).toBeNull();
    expect(camera().easeTo).toHaveBeenCalledTimes(1); // only the launch lean, before the reset
  });

  it('holds still while the reader looks at another day, and leans on the way back', async () => {
    pinTo(TEN_BEFORE_MAGHRIB);
    await openMap();
    // Step to tomorrow before the camera settles: the first settle then lands in scrub mode.
    await act(async () => {
      fireEvent(screen.getByTestId('prayer-dock-toggle'), 'accessibilityTap');
    });
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Nästa dag' }));
    });
    await settle(HOME_ZOOM, false);
    expect(camera().easeTo).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Återgå till i dag'));
    });
    expect(camera().easeTo).toHaveBeenCalledTimes(1);
    // Stepping builds tomorrow's whole-country grid, the heaviest render in this file; under a
    // loaded machine (emulators running) 30 s was measured too tight. Headroom, not leniency:
    // nothing asserted depends on it.
  }, 60_000);

  it('does not lean toward a place the reader never chose', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(permission('denied') as never);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(permission('denied') as never);
    pinTo(TEN_BEFORE_MAGHRIB);
    await launchMap();
    await waitFor(() =>
      expect(screen.getByLabelText('Ingen plats vald – tryck för att välja stad')).toBeTruthy(),
    );
    expect(camera().easeTo).not.toHaveBeenCalled();
  });
});
