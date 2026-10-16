import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';
import type { ReactElement, ReactNode } from 'react';
import { AccessibilityInfo, AppState, type AppStateStatus, Platform } from 'react-native';

import Bonetider from '@/app/bonetider';
import Berakning from '@/app/(settings)/berakning';
import BytPlats from '@/app/(settings)/byt-plats';
import Installningar from '@/app/(settings)/installningar';
import Notiser from '@/app/(settings)/notiser';
import Om from '@/app/(settings)/om';
import VanligaFragor from '@/app/(settings)/vanliga-fragor';
import Qibla from '@/app/qibla';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { SettingsProvider } from '@/lib/settings/context';
import { qiblaBearing, greatCirclePoints, KAABA } from '@/lib/qibla';
import { project } from '@/lib/map/projection';
import { __resetGridCache } from '@/lib/solar/grid-cache';
import { SolarSkiaOverlay } from '@/components/map/skia/SolarSkiaOverlay';
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { LogManager } from '@maplibre/maplibre-react-native';
import { first } from '@/test-utils/at';
import { hostsOfType, oneOfType } from '@/test-utils/rendered';

const SETTINGS_KEY = 'prayerSettings:v1';

// Every test here mounts a whole screen — the map with MapLibre and the Skia overlay, or a
// settings screen hydrating from storage — so jest's 5 s default measures how busy the
// machine is rather than whether the app is correct. On 2026-09-12, with an emulator and two
// native builds saturating the box, it tripped on the Notiser test, which asserts nothing
// slow at all. The per-test MAP_RENDER_TIMEOUT arguments below are left in place as a record
// of which renders are the heaviest.
const SCREEN_RENDER_TIMEOUT = 20_000;
jest.setTimeout(SCREEN_RENDER_TIMEOUT);

// A fixed Stockholm midday, for the one test below that needs a prayer line to exist. Only
// `Date` is faked; every timer API stays real so React Testing Library's async `act()` still
// flushes — the same pattern, and the same reason, as day-navigation.test.tsx.
const PINNED_MIDDAY = Date.UTC(2026, 4, 20, 11, 0, 0); // 20 May 2026, 13:00 Europe/Stockholm
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

// The map leans toward the reader as a prayer approaches (lib/map/approach), so what the
// camera does after the first settle now depends on the hour. A test about the reset chip
// must not pass or fail on whether the suite happens to run near Maghrib: it runs at 09:00,
// hours from every prayer in May. Same Date-only pattern as PINNED_MIDDAY.
const PINNED_QUIET = Date.UTC(2026, 4, 20, 7, 0, 0); // 20 May 2026, 09:00 Europe/Stockholm
async function atQuietHour(run: () => Promise<void>): Promise<void> {
  jest.useFakeTimers({ now: PINNED_QUIET, doNotFake: [...REAL_TIMER_APIS] });
  try {
    await run();
  } finally {
    jest.useRealTimers();
  }
}

// Replays one of MapLibre's own "could not fetch that" log lines — the shape mbgl emits when
// a vector tile cannot be reached. The mocked LogManager in jest.setup holds whichever
// handler the screen installed.
function tileFetchFailed(): void {
  (LogManager as unknown as { __emit: (log: object) => void }).__emit({
    level: 'warn',
    tag: 'Mbgl-HttpRequest',
    message: 'Request failed due to a connection error: Unable to resolve host',
  });
}

// Bönetider and Inställningar read settings + location context, so wrap them as
// the app does.
function withProviders(node: ReactNode) {
  return (
    <SettingsProvider>
      <IntroProvider>
      <LocationProvider>{node}</LocationProvider>
    </IntroProvider>
    </SettingsProvider>
  );
}

// Both providers do promise-based work on mount (settings hydrate from AsyncStorage; the
// location provider walks the permission → last-known → current-position chain, all
// resolved synchronously by the jest.setup mocks). Those updates land *after* the initial
// render, so a synchronous test would see them fire as "update not wrapped in act(...)"
// warnings. Rendering through here drains that microtask chain inside act so the warnings
// don't appear (and a future CI that fails on console.error stays green).
async function renderSettled(node: ReactElement): Promise<void> {
  await render(node);
  await act(async () => {});
}

async function withPlatform<T>(os: 'ios' | 'android', run: () => Promise<T>): Promise<T> {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  try {
    return await run();
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
  }
}

