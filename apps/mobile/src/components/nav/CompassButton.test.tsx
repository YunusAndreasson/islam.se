// The map's qibla disc. What is pinned here is the one thing a screenshot cannot show: the
// lock is SILENT. The disc locks passively, as the phone sweeps past Mecca while the reader
// is reading prayer times, and lib/haptics gives an unbidden lock no buzz — only the Qibla
// screen, where the reader sets out to aim, confirms its lock with one.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { CompassButton } from '@/components/nav/CompassButton';
import * as haptics from '@/lib/haptics';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { qiblaBearing } from '@/lib/qibla';
import { SettingsProvider } from '@/lib/settings/context';

/** Stockholm — the position jest.setup's location mock hands out. */
const HERE = { latitude: 59.3293, longitude: 18.0686 };

describe('CompassButton', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
    jest.mocked(Location.getForegroundPermissionsAsync).mockImplementation(
      (async () => ({ status: 'granted', granted: true })) as never,
    );
  });

  it('lights when aimed at Mecca, without a haptic', async () => {
    type Emit = (h: { trueHeading: number; magHeading: number; accuracy: number }) => void;
    let emit: Emit | null = null;
    jest.mocked(Location.watchHeadingAsync).mockImplementation((async (cb: Emit) => {
      emit = cb;
      return { remove: jest.fn() };
    }) as never);
    const success = jest.spyOn(haptics, 'hapticSuccess');
    await render(
      <SettingsProvider>
        <IntroProvider>
          <LocationProvider>
            <CompassButton active />
          </LocationProvider>
        </IntroProvider>
      </SettingsProvider>,
    );
    await waitFor(() => expect(emit).not.toBeNull());
    const bearing = qiblaBearing(HERE);
    await act(async () => {
      emit?.({ trueHeading: bearing, magHeading: bearing, accuracy: 3 });
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Qibla – du är vänd mot Mecka' })).toBeTruthy(),
    );
    expect(success).not.toHaveBeenCalled();
  });
});
