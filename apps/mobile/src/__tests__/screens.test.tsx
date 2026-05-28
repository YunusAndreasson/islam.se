import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as MailComposer from 'expo-mail-composer';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';
import type { ReactElement, ReactNode } from 'react';

import Bonetider from '../app/bonetider';
import Installningar from '../app/(settings)/installningar';
import Kontakt from '../app/(settings)/kontakt';
import Om from '../app/(settings)/om';
import VanligaFragor from '../app/(settings)/vanliga-fragor';
import Qibla from '../app/qibla';
import { LocationProvider } from '../lib/location/context';
import { SettingsProvider } from '../lib/settings/context';

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

// Smoke tests: each tab screen mounts and shows its content. Cheap regression
// guard that the screens stay renderable as the app grows.
describe('tab screens', () => {
  // The map screen is the heaviest render in the suite (MapLibre + the Skia solar
  // overlay + the floating MapNav), so it gets headroom past the 5 s default — under
  // parallel-worker CPU contention a heavy render legitimately runs a few seconds.
  const MAP_RENDER_TIMEOUT = 20_000;

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
  });

  it('renders the Inställningar screen once settings load', async () => {
    await renderSettled(withProviders(<Installningar />));
    // The header appears after the async settings hydration flips `loaded` (settled above).
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());
    // A prayer label rendering proves the live preview (and thus the calculation
    // module) ran end-to-end inside the screen. Match with a regex, not exact text:
    // the preview row appends "  ·  nästa" to whichever prayer is next (so the label
    // is "Fajr  ·  nästa" when Fajr is next), and the adjustments "Fajr" lives inside
    // a collapsed DisclosureGroup that's hidden from queries. The preview Fajr is the
    // always-visible one we assert on.
    expect(screen.getAllByText(/Fajr/).length).toBeGreaterThan(0);
  });

  // Progressive disclosure: advanced settings live in collapsible groups that start
  // closed (so a first-time user isn't faced with the whole calculation panel) and
  // open on a header press. Guards the DisclosureGroup wiring on the screen.
  it('keeps advanced settings collapsed until their group header is pressed', async () => {
    await renderSettled(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    // The "Beräkning" group header is a button labelled with its current value.
    const header = screen.getByRole('button', { name: /^Beräkning,/ });
    expect(header.props.accessibilityState.expanded).toBe(false);

    fireEvent.press(header);
    expect(
      screen.getByRole('button', { name: /^Beräkning,/ }).props.accessibilityState.expanded,
    ).toBe(true);
  });

  it('renders the Om screen content (masthead + privacy + credits + version)', () => {
    // Om now holds only the editorial part — FAQ moved to /vanliga-fragor and
    // contact actions to /kontakt, each its own peer screen linked from
    // Inställningar. This guard makes sure the trimmed Om still carries what
    // makes it Om: brand mark, privacy promise, version. If a future change
    // accidentally re-folds FAQ/Kontakt back into Om, the dedicated tests
    // below (on VanligaFragor / Kontakt) would still pass — so this one is
    // negative-asserting on the moved content to lock the split in.
    render(<Om />);
    expect(screen.getAllByText('islam.se').length).toBeGreaterThan(0);
    expect(screen.getByText(/Inga konton, ingen spårning/)).toBeTruthy();
    expect(screen.getByText(/^Version /)).toBeTruthy();
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

  // The Kontakt rows wire to the native helpers: the mail row opens the composer
  // (available in the mock), the website row opens the in-app browser, the rate
  // row asks the store.
  it('opens the mail composer and the website from the Kontakt rows', async () => {
    jest.clearAllMocks();
    render(<Kontakt />);

    fireEvent.press(screen.getByRole('button', { name: 'Mejla oss' }));
    await waitFor(() =>
      expect(MailComposer.composeAsync).toHaveBeenCalledWith({ recipients: ['support@islam.se'] }),
    );

    fireEvent.press(screen.getByRole('button', { name: 'Läs mer på islam.se' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://islam.se');

    fireEvent.press(screen.getByRole('button', { name: 'Betygsätt appen' }));
    await waitFor(() => expect(StoreReview.requestReview).toHaveBeenCalled());
  });

  // The source credits link the open-source projects so each name is plainly a real,
  // tappable project. Guards the adhan link (the one a reader is most likely to follow).
  it('links the adhan library from the credits', () => {
    jest.clearAllMocks();
    render(<Om />);
    fireEvent.press(screen.getByRole('link', { name: 'adhan' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://github.com/batoulapps/adhan-js');
  });
});