// Smoke tests: each tab screen mounts and shows its content. Cheap regression
// guard that the screens stay renderable as the app grows.
describe('tab screens', () => {
  // The map screen is the heaviest render in the suite (MapLibre + the Skia solar
  // overlay + the floating MapNav), so it gets headroom past the 5 s default — under
  // parallel-worker CPU contention a heavy render legitimately runs a few seconds.
  const MAP_RENDER_TIMEOUT = SCREEN_RENDER_TIMEOUT;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    // Put expo-location back to jest.setup's defaults between tests. `mockReset` is the load
    // -bearing call and `clearAllMocks` is NOT a substitute: clearAllMocks wipes recorded
    // calls only, and `mockImplementation` does not drain a queued `mockResolvedValueOnce`
    // either — verified directly, a one-shot queued in one test still answers the first call
    // of the next. Two ways that bites here: the map screen's compass button starts a
    // permission→subscribe chain that can still be in flight when a test ends, and several
    // tests below queue a one-shot denial. Either straggler lands on whichever test asks
    // next, which for the Qibla heading tests means the screen short-circuits to
    // "Platsåtkomst nekad" and never subscribes at all.
    jest.mocked(Location.watchHeadingAsync).mockReset();
    jest
      .mocked(Location.watchHeadingAsync)
      .mockImplementation((async () => ({ remove: jest.fn() })) as never);
    jest.mocked(Location.requestForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'granted', granted: true })) as never);
    jest.mocked(Location.getForegroundPermissionsAsync).mockReset();
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockImplementation((async () => ({ status: 'granted', granted: true })) as never);
    // The reader-abroad test moves the fix to Berlin; everyone else stands in Stockholm.
    jest.mocked(Location.getCurrentPositionAsync).mockReset();
    jest
      .mocked(Location.getCurrentPositionAsync)
      .mockImplementation((async () => ({ coords: { latitude: 59.3293, longitude: 18.0686 } })) as never);
  });

  it(
    'renders the Bönetider map',
    async () => {
      await renderSettled(withProviders(<Bonetider />));
      expect(screen.getByTestId('sweden-map')).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  // Navigation is the floating MapNav overlay now (no hamburger): a column of instruments
  // on the left — the Qibla compass and, under it, tonight's Moon — and a settings cog on
  // the right. Press the real controls so a missing handler or wrong route breaks the test,
  // not just the label.
  it(
    'opens Qibla, Månen and Inställningar from the map nav controls',
    async () => {
      jest.clearAllMocks();
      await renderSettled(withProviders(<Bonetider />));

      // Prefix match: the compass button's label carries its live state — plain "Qibla"
      // with a heading, "…du är vänd mot Mecka" on lock, "…kompassen är inte tillgänglig"
      // with no magnetometer (which is the case under test). What this asserts is the
      // ROUTE, so pinning the exact wording would only make it break on a copy tweak.
      await fireEvent.press(screen.getByRole('button', { name: /^Qibla/ }));
      expect(router.navigate).toHaveBeenCalledWith('/qibla');

      // Same prefix trick for the Moon: its label carries tonight's phase and Hijri date, so
      // pinning the whole string would break on every new moon rather than on a real fault.
      await fireEvent.press(screen.getByRole('button', { name: /^Månen –/ }));
      expect(router.navigate).toHaveBeenCalledWith('/manen');

      await fireEvent.press(screen.getByRole('button', { name: 'Inställningar' }));
      expect(router.navigate).toHaveBeenCalledWith('/installningar');
    },
    MAP_RENDER_TIMEOUT,
  );

  // THE BUG THIS GUARDS: dragging two fingers up or down the map pitches the MapLibre
  // camera (and a twist rotates it) — both are ON by default. The Skia field and the RN
  // marker layer both project through lib/map/projection.ts, which is a closed-form
  // NORTH-UP, ZERO-PITCH Web Mercator. So the instant the basemap tilts, the prayer lines
  // carry on drawing flat and slide off it; the reported symptom was Sweden's isolines
  // ending up over Germany. It corrupts the camera mirror too, since onRegionDidChange
  // derives the viewport centre from `bounds`, and a pitched view's bounds are a trapezoid
  // running to the horizon.
  //
  // Nothing in the app's own code sets bearing or pitch, which is why the projection's
  // header could claim they are "never set" — the gap was that the USER could set them.
  // Asserted as props on the map rather than through a gesture because the failure is a
  // native-camera one that no JS-side test can reproduce.
  it(
    'never lets the user pitch or rotate the map away from the overlay projection',
    async () => {
      await renderSettled(withProviders(<Bonetider />));
      const map = screen.getByTestId('sweden-map');

      expect(map.props.touchPitch).toBe(false);
      expect(map.props.touchRotate).toBe(false);
      // Zoom stays available — the projection handles zoom exactly, and locking it would
      // cost the city-level view the mosque layer and the qibla arc are drawn for.
      expect(map.props.touchZoom).not.toBe(false);
    },
    MAP_RENDER_TIMEOUT,
  );

  // THE GAP THIS GUARDS: offline, the basemap's style loads perfectly — it is inline JSON,
  // so there is nothing to fetch — and then every tile behind it fails, which fires no map
  // event at all. The reader got flat land, correct prayer lines floating on it, and no word
  // about which half was broken. MapLibre's native log stream is the only channel that sees
  // a tile fail; the notice is driven from there now (lib/map/map-diagnostics).
  it(
    'says the map has no connection once its tiles stop arriving',
    async () => {
      await renderSettled(withProviders(<Bonetider />));

      // One failure is a transient 500 on a working connection, which MapLibre retries away.
      // A notice for it would flash on a perfectly good map.
      await act(async () => tileFetchFailed());
      expect(screen.queryByText(/Ingen anslutning till kartan/)).toBeNull();

      // A burst is what a dead tile host looks like — they arrive in the same frame. All
      // three go in ONE act deliberately: the burst is counted against a real 4 s window, so
      // splitting them around a full-tree query would let a slow machine age the first one
      // out and fail a test with nothing wrong in the code.
      await act(async () => {
        tileFetchFailed();
        tileFetchFailed();
        tileFetchFailed();
      });

      // And the promise the notice exists to make: the map is broken, the times are not.
      expect(screen.getByText(/Ingen anslutning till kartan. Bönetiderna stämmer ändå./)).toBeTruthy();
      // Recovery is unit-tested (createTroubleBurst's `quiet`): the notice clears on the
      // next fully-rendered frame, but only once the failures have actually stopped.
    },
    MAP_RENDER_TIMEOUT,
  );

  // A 30 s live tick rebuilds the whole-country field and re-renders this screen on the JS
  // thread — the thread that also forwards each camera frame to the Skia overlay. Landing
  // mid-pan, the overlay stalls against the basemap. So the screen tells the clock when the
  // camera is moving and collects the held-back tick when it settles; this pins that the
  // wiring is present, since only `onRegionWillChange` can open that window.
  // The behaviour itself is tested at the hook (lib/solar/useSolarClock.test.ts): held back
  // once, never twice in a row, and a flush with nothing held back does nothing.
  it(
    'tells the clock when the camera starts moving, so a field rebuild can wait',
    async () => {
      await renderSettled(withProviders(<Bonetider />));
      const map = screen.getByTestId('sweden-map');

      expect(typeof map.props.onRegionWillChange).toBe('function');
      expect(typeof map.props.onRegionDidChange).toBe('function');
    },
    MAP_RENDER_TIMEOUT,
  );

  // The right-hand disc used to be a permanent "Visa min position" whenever the map was at
  // home — a location glyph beside the qibla arrow that read as a second compass. For a
  // reader in Sweden it now exists only while there is something to reset (see MapAction
  // in components/nav/MapNav).
  it('shows a reader in Sweden no map control beside the cog on the home view', async () => atQuietHour(async () => {
    await renderSettled(withProviders(<Bonetider />));
    await fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', { nativeEvent: {
      zoom: 4.5, bounds: [11.15, 55.35, 23.7, 69.0], userInteraction: false,
    } });
    // The nav itself is up — so the two absences below are the disc's, not the whole row's.
    expect(screen.getByLabelText('Inställningar')).toBeTruthy();
    expect(screen.queryByLabelText('Visa min position')).toBeNull();
    expect(screen.queryByLabelText('Återställ kartan – visa hela Sverige')).toBeNull();
  }), MAP_RENDER_TIMEOUT);

  // …but a reader abroad cannot see their dot on the Sweden home view at all, and before the
  // position control came back for them the only way to it was panning across a continent.
  it('offers a reader abroad the way to their own dot', async () => atQuietHour(async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
      coords: { latitude: 52.52, longitude: 13.405 }, // Berlin
    } as never);
    await renderSettled(withProviders(<Bonetider />));
    await fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', { nativeEvent: {
      zoom: 4.5, bounds: [11.15, 55.35, 23.7, 69.0], userInteraction: false,
    } });

    await waitFor(() => expect(screen.getByLabelText('Visa min position')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Visa min position'));
    // The flight is under way, so the same disc now offers the way back.
    expect(screen.getByLabelText('Återställ kartan – visa hela Sverige')).toBeTruthy();
  }), MAP_RENDER_TIMEOUT);

  // The reset disc leaves the screen the moment the camera lands home. A screen reader's
  // focus was on it — so it is handed to the cog, or it falls to the top of the screen.
  it('hands screen-reader focus to the cog when a pressed reset leaves the screen', async () => atQuietHour(async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    try {
      await renderSettled(withProviders(<Bonetider />));
      const settle = (zoom: number, userInteraction: boolean) =>
        fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', {
          nativeEvent: { zoom, bounds: [11.15, 55.35, 23.7, 69.0], userInteraction },
        });
      await settle(4.5, false);

      // Panning back home by hand: the disc goes, but nobody's focus was on it.
      await settle(6, true);
      await settle(4.5, true);
      expect(screen.queryByLabelText('Återställ kartan – visa hela Sverige')).toBeNull();
      expect(focus).not.toHaveBeenCalled();

      await settle(6, true);
      await fireEvent.press(screen.getByLabelText('Återställ kartan – visa hela Sverige'));
      await settle(4.5, false);
      expect(screen.queryByLabelText('Återställ kartan – visa hela Sverige')).toBeNull();
      expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    } finally {
      focus.mockRestore();
    }
  }), MAP_RENDER_TIMEOUT);

  it.each([
    { zoom: 5, bounds: [11.15, 55.35, 23.7, 69.0] },
    { zoom: 4.5, bounds: [13.15, 55.35, 25.7, 69.0] },
  ])('offers reset after a manual camera change: %j', async (view) => atQuietHour(async () => {
    await renderSettled(withProviders(<Bonetider />));
    const settle = async (zoom: number, bounds: number[], userInteraction: boolean) => {
      await fireEvent(screen.getByTestId('sweden-map'), 'regionDidChange', {
        nativeEvent: { zoom, bounds, userInteraction },
      });
    };
    await settle(4.5, [11.15, 55.35, 23.7, 69.0], false);
    expect(screen.queryByLabelText('Återställ kartan – visa hela Sverige')).toBeNull();
    await settle(view.zoom, view.bounds, true);
    expect(screen.getByLabelText('Återställ kartan – visa hela Sverige')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Återställ kartan – visa hela Sverige'));
    await settle(4.5, [11.15, 55.35, 23.7, 69.0], false);
    expect(screen.queryByLabelText('Återställ kartan – visa hela Sverige')).toBeNull();
  }), MAP_RENDER_TIMEOUT);

  it('explains a tapped qibla arc and a prayer contour', async () => {
    // ⚠️ THIS TEST NEEDS A PRAYER TO BE HAPPENING SOMEWHERE IN SWEDEN. A prayer line is the
    // level-0 contour of (prayerTime − now), so it exists only where that prayer falls at
    // this instant: each one sweeps the country's longitudes in roughly fifty minutes and is
    // absent in between. On the real wall clock the test therefore passed by day and failed
    // at 00:25 on an unchanged commit (2026-09-12) — after ʿIshāʾ and before Fajr no line
    // crosses the country, so the overlay had nothing to tap and was right not to. Pin the
    // instant rather than weaken the assertion; midday is mid-Ẓuhr-sweep. The grid cache is
    // keyed per day, and tests above have already filled it for the real one.
    jest.useFakeTimers({ now: PINNED_MIDDAY, doNotFake: [...REAL_TIMER_APIS] });
    __resetGridCache();
    try {
      await renderSettled(withProviders(<Bonetider />));
      const map = screen.getByTestId('sweden-map');
      await fireEvent(map, 'regionDidChange', { nativeEvent: {
        zoom: 4.5, bounds: [11.15, 55.35, 23.7, 69.0], userInteraction: false,
      } });
      const overlay = oneOfType(SolarSkiaOverlay, 'solar overlay');
      const props = overlay.props;
      const from = { longitude: props.userPoint[0], latitude: props.userPoint[1] };
      const arcPoint = greatCirclePoints(from, KAABA, 96)[5]!;
      const qiblaPoint = project(arcPoint[0], arcPoint[1], props.camera.value);
      await fireEvent.press(map, { nativeEvent: { point: [qiblaPoint.x, qiblaPoint.y] } });
      expect(screen.getByText(/Linjen visar qibla.*km/)).toBeTruthy();

      const line = props.lines.find((item: { polylines: number[][][] }) => item.polylines[0]?.length);
      expect(line).toBeDefined();
      const coordinate = line.polylines[0][1];
      const prayerPoint = project(coordinate[0], coordinate[1], props.camera.value);
      await fireEvent.press(map, { nativeEvent: { point: [prayerPoint.x, prayerPoint.y] } });
      expect(screen.getByText(/Linjen visar var.*vid kartans valda tid/)).toBeTruthy();
    } finally {
      jest.useRealTimers();
      __resetGridCache();
    }
  }, MAP_RENDER_TIMEOUT);

  // THE BUG THIS GUARDS: nothing stopped a fling from parking the camera in the Pacific,
  // where the Skia overlay dutifully projects Sweden's prayer lines over open ocean and
  // the Återställ chip is the only way home.
  //
  // The subtle half is the SIZE of the leash. maxBounds constrains the viewport, so a box
  // shorter than the visible map at minZoom makes MapLibre clamp every frame and the map
  // fights the finger. The two values are one setting in two variables: tightening the
  // bounds without raising minZoom (or lowering minZoom without widening the bounds) is
  // the regression, and it is invisible on a small simulator and obvious on a tall phone.
  it(
    'leashes the camera to a box that still clears the screen at minimum zoom',
    async () => {
      await renderSettled(withProviders(<Bonetider />));
      const camera = first(hostsOfType('Camera'), 'camera');

      const [west, south, east, north] = camera.props.maxBounds as [number, number, number, number];
      const minZoom = camera.props.minZoom as number;

      // Sanity: the leash must contain the framing the reset chip returns to.
      expect(west).toBeLessThan(11.15);
      expect(south).toBeLessThan(55.35);
      expect(east).toBeGreaterThan(23.7);
      expect(north).toBeGreaterThan(69.0);

      // Web Mercator y, as a fraction of the world square — the space maxBounds is
      // actually measured in.
      const mercY = (lat: number) => (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2;
      const world = 512 * 2 ** minZoom;
      // Tallest/widest viewport the app ships to (iPhone 16 Pro Max; supportsTablet is
      // false, so nothing larger exists).
      const [widestPt, tallestPt] = [440, 956];

      expect(mercY(south) - mercY(north)).toBeGreaterThan(tallestPt / world);
      expect((east - west) / 360).toBeGreaterThan(widestPt / world);
    },
    MAP_RENDER_TIMEOUT,
  );

  // THE BUG THIS GUARDS: with no GPS fix and no manual city, resolveLocation falls back to
  // Stockholm and labels it "Stockholm (standard)" — but the map strips status qualifiers
  // for the dock, so it rendered a bare, confident "Stockholm" to a user standing in Malmö
  // whose times were ~20 minutes wrong. Nothing on the map admitted the location wasn't
  // theirs; the only hint was a footnote inside Inställningar. The dock must offer to pick
  // a place rather than name one the user never chose.
  it(
    'never names the fallback city as the user location on the map',
    async () => {
      jest
        .mocked(Location.requestForegroundPermissionsAsync)
        .mockResolvedValue({ status: 'denied', granted: false } as never);
      jest
        .mocked(Location.getForegroundPermissionsAsync)
        .mockResolvedValue({ status: 'denied', granted: false } as never);

      await renderSettled(withProviders(<Bonetider />));

      await waitFor(() =>
        expect(screen.getByLabelText('Ingen plats vald – tryck för att välja stad')).toBeTruthy(),
      );
      expect(screen.queryByText('Stockholm')).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );

  it('renders the Qibla sheet content', async () => {
    await renderSettled(withProviders(<Qibla />));

    expect(screen.getByText('Qibla')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stäng' })).toBeTruthy();
    expect(screen.getByText('från norr')).toBeTruthy();
    expect(screen.getByText(/Mecka ·/)).toBeTruthy();
    // The bearing readout exposes ONE clean spoken label (not the split "148"/"°"/"från
    // norr" visual pieces) so a screen reader announces the qibla as a sentence. Pattern,
    // not a fixed bearing, so it doesn't couple to the test env's default coordinates.
    expect(screen.getByLabelText(/^Qibla \d+ grader från norr$/)).toBeTruthy();
  });

  // ── The live readout ────────────────────────────────────────────────────────────
  // jest.setup's expo-location mock returns a heading subscription that never emits, so
  // every other test sees the screen's static fallback. These install their own emitter,
  // which is the only way to exercise the half of the screen that exists for the moment a
  // reader is actually turning.

  /** The bearing the screen itself will compute — jest.setup fixes the position to
   *  Stockholm. Derived rather than hardcoded so the tests say "40° off" and mean it,
   *  whatever the qibla from Stockholm happens to be. */
  const TEST_QIBLA = qiblaBearing({ latitude: 59.3293, longitude: 18.0686 });

  /** Install a heading emitter for this test, and hand back the function that fires it.
   *  `accuracy` is expo-location's calibration level 0–3; 3 is a trusted reading. */
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

  it('counts down the turn and names the side to turn toward', async () => {
    const emit = headingEmitter();
    await renderSettled(withProviders(<Qibla />));
    // Facing 40° anticlockwise of the qibla: the short way back is clockwise — your right.
    await emit(TEST_QIBLA - 40);

    expect(screen.getByText('Vrid åt höger')).toBeTruthy();
    expect(screen.getByText('40°')).toBeTruthy();
    expect(screen.getByText('kvar att vrida')).toBeTruthy();
    // The static bearing gives up the hero slot and keeps a quiet home on the facts line,
    // so it appears exactly once on the screen rather than twice.
    expect(screen.queryByText('från norr')).toBeNull();
    expect(screen.getByText(/Mecka ·.*· qibla \d+°/)).toBeTruthy();
    // ...and the whole instruction reaches a screen reader as one sentence, since the dial
    // that carries it visually is hidden from assistive tech.
    expect(screen.getByLabelText(/^40 grader kvar, vrid åt höger\. Qibla \d+ grader från norr$/)).toBeTruthy();
  });

  it('names the other side when the qibla is anticlockwise of you', async () => {
    const emit = headingEmitter();
    await renderSettled(withProviders(<Qibla />));
    await emit(TEST_QIBLA + 40);

    expect(screen.getByText('Vrid åt vänster')).toBeTruthy();
    expect(screen.getByText('40°')).toBeTruthy();
  });

  it('confirms the lock rather than counting, once you are facing Mecca', async () => {
    const emit = headingEmitter();
    await renderSettled(withProviders(<Qibla />));
    await emit(TEST_QIBLA);

    expect(screen.getByText('Du är vänd mot Mecka')).toBeTruthy();
    expect(screen.getByText('0°')).toBeTruthy();
  });

  it('withholds the count while the compass is still calibrating', async () => {
    const emit = headingEmitter();
    await renderSettled(withProviders(<Qibla />));
    // A reading pointing DEAD at the qibla, but with the calibration level the OS uses to say
    // "don't trust me". The same gate that hides the needle has to hide the number: a count
    // ticking toward a bearing the dial is refusing to draw would be the screen contradicting
    // itself, and would talk a reader into facing the wrong way with full confidence.
    await emit(TEST_QIBLA, 0);

    expect(screen.getByText('Kalibrera – rör telefonen i en åtta')).toBeTruthy();
    expect(screen.queryByText('kvar att vrida')).toBeNull();
    expect(screen.getByText('från norr')).toBeTruthy();
    // The note says what actually fixes it, not just what to wave.
    expect(screen.getByText(/metall och magnetiska fodral/)).toBeTruthy();
  });

  it('offers the map when the compass cannot be used at all', async () => {
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValueOnce({ status: 'denied', granted: false } as never);
    await renderSettled(withProviders(<Qibla />));

    await waitFor(() => expect(screen.getByText(/Platsåtkomst nekad/)).toBeTruthy());
    // Two ways forward, not a dead end: fix the permission, or read the direction off the
    // map's great-circle arc, which needs no magnetometer at all.
    expect(screen.getByRole('button', { name: /^Öppna/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se qibla-riktningen på kartan' })).toBeTruthy();
  });

  it(
    'renders the Inställningar screen once settings load',
    async () => {
      await renderSettled(withProviders(<Installningar />));
      // The header appears after the async settings hydration flips `loaded` (settled above).
      await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());
      // The "Förhandsvisning" strip is open — no disclosure to expand. Finding a prayer
      // label with no interaction at all is the claim: the live preview (and thus the
      // calculation module) ran end-to-end inside the screen, and a user sees it without
      // having to discover a fold first.
      expect(screen.getAllByText(/Fajr/).length).toBeGreaterThan(0);
    },
    MAP_RENDER_TIMEOUT,
  );

  it('uses platform-aware copy when GPS location permission is denied', async () => {
    // Both halves, stated here rather than inherited: the provider READS the permission on
    // mount (getForegroundPermissionsAsync) and only requests it from an explicit gesture.
    // This used to mock the request alone and passed only because the map test above leaks a
    // persistent denial into everything after it — so it was really asserting test order.
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue({ status: 'denied', granted: false } as never);
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValue({ status: 'denied', granted: false } as never);

    await withPlatform('android', async () => {
      await renderSettled(withProviders(<Installningar />));
      await waitFor(() =>
        expect(
          screen.getByText('Platsåtkomst nekad – visar standardplats. Tillåt i appinställningar.'),
        ).toBeTruthy(),
      );
    });
  });

  it('uses platform-aware copy when notification permission is denied', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true },
      }),
    );
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied' } as never);

    await withPlatform('ios', async () => {
      await renderSettled(withProviders(<Installningar />));
      await waitFor(() =>
        expect(
          screen.getByText(
            'Notiser är blockerade – inga påminnelser kommer fram. Tillåt dem i iOS-inställningar.',
          ),
        ).toBeTruthy(),
      );
      expect(screen.getByRole('button', { name: 'Öppna iOS-inställningar för notiser' })).toBeTruthy();
    });
  });

  it('refreshes notification permission after returning from system settings', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true },
      }),
    );
    const appStateListeners: ((state: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener);
      return { remove: jest.fn() };
    });
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ granted: false, canAskAgain: false, status: 'denied' } as never)
      .mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);

    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText(/Notiser är blockerade/)).toBeTruthy());

    await act(async () => {
      for (const listener of appStateListeners) listener('active');
    });

    await waitFor(() =>
      expect(screen.queryByText(/Notiser är blockerade/)).toBeNull(),
    );
  });

  // Per-alert configuration (lead time + sound, per prayer) moved off Inställningar onto
  // its own screen once it outgrew a section; Inställningar keeps a summary row.
  it('summarises the alerts on Inställningar and pushes the detail screen', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true },
      }),
    );

    await renderSettled(withProviders(<Installningar />));
    const row = await waitFor(() =>
      screen.getByLabelText(/^Påminnelser: Alla böner · vid bönetid\. Tryck för att ändra\.$/),
    );
    await fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('/(settings)/notiser');
  });

  it('names the master-off notification state instead of blaming prayer-time calculation', async () => {
    await renderSettled(withProviders(<Notiser />));

    await waitFor(() =>
      expect(
        screen.getByText('Påminnelser är avstängda – ingenting schemaläggs.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/Ingen tid går att räkna ut/)).toBeNull();
  });

  it('lets readers configure reminders without enabling delivery first', async () => {
    await renderSettled(withProviders(<Installningar />));
    await fireEvent.press(screen.getByLabelText('Påminnelser: Avstängda. Tryck för att ändra.'));
    expect(router.push).toHaveBeenCalledWith('/(settings)/notiser');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('explains mixed prayer settings and preserves separate alerts when applying bulk choices', async () => {
    const n = DEFAULT_SETTINGS.notifications;
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({
      ...DEFAULT_SETTINGS,
      notifications: {
        ...n,
        lead: { ...n.lead, fajr: 10, sunrise: 15 },
        sound: { ...n.sound, fajr: 'silent', sunrise: 'silent' },
        lastThirdSound: 'silent',
      },
    }));
    await renderSettled(withProviders(<Notiser />));
    expect(screen.getByText('Olika tider per bön. Välj här för att ändra alla fem.')).toBeTruthy();
    expect(screen.getByText('Olika ljud per bön. Välj här för att ändra alla fem.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: /^5\smin innan/ }));
    await fireEvent.press(screen.getByRole('radio', { name: /^Systemets standardljud/ }));

    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}');
      for (const key of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
        expect(saved.notifications.lead[key]).toBe(5);
        expect(saved.notifications.sound[key]).toBe('default');
      }
      expect(saved.notifications.lead.sunrise).toBe(15);
      expect(saved.notifications.sound.sunrise).toBe('silent');
      expect(saved.notifications.lastThirdSound).toBe('silent');
      expect(saved.notifications.enabled).toBe(false);
    });
    expect(screen.queryByText(/Olika tider per bön/)).toBeNull();
    expect(screen.queryByText(/Olika ljud per bön/)).toBeNull();
    expect(screen.getByRole('radio', { name: /^Systemets standardljud/ }).props.accessibilityState.checked).toBe(true);
  });

  it('announces Swedish prayer names on the alert detail screen', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true },
      }),
    );

    await renderSettled(withProviders(<Notiser />));
    // WITHOUT OPENING ANYTHING. The Swedish name used to be the description of a toggle
    // buried inside each prayer's collapsed group, so this test had to expand one first —
    // which was the defect, not the setup: the switch a reader wants is the one the
    // collapsed row was reporting on. It now rides on that switch's own spoken label.
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Påminnelse för Fajr. Gryningsbönen' }),
      ).toBeTruthy(),
    );
  });

  // THE BUG THIS GUARDS: turning one prayer's reminder off took two taps and a hidden
  // control — expand the group, then find a switch labelled "Påminnelse" inside it. The
  // collapsed row said "Av" and offered no way to change it.
  it('turns one prayer off from the collapsed row, without expanding it', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true },
      }),
    );

    await renderSettled(withProviders(<Notiser />));
    const fajr = await waitFor(() =>
      screen.getByRole('switch', { name: 'Påminnelse för Fajr. Gryningsbönen' }),
    );
    expect(fajr.props.value).toBe(true);

    await fireEvent(fajr, 'valueChange', false);

    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}');
      expect(saved.notifications.prayers.fajr).toBe(false);
    });
  });

  describe('getting alerts through on Android', () => {
    const exactAlarm = jest.mocked(Notifications.getExactAlarmPermissionsAsync);
    const response = (granted: boolean) =>
      ({ granted, status: granted ? 'granted' : 'denied', canAskAgain: true, expires: 'never' }) as never;
    afterEach(() => {
      exactAlarm.mockResolvedValue(response(true));
    });

    it('offers alarm-clock delivery as an opt-in switch, off until turned on', async () => {
      await withPlatform('android', async () => {
        await renderSettled(withProviders(<Notiser />));
        const alarm = await waitFor(() => screen.getByRole('switch', { name: /^Schemalägg som alarm/ }));
        expect(alarm.props.value).toBe(false);
        expect(screen.queryByRole('button', { name: /alarm och påminnelser/ })).toBeNull();

        await fireEvent(alarm, 'valueChange', true);
        await waitFor(async () => {
          const saved = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}');
          expect(saved.notifications.alarmClock).toBe(true);
        });
      });
    });

    // Without the exact-alarm permission no alert is exact, so the switch would promise
    // what it cannot do — the way to the permission takes its place.
    it('points to the exact-alarm permission instead when it is denied', async () => {
      exactAlarm.mockResolvedValue(response(false));
      await withPlatform('android', async () => {
        await renderSettled(withProviders(<Notiser />));
        await waitFor(() =>
          expect(
            screen.getByRole('button', { name: 'Öppna Androids inställning för alarm och påminnelser' }),
          ).toBeTruthy(),
        );
        expect(screen.queryByRole('switch', { name: /^Schemalägg som alarm/ })).toBeNull();
        expect(screen.getByText(/Appen får inte ställa exakta alarm/)).toBeTruthy();
      });
    });

    it('shows neither on iOS, which has no such settings', async () => {
      await withPlatform('ios', async () => {
        await renderSettled(withProviders(<Notiser />));
        expect(screen.queryByRole('switch', { name: /^Schemalägg som alarm/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /alarm och påminnelser/ })).toBeNull();
      });
    });
  });

  it('searches the city picker diacritic-insensitively', async () => {
    await renderSettled(
      <SettingsProvider>
      <IntroProvider>
        <BytPlats />
      </IntroProvider>
    </SettingsProvider>,
    );

    await fireEvent.changeText(screen.getByLabelText('Sök stad'), 'umea');

    expect(screen.getByText('1 träff')).toBeTruthy();
    expect(screen.getByText('Umeå')).toBeTruthy();
    expect(screen.queryByText('Stockholm')).toBeNull();
  });

  it('shows Stockholm as selected when manual mode is using its default city', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, locationMode: 'manual', manualLocation: null }),
    );

    await renderSettled(
      <SettingsProvider>
      <IntroProvider>
        <BytPlats />
      </IntroProvider>
    </SettingsProvider>,
    );

    expect(screen.getByRole('button', { name: /^Stockholm,/ }).props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('selecting a city persists manual location mode and returns', async () => {
    jest.clearAllMocks();
    await renderSettled(
      <SettingsProvider>
      <IntroProvider>
        <BytPlats />
      </IntroProvider>
    </SettingsProvider>,
    );

    await fireEvent.changeText(screen.getByLabelText('Sök stad'), 'umea');
    await fireEvent.press(screen.getByRole('button', { name: /^Umeå,/ }));

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      expect(raw).not.toBeNull();
      const saved = JSON.parse(raw ?? '{}') as typeof DEFAULT_SETTINGS;
      expect(saved.locationMode).toBe('manual');
      expect(saved.manualLocation?.name).toBe('Umeå');
    });
    expect(router.back).toHaveBeenCalled();
  });

  // The qibla arc's switch, now in the "Karta" section and reachable with no disclosure
  // to open first. What matters is that the control reaches persistence: the map reads
  // settings.showQibla straight off the store, so a toggle that renders but writes
  // nothing would look completely correct on screen while the arc never moved.
  it('persists the qibla-arc switch from Karta', async () => {
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    // On by default — the arc is a feature, not an opt-in.
    const toggle = screen.getByRole('switch', { name: /Visa qibla-riktning/ });
    expect(toggle.props.accessibilityState.checked).toBe(true);

    await fireEvent.press(toggle);

    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}');
      expect(saved.showQibla).toBe(false);
    });
  });

  // The night times are the opposite default: OFF, because they are not prayer times and a
  // reader who has not asked for them must not find them in a list of obligations. Same
  // reach-persistence claim as the qibla switch — the dock reads settings.showNightTimes
  // straight off the store, so a toggle that renders but writes nothing would look right
  // and change nothing.
  it('persists the night-times switch from Förhandsvisning, and it starts off', async () => {
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    const toggle = screen.getByRole('switch', { name: /Visa nattens tider/ });
    expect(toggle.props.accessibilityState.checked).toBe(false);

    await fireEvent.press(toggle);

    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) ?? '{}');
      expect(saved.showNightTimes).toBe(true);
    });
  });

  // THE BUG THIS GUARDS: these four switches used to sit inside a collapsed "Utseende"
  // group, so the only thing announcing them was that header's summary line — and when a
  // toggle was added to the card but not to the summary, it became unreachable by
  // recognition entirely. Recognition over recall means the control itself is on the
  // screen, not a promise that it exists behind a fold. If a future change hides any of
  // these again, this fails.
  it('shows every display switch without opening anything first', async () => {
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    expect(screen.getByRole('switch', { name: /Visa moskéer/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Visa qibla-riktning/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Visa nattens tider/ })).toBeTruthy();
    expect(screen.getByRole('switch', { name: /Haptisk återkoppling/ })).toBeTruthy();
    // The theme picker and the Hijri stepper likewise — both were behind the same fold.
    // All three now share one "Appen" card rather than a titled section each; the pin is
    // that they are on screen, not which heading they sit under. The stepper is
    // "Hijri-dagar" since that merge: its section title used to supply the "Hijri", and a
    // row called "Dagar" among a theme picker and a haptics switch names nothing.
    expect(screen.getByRole('radio', { name: /Följ system/ })).toBeTruthy();
    expect(screen.getByLabelText('Hijri-dagar')).toBeTruthy();
  });

  // THE RULE THIS GUARDS: no line of copy on a screen may say what another line on that
  // screen already says. These four were the surviving violations, and each was removed
  // for a stated reason — restoring any of them is a regression, not a clarification.
  it('says each thing once on Inställningar', async () => {
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    // A Toggle is ONE accessibility node, so its label and description are its accessible
    // NAME — that is what to assert on, not loose text.
    //
    // The two place layers carried the same sentence with one noun swapped, each naming
    // the switch above it. Both descriptions are gone: the names are now bare.
    expect(screen.getByRole('switch', { name: 'Visa moskéer' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Visa gravkvarter' })).toBeTruthy();
    // The shared fact they were both circling is said once, below the card.
    expect(
      screen.getByText('Moskéer och gravkvarter ritas först när du zoomar in på en ort.'),
    ).toBeTruthy();

    // The night-times caption opened by naming the two rows it was about to add to the
    // strip directly above it. Only the derivation survives.
    expect(
      screen.getByRole('switch', {
        name: 'Visa nattens tider. Räknas från Maghrib till nästa Fajr.',
      }),
    ).toBeTruthy();

    // Three sections that each held one control are now one card that can state itself.
    expect(screen.getByText('Appen')).toBeTruthy();
    for (const gone of ['Utseende', 'Haptik', 'Hijri-kalender']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('says each thing once on Påminnelser', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true },
      }),
    );
    await renderSettled(withProviders(<Notiser />));
    await waitFor(() => expect(screen.getByText('Påminnelser')).toBeTruthy());

    // First clause restated the section's own title, second restated the heading below it.
    expect(
      screen.queryByText('Ändrar alla böner på en gång. Du kan finjustera varje bön nedan.'),
    ).toBeNull();

    // Fajr-fönstret spent five strings on one boolean, three of them saying that sunrise
    // ends Fajr. The two non-prayer alerts now share one section and one footnote.
    expect(screen.queryByText('Påminn vid Shurūq')).toBeNull();
    expect(screen.queryByText('Soluppgång – slutet på Fajr-tiden')).toBeNull();
    expect(screen.queryByText('Påminn när sista tredjedelen börjar')).toBeNull();
    expect(screen.queryByText('Notisen kommer exakt när tiden går in.')).toBeNull();
    expect(screen.getByText('Inte bönetider')).toBeTruthy();
  });

  // THE BUG THIS GUARDS: Beräkning is where a user changes the method, the madhab, the
  // high-latitude rule and six per-prayer offsets — and it used to show no times at all,
  // so every tap moved a checkmark and nothing else. The introduction had already fixed
  // exactly this for itself (components/intro/StepMethod: "a setting you can watch land
  // is a setting you can judge") and the lesson never crossed over. The pinned
  // PreviewStrip is that fix; this asserts the loop is actually closed, by picking the
  // one option whose consequence is unambiguous — Hanafi computes a LATER ʿAṣr.
  it('moves a visible time when Beräkning changes the madhab', async () => {
    await renderSettled(withProviders(<Berakning />));

    const asrBefore = screen.getByTestId('preview-time-asr').props.children as string;
    expect(asrBefore).toMatch(/^\d{2}:\d{2}$/);

    await fireEvent.press(screen.getByRole('radio', { name: /^Hanafi/ }));

    await waitFor(() => {
      const asrAfter = screen.getByTestId('preview-time-asr').props.children as string;
      expect(asrAfter).not.toBe(asrBefore);
      expect(asrAfter > asrBefore).toBe(true); // "16:29" > "15:42" lexicographically for HH:mm
    });
  });

  // Avrundning followed the other adhan CalculationParameters to Beräkning — it shapes a
  // computed time (and rounding Maghrib the wrong way moves when a fast ends), so it
  // never belonged among theme and map toggles.
  it('offers Avrundning on Beräkning, not on Inställningar', async () => {
    await renderSettled(withProviders(<Berakning />));
    expect(screen.getByRole('radio', { name: /Närmaste minut/ })).toBeTruthy();

    await screen.unmount();
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());
    expect(screen.queryByRole('radio', { name: /Närmaste minut/ })).toBeNull();
  });

  it('renders the Om screen as an identity page (masthead + integritet + fine-print credits)', async () => {
    // Om is the calm identity page: a masthead (wordmark + one-line lead), a privacy
    // promise, support links, and an imprint colophon with the version + the map
    // attribution as fine print. The old technical "Bygger på" dependency card is GONE
    // (no real user recognises adhan / MapLibre / MapTiler) — this guard keeps it gone,
    // along with the FAQ (which lives on /vanliga-fragor) and Kontakt.
    await render(<Om />);
    expect(screen.getByText('islam.se')).toBeTruthy(); // masthead wordmark
    expect(screen.getByText(/En karta över Sveriges bönetider/)).toBeTruthy();
    expect(screen.getByText(/Din plats lämnar aldrig enheten/)).toBeTruthy();
    expect(screen.getByText(/Version /)).toBeTruthy();
    // The required map attribution is present, but as fine print — not a prominent card.
    expect(screen.getByText(/Kartdata/)).toBeTruthy();
    expect(screen.queryByText('Bygger på')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mejla oss' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hur räknas bönetiderna ut?' })).toBeNull();
  });

  // Progressive disclosure on the FAQ screen: each answer stays folded behind
  // its question until the reader taps it. Guards the FaqItem accordion
  // wiring (a11y + toggle).
  it('keeps a FAQ answer collapsed until its question is pressed', async () => {
    await render(<VanligaFragor />);
    const question = screen.getByRole('button', { name: 'Hur räknas bönetiderna ut?' });
    expect(question.props.accessibilityState.expanded).toBe(false);

    await fireEvent.press(question);
    expect(
      screen.getByRole('button', { name: 'Hur räknas bönetiderna ut?' }).props.accessibilityState
        .expanded,
    ).toBe(true);
  });

  // Kontakt is wired directly to the native mail composer from Inställningar —
  // no intermediate Kontakt screen. Opening a screen with a single mail row
  // was friction without payoff. Tapping the row fires the composer.
  it('Inställningar Kontakt-row fires the native mail composer directly', async () => {
    jest.clearAllMocks();
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    await fireEvent.press(screen.getByRole('button', { name: 'Skicka e-post' }));
    await waitFor(() =>
      expect(MailComposer.composeAsync).toHaveBeenCalledWith({ recipients: ['support@islam.se'] }),
    );
  });

  // Betyg lives on Om appen as a quiet editorial footer action ("if you like
  // this, help others find it") — not under Kontakt, which would conflate a
  // store affordance with a human contact channel.
  it('Om appen exposes a Betygsätt-appen action that asks for a store review', async () => {
    jest.clearAllMocks();
    await render(<Om />);

    await fireEvent.press(screen.getByRole('button', { name: 'Betygsätt appen' }));
    await waitFor(() => expect(StoreReview.requestReview).toHaveBeenCalled());
  });

  // The map attribution links each provider, even though it now sits as quiet fine print
  // rather than a prominent "Bygger på" card. Guards the inline adhan credit (the
  // prayer-time engine, the one a curious reader is most likely to follow).
  it('links the adhan library from the credits', async () => {
    jest.clearAllMocks();
    await render(<Om />);
    await fireEvent.press(screen.getByRole('link', { name: 'adhan' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://github.com/batoulapps/adhan-js');
  });
});
