import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as MailComposer from 'expo-mail-composer';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';

import Bonetider from '../app/(tabs)/bonetider';
import Installningar from '../app/(tabs)/installningar';
import Om from '../app/(tabs)/om';
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

// Smoke tests: each tab screen mounts and shows its content. Cheap regression
// guard that the screens stay renderable as the app grows.
describe('tab screens', () => {
  it('renders the Bönetider map', () => {
    render(withProviders(<Bonetider />));
    expect(screen.getByTestId('sweden-map')).toBeTruthy();
  });

  it('renders the Inställningar screen once settings load', async () => {
    render(withProviders(<Installningar />));
    // The header appears after the async settings hydration flips `loaded`.
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
    render(withProviders(<Installningar />));
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    // The "Beräkning" group header is a button labelled with its current value.
    const header = screen.getByRole('button', { name: /^Beräkning,/ });
    expect(header.props.accessibilityState.expanded).toBe(false);

    fireEvent.press(header);
    expect(
      screen.getByRole('button', { name: /^Beräkning,/ }).props.accessibilityState.expanded,
    ).toBe(true);
  });

  it('renders the Om screen content', () => {
    render(<Om />);
    // Om leads with the wordmark and groups its explanations under a FAQ + contact.
    // (The wordmark renders as the hero brand and again as the website link detail.)
    expect(screen.getAllByText('islam.se').length).toBeGreaterThan(0);
    // SettingSection renders its title uppercased.
    expect(screen.getByText(/vanliga frågor/i)).toBeTruthy();
    expect(screen.getByText(/^Version /)).toBeTruthy();
  });

  // Progressive disclosure on Om: each FAQ answer stays folded behind its question
  // until the reader taps it. Guards the FaqItem accordion wiring (a11y + toggle).
  it('keeps a FAQ answer collapsed until its question is pressed', () => {
    render(<Om />);
    const question = screen.getByRole('button', { name: 'Hur räknas bönetiderna ut?' });
    expect(question.props.accessibilityState.expanded).toBe(false);

    fireEvent.press(question);
    expect(
      screen.getByRole('button', { name: 'Hur räknas bönetiderna ut?' }).props.accessibilityState
        .expanded,
    ).toBe(true);
  });

  // The Kontakt rows wire to the native helpers: the mail row opens the composer
  // (available in the mock), the website row opens the in-app browser.
  it('opens the mail composer and the website from the Kontakt rows', async () => {
    jest.clearAllMocks();
    render(<Om />);

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
