import { describe, expect, it } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';
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
    // module) ran end-to-end inside the screen. 'Fajr' shows in preview + adjustments.
    expect(screen.getAllByText('Fajr').length).toBeGreaterThan(0);
  });

  it('renders the Om title', () => {
    render(<Om />);
    expect(screen.getByText('Om')).toBeTruthy();
  });
});
