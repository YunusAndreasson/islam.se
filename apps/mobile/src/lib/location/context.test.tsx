import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { LocationProvider, useLocation, useLocationStatus } from './context';
import { SettingsProvider } from '@/lib/settings/context';

const SETTINGS_KEY = 'prayerSettings:v1';

function Probe() {
  const { source, label } = useLocation();
  return <Text testID="location">{`${source}:${label}`}</Text>;
}

/** Surfaces the permission state as the app sees it, plus the one entry point that is
 *  allowed to raise the OS dialog — the explicit refresh Inställningar and the map's
 *  LocationHint both drive. */
function PermissionProbe() {
  const { source, permissionStatus } = useLocation();
  const { refresh } = useLocationStatus();
  return (
    <>
      <Text testID="location">{`${source}:${permissionStatus}`}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Uppdatera"
        onPress={() => void refresh()}
      >
        <Text>Uppdatera</Text>
      </Pressable>
    </>
  );
}

async function mountPermissionProbe(): Promise<void> {
  render(
    <SettingsProvider>
      <LocationProvider>
        <PermissionProbe />
      </LocationProvider>
    </SettingsProvider>,
  );
  await act(async () => {});
}

function permission(status: 'granted' | 'denied' | 'undetermined') {
  return {
    status,
    granted: status === 'granted',
    canAskAgain: status !== 'denied',
    expires: 'never',
  };
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

  it('ignores malformed fresh native fixes instead of exposing or caching them', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValueOnce({
      coords: { latitude: Number.NaN, longitude: 18 },
    } as never);

    render(
      <SettingsProvider>
        <LocationProvider>
          <Probe />
        </LocationProvider>
      </SettingsProvider>,
    );

    await waitFor(() => expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.getByTestId('location').props.children).toBe('default:Stockholm (standard)');
    expect(await AsyncStorage.getItem('lastGpsCoords:v1')).toBeNull();
  });
});

// THE regression this block exists to prevent: the provider used to call
// requestForegroundPermissionsAsync() from its mount effect. On a first launch the OS
// location dialog therefore landed on top of the daybreak intro — a question about a
// screen the user had not yet seen a single prayer time on — and iOS spends that dialog
// exactly once. A reflexive "Don't allow" left the app permanently computing another
// city's times, with only an Inställningar footnote to admit it.
//
// The mount path must now READ the permission and never ask for it. Asking belongs to
// explicit gestures: Inställningar's "Uppdatera plats" row and the map's LocationHint.
describe('LocationProvider never prompts unprompted', () => {
  it('does not raise the OS dialog on mount while the permission is undetermined', async () => {
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(
      permission('undetermined') as never,
    );

    await mountPermissionProbe();

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    // 'undetermined', NOT 'denied'. `granted: false` covers both, and conflating them
    // would show a system-settings dead end to someone who was simply never asked.
    expect(screen.getByTestId('location').props.children).toBe('default:undetermined');
  });

  it('does not re-ask on mount after a refusal either', async () => {
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue(permission('denied') as never);

    await mountPermissionProbe();

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').props.children).toBe('default:denied');
  });

  // The other half of the contract: not prompting must not mean not working. A user who
  // granted the permission on an earlier launch gets their fix silently, as before.
  it('still fetches a fix on mount when the permission is already granted', async () => {
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue(permission('granted') as never);

    await mountPermissionProbe();

    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location').props.children).toBe('gps:granted');
  });

  it('keeps the Stockholm fallback when the permission read itself throws', async () => {
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockRejectedValue(new Error('location services unavailable'));

    await mountPermissionProbe();

    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId('location').props.children).toBe('default:undetermined');
  });

  // Moving the prompt out of the effect must not have moved it out of the app.
  it('prompts when the user explicitly asks for a fix', async () => {
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue(permission('undetermined') as never);
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValue(permission('granted') as never);

    await mountPermissionProbe();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Uppdatera'));
    });

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location').props.children).toBe('gps:granted');
  });

  it('records a refusal from that explicit ask so Inställningar can offer its recovery link', async () => {
    jest
      .mocked(Location.getForegroundPermissionsAsync)
      .mockResolvedValue(permission('undetermined') as never);
    jest
      .mocked(Location.requestForegroundPermissionsAsync)
      .mockResolvedValue(permission('denied') as never);

    await mountPermissionProbe();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Uppdatera'));
    });

    expect(screen.getByTestId('location').props.children).toBe('default:denied');
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});
