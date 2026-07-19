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
import { Platform } from 'react-native';

import Bonetider from '../app/bonetider';
import BytPlats from '../app/(settings)/byt-plats';
import Installningar from '../app/(settings)/installningar';
import Om from '../app/(settings)/om';
import VanligaFragor from '../app/(settings)/vanliga-fragor';
import Qibla from '../app/qibla';
import { LocationProvider } from '../lib/location/context';
import { SettingsProvider } from '../lib/settings/context';
import { DEFAULT_SETTINGS } from '../lib/settings/types';

const SETTINGS_KEY = 'prayerSettings:v1';

// Bönetider and Inställningar read settings + location context, so wrap them as
// the app does.
function withProviders(node: ReactNode) {
  return (
    <SettingsProvider>
      <LocationProvider>{node}</LocationProvider>
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

      fireEvent.press(screen.getByRole('button', { name: 'Qibla' }));
      expect(router.navigate).toHaveBeenCalledWith('/qibla');

      fireEvent.press(screen.getByRole('button', { name: 'Inställningar' }));
      expect(router.navigate).toHaveBeenCalledWith('/installningar');
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
      // The "Förhandsvisning" preview is now folded into a DisclosureGroup
      // (collapsed by default), so its prayer labels are hidden from queries until opened.
      // Expanding it and finding a prayer label proves the live preview — and thus the
      // calculation module — ran end-to-end inside the screen.
      fireEvent.press(screen.getByRole('button', { name: /^Förhandsvisning/ }));
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

  it('announces Swedish prayer names on notification switches', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        notifications: { ...DEFAULT_SETTINGS.notifications, enabled: true },
      }),
    );

    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByLabelText('Fajr, Gryningsbönen')).toBeTruthy());
    expect(screen.getByLabelText('Ẓuhr, Middagsbönen')).toBeTruthy();
    expect(screen.getByLabelText('ʿIshāʾ, Nattbönen')).toBeTruthy();
  });

  it('searches the city picker diacritic-insensitively', async () => {
    await renderSettled(
      <SettingsProvider>
        <BytPlats />
      </SettingsProvider>,
    );

    fireEvent.changeText(screen.getByLabelText('Sök stad'), 'umea');

    expect(screen.getByText('Umeå')).toBeTruthy();
    expect(screen.queryByText('Stockholm')).toBeNull();
  });

  it('selecting a city persists manual location mode and returns', async () => {
    jest.clearAllMocks();
    await renderSettled(
      <SettingsProvider>
        <BytPlats />
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

  // Progressive disclosure: the "Utseende" group lives in a collapsible
  // card that starts closed (so a first-time user isn't faced with the whole tweaks
  // panel) and opens on a header press. Guards the DisclosureGroup wiring on the screen.
  // (Beräkning used to be a disclosure too — it's now a pushed screen, see
  // src/app/(settings)/berakning.tsx — and "Manuella justeringar" recently
  // moved there alongside the other adhan calculation knobs, so what's left in
  // this group is purely display-side: Avrundning + Hijri-justering.)
  it('keeps advanced settings collapsed until their group header is pressed', async () => {
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    const header = screen.getByRole('button', { name: /^Utseende,/ });
    expect(header.props.accessibilityState.expanded).toBe(false);

    fireEvent.press(header);
    expect(
      screen.getByRole('button', { name: /^Utseende,/ }).props.accessibilityState.expanded,
    ).toBe(true);
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
