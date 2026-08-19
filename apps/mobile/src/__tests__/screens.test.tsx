import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';
import type { ReactElement, ReactNode } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

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
import { DEFAULT_SETTINGS } from '@/lib/settings/types';
import { first } from '@/test-utils/at';
import { LogManager } from '@maplibre/maplibre-react-native';

const SETTINGS_KEY = 'prayerSettings:v1';

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
  render(node);
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
  const MAP_RENDER_TIMEOUT = 20_000;

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it(
    'renders the Bönetider map',
    async () => {
      await renderSettled(withProviders(<Bonetider />));
      expect(screen.getByTestId('sweden-map')).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  // Navigation is the floating MapNav overlay now (no hamburger): a Qibla compass on
  // the left and a settings cog on the right, both on the map. Press the real controls
  // so a missing handler or wrong route breaks the test, not just the label.
  it(
    'opens Qibla and Inställningar from the map nav controls',
    async () => {
      jest.clearAllMocks();
      await renderSettled(withProviders(<Bonetider />));

      // Prefix match: the compass button's label carries its live state — plain "Qibla"
      // with a heading, "…du är vänd mot Mecka" on lock, "…riktningen är inte tillgänglig"
      // with no magnetometer (which is the case under test). What this asserts is the
      // ROUTE, so pinning the exact wording would only make it break on a copy tweak.
      fireEvent.press(screen.getByRole('button', { name: /^Qibla/ }));
      expect(router.navigate).toHaveBeenCalledWith('/qibla');

      fireEvent.press(screen.getByRole('button', { name: 'Inställningar' }));
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

  // THE BUG THIS GUARDS: "Återställ" was on screen at launch, on a map nobody had
  // touched. Reported as "I see Återställ, which is unexpected after not having touched
  // the map."
  //
  // The startup camera settles more than once and not always on the same frame: the
  // initial fitBounds re-runs as `insets.bottom` lands (0 on the first render, real once
  // the safe-area provider measures), onLayout remeasures the viewport, and MapLibre
  // clamps to maxBounds/minZoom when the style loads. Measured against the frame sampled
  // at mount, any of those clears the 0.5°/0.05 drift thresholds — so the chip claimed
  // "you moved the map" about a move the app made itself.
  //
  // The gate is `userInteraction`: a settle the user did not cause is home, not drift.
  // The second settle below is deliberately a long way off the first (5°, 0.4 zoom) —
  // far past any threshold — so the test fails loudly if the gate is ever dropped.
  it(
    'never shows the reset chip for camera settles the user did not cause',
    async () => {
      await renderSettled(withProviders(<Bonetider />));
      const map = screen.getByTestId('sweden-map');
      const settle = async (bounds: number[], zoom: number, userInteraction = false) => {
        await act(async () => {
          fireEvent(map, 'regionDidChange', { nativeEvent: { zoom, bounds, userInteraction } });
        });
      };

      await settle([11.15, 55.35, 23.7, 69.0], 4.5);
      // The app re-fitting itself once the insets/viewport land — no finger involved.
      await settle([16.15, 60.35, 28.7, 74.0], 4.1);

      expect(screen.queryByLabelText('Återställ kartan')).toBeNull();

      // And home has moved with it: a pan back to the ORIGINAL mount frame is now a
      // real drift from where the map actually settled, so the chip appears.
      await settle([11.15, 55.35, 23.7, 69.0], 4.5, true);
      expect(screen.getByLabelText('Återställ kartan')).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

  // THE BUG THIS GUARDS: the "Återställ" chip came back the instant it was pressed.
  //
  // "Home" was a SAMPLE — the frame that happened to settle at mount — while pressing
  // the chip runs a fresh fitBounds, and the two need not agree. Its padding is
  // `collapsedDock + DOCK_MARGIN`, and collapsedDock carries `insets.bottom`, which is
  // 0 on the first render and settles once the safe-area provider measures. So the
  // reset lands slightly off the sample, `drifted` reads true again, and the settled
  // event that ENDS the reset animation puts the chip straight back.
  //
  // The landing frame below is therefore deliberately NOT identical to the anchor —
  // feeding back the exact same numbers would pass against the broken code and prove
  // nothing. It is off by ~0.9° and 0.1 zoom: past the 0.5°/0.05 thresholds, i.e.
  // exactly the "close but not equal" case a real fitBounds produces.
  it(
    'keeps the reset chip hidden once pressed, even if the camera lands slightly off home',
    async () => {
      await renderSettled(withProviders(<Bonetider />));
      const map = screen.getByTestId('sweden-map');
      const settle = async (bounds: number[], zoom: number, userInteraction = false) => {
        await act(async () => {
          fireEvent(map, 'regionDidChange', { nativeEvent: { zoom, bounds, userInteraction } });
        });
      };

      // Mount fit — becomes the anchor. Then a pan far enough to raise the chip.
      await settle([11.15, 55.35, 23.7, 69.0], 4.5);
      await settle([20.0, 60.0, 32.0, 72.0], 4.5, true);
      const chip = screen.getByLabelText('Återställ kartan');

      await act(async () => {
        fireEvent.press(chip);
      });
      // fitBounds settles — near home, but not on the exact frame recorded at mount.
      await settle([12.05, 56.25, 24.6, 69.9], 4.4);

      expect(screen.queryByLabelText('Återställ kartan')).toBeNull();
    },
    MAP_RENDER_TIMEOUT,
  );

  // Re-anchoring must not swallow a real pan: after a reset, moving again has to bring
  // the chip back, or the map becomes a screen you can never get home from twice.
  it(
    'brings the reset chip back when the map is moved again after a reset',
    async () => {
      await renderSettled(withProviders(<Bonetider />));
      const map = screen.getByTestId('sweden-map');
      const settle = async (bounds: number[], zoom: number, userInteraction = false) => {
        await act(async () => {
          fireEvent(map, 'regionDidChange', { nativeEvent: { zoom, bounds, userInteraction } });
        });
      };

      await settle([11.15, 55.35, 23.7, 69.0], 4.5);
      await settle([20.0, 60.0, 32.0, 72.0], 4.5, true);
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Återställ kartan'));
      });
      await settle([12.05, 56.25, 24.6, 69.9], 4.4);
      expect(screen.queryByLabelText('Återställ kartan')).toBeNull();

      await settle([25.0, 62.0, 37.0, 74.0], 4.4, true);

      expect(screen.getByLabelText('Återställ kartan')).toBeTruthy();
    },
    MAP_RENDER_TIMEOUT,
  );

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
      const camera = screen.UNSAFE_getByType('Camera' as never);

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
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValueOnce({ status: 'denied', granted: false } as never);

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
          screen.getByText('Notiser är blockerade. Öppna iOS-inställningar för att tillåta dem.'),
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
      expect(screen.getByText('Planeras lokalt på din enhet – inget skickas online.')).toBeTruthy(),
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
    fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('/(settings)/notiser');
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
    // Each prayer's controls live inside a collapsed DisclosureGroup, so open one before
    // querying — the same pattern the Förhandsvisning case above uses.
    // "Fajr" also prefixes the Fajr-fönstret group's title, so take the first match —
    // the per-prayer group, which renders above it.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Fajr/ }).length).toBeGreaterThan(0));
    fireEvent.press(first(screen.getAllByRole('button', { name: /^Fajr/ }), 'Fajr buttons'));
    expect(screen.getByLabelText('Påminnelse, Gryningsbönen')).toBeTruthy();
  });

  it('searches the city picker diacritic-insensitively', async () => {
    await renderSettled(
      <SettingsProvider>
      <IntroProvider>
        <BytPlats />
      </IntroProvider>
    </SettingsProvider>,
    );

    fireEvent.changeText(screen.getByLabelText('Sök stad'), 'umea');

    expect(screen.getByText('1 träff')).toBeTruthy();
    expect(screen.getByText('Umeå')).toBeTruthy();
    expect(screen.queryByText('Stockholm')).toBeNull();
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

    fireEvent.changeText(screen.getByLabelText('Sök stad'), 'umea');
    fireEvent.press(screen.getByRole('button', { name: /^Umeå,/ }));

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
    expect(toggle.props.value).toBe(true);

    fireEvent(toggle, 'valueChange', false);

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
    expect(toggle.props.value).toBe(false);

    fireEvent(toggle, 'valueChange', true);

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
    expect(screen.getByRole('radio', { name: /Följ system/ })).toBeTruthy();
    expect(screen.getByLabelText('Dagar')).toBeTruthy();
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

    fireEvent.press(screen.getByRole('radio', { name: /^Hanafi/ }));

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

    screen.unmount();
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());
    expect(screen.queryByRole('radio', { name: /Närmaste minut/ })).toBeNull();
  });

  it('renders the Om screen as an identity page (masthead + integritet + fine-print credits)', () => {
    // Om is the calm identity page: a masthead (wordmark + one-line lead), a privacy
    // promise, support links, and an imprint colophon with the version + the map
    // attribution as fine print. The old technical "Bygger på" dependency card is GONE
    // (no real user recognises adhan / MapLibre / MapTiler) — this guard keeps it gone,
    // along with the FAQ (which lives on /vanliga-fragor) and Kontakt.
    render(<Om />);
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
  it('keeps a FAQ answer collapsed until its question is pressed', () => {
    render(<VanligaFragor />);
    const question = screen.getByRole('button', { name: 'Hur räknas bönetiderna ut?' });
    expect(question.props.accessibilityState.expanded).toBe(false);

    fireEvent.press(question);
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

    fireEvent.press(screen.getByRole('button', { name: 'Kontakt' }));
    await waitFor(() =>
      expect(MailComposer.composeAsync).toHaveBeenCalledWith({ recipients: ['support@islam.se'] }),
    );
  });

  // Betyg lives on Om appen as a quiet editorial footer action ("if you like
  // this, help others find it") — not under Kontakt, which would conflate a
  // store affordance with a human contact channel.
  it('Om appen exposes a Betygsätt-appen action that asks for a store review', async () => {
    jest.clearAllMocks();
    render(<Om />);

    fireEvent.press(screen.getByRole('button', { name: 'Betygsätt appen' }));
    await waitFor(() => expect(StoreReview.requestReview).toHaveBeenCalled());
  });

  // The map attribution links each provider, even though it now sits as quiet fine print
  // rather than a prominent "Bygger på" card. Guards the inline adhan credit (the
  // prayer-time engine, the one a curious reader is most likely to follow).
  it('links the adhan library from the credits', () => {
    jest.clearAllMocks();
    render(<Om />);
    fireEvent.press(screen.getByRole('link', { name: 'adhan' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://github.com/batoulapps/adhan-js');
  });
});
