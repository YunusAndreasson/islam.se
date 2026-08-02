import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { router } from 'expo-router';

import { LocationProvider } from '@/lib/location/context';
import { SettingsProvider } from '@/lib/settings/context';
import { LocationHint } from './LocationHint';

const requestPermission = jest.mocked(Location.requestForegroundPermissionsAsync);
const getPermission = jest.mocked(Location.getForegroundPermissionsAsync);
const getCurrentPosition = jest.mocked(Location.getCurrentPositionAsync);

function permission(status: 'granted' | 'denied' | 'undetermined') {
  return {
    status,
    granted: status === 'granted',
    canAskAgain: status !== 'denied',
    expires: 'never',
  };
}

/** The card reaches the OS through the location context (so the fix it wins lands where
 *  the map, dock and scheduler all read it), so it renders inside the real providers. */
async function renderHint() {
  const onClose = jest.fn();
  render(
    <SettingsProvider>
      <LocationProvider>
        <LocationHint top={68} onClose={onClose} />
      </LocationProvider>
    </SettingsProvider>,
  );
  // Drain the providers' mount hydration so the card's CTA isn't answered 'busy' by a
  // fix that is still in flight.
  await act(async () => {});
  return { onClose };
}

// The map's soft ask for location. Prayer times ARE a function of position, so this is the
// more consequential of the app's two permissions — and the one that used to be asked
// worst, from a mount effect, over the intro. Its whole job is to make the OS dialog land
// on a user who has already agreed to the idea.
describe('LocationHint', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    getPermission.mockResolvedValue(permission('undetermined') as never);
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 55.605, longitude: 13.0038 },
    } as never);
  });

  it('explains the offer in plain Swedish with one clear action', async () => {
    await renderHint();

    expect(screen.getByText('Visa tider för din plats')).toBeTruthy();
    expect(screen.getByText('Använd min plats')).toBeTruthy();
    // The privacy sentence is the reason a user says yes to a faith app reading their
    // position at all — it must not quietly disappear in a restyle.
    expect(screen.getByText(/stannar i din enhet – inget skickas online/)).toBeTruthy();
  });

  // THE regression this file exists to prevent. If dismissing ever reached the OS, a user
  // brushing the card away would silently spend the one location prompt they will ever
  // get, and the app would compute another city's times forever.
  it('does not touch the OS prompt when dismissed', async () => {
    const { onClose } = await renderHint();

    fireEvent.press(screen.getByLabelText('Stäng'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('asks the OS once and confirms when the user accepts', async () => {
    requestPermission.mockResolvedValue(permission('granted') as never);
    await renderHint();

    await act(async () => {
      fireEvent.press(screen.getByText('Använd min plats'));
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Använder din plats')).toBeTruthy());
  });

  // A refusal must not leave a dead end. The card stays put and becomes the door onward —
  // to system settings, and (unlike the notification card, which has no equivalent) to the
  // manual city picker, which produces correct times without granting anything.
  it('offers both recovery routes when the user refuses', async () => {
    requestPermission.mockResolvedValue(permission('denied') as never);
    const { onClose } = await renderHint();

    await act(async () => {
      fireEvent.press(screen.getByText('Använd min plats'));
    });

    await waitFor(() => expect(screen.getByText(/Platsåtkomst nekad/)).toBeTruthy());
    expect(screen.getByText('Välj stad i stället')).toBeTruthy();
    // The card does NOT retire itself on a refusal — the user closes it when ready.
    expect(onClose).not.toHaveBeenCalled();
  });

  // Granted, but the fix never arrives (location services off system-wide, or a timeout).
  // Claiming "Använder din plats" here would be a lie: the times are still the fallback's.
  it('says so when permission is granted but no fix can be had', async () => {
    requestPermission.mockResolvedValue(permission('granted') as never);
    getCurrentPosition.mockRejectedValue(new Error('location services are off'));
    const { onClose } = await renderHint();

    await act(async () => {
      fireEvent.press(screen.getByText('Använd min plats'));
    });

    await waitFor(() => expect(screen.getByText('Platsen kunde inte hämtas')).toBeTruthy());
    expect(screen.getByText('Välj stad i stället')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  // The escape hatch that makes this card honest: a user who does not want to share their
  // position can still get correct times. byt-plats sets locationMode to 'manual' itself,
  // so the card writes no settings of its own.
  it('routes to the city picker without touching the OS prompt', async () => {
    const { onClose } = await renderHint();

    fireEvent.press(screen.getByText('Välj stad i stället'));

    expect(router.push).toHaveBeenCalledWith('/(settings)/byt-plats');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the hint resolved so it is never offered again', async () => {
    requestPermission.mockResolvedValue(permission('granted') as never);
    await renderHint();

    await act(async () => {
      fireEvent.press(screen.getByText('Använd min plats'));
    });

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem('locationHintSeen:v1');
      expect(raw && JSON.parse(raw).resolved).toBe(true);
    });
  });

  // Double-tapping the CTA must not put two OS dialogs in flight.
  it('ignores a second tap while the prompt is in flight', async () => {
    requestPermission.mockResolvedValue(permission('granted') as never);
    await renderHint();

    const cta = screen.getByText('Använd min plats');
    await act(async () => {
      fireEvent.press(cta);
      fireEvent.press(cta);
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});
