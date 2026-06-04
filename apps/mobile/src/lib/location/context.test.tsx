import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LocationProvider, useLocation } from './context';
import { SettingsProvider } from '../settings/context';

const SETTINGS_KEY = 'prayerSettings:v1';

function Probe() {
  const { source, label } = useLocation();
  return <Text testID="location">{`${source}:${label}`}</Text>;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('LocationProvider startup', () => {
  it('does not request GPS permission before persisted manual settings hydrate', async () => {
    await AsyncStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        locationMode: 'manual',
        manualLocation: { name: 'Göteborg', latitude: 57.7089, longitude: 11.9746 },
      }),
    );

    render(
      <SettingsProvider>
        <LocationProvider>
          <Probe />
        </LocationProvider>
      </SettingsProvider>,
    );
    await act(async () => {});

    await waitFor(() => expect(screen.getByTestId('location').props.children).toBe('manual:Göteborg'));
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});
