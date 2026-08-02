// "Återställ appens standard" — the reset button on Inställningar and the context reset
// behind it. Two guards: (1) reset() truly restores EVERY field to DEFAULT_SETTINGS (a
// missed field would silently survive a "reset"), and (2) the screen's button is wired to
// the confirm → reset path, observed through a probe sharing the same SettingsProvider so
// the assertion is the real settings state, not a re-derivation.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type AlertButton, Alert, Pressable, Text } from 'react-native';

import Installningar from '../app/(settings)/installningar';
import { LocationProvider } from '../lib/location/context';
import { SettingsProvider, useSettings } from '../lib/settings/context';
import { DEFAULT_SETTINGS, type PrayerSettings } from '../lib/settings/types';

// A patch that differs from DEFAULT_SETTINGS in every field (incl. the nested objects),
// so "reset restores defaults" is a real claim and not vacuously true.
const MUTATION: Partial<PrayerSettings> = {
  calculationMethod: 'Egyptian',
  madhab: 'hanafi',
  highLatitudeRule: 'twilightAngle',
  polarCircleResolution: 'unresolved',
  shafaq: 'ahmer',
  rounding: 'up',
  hijriOffset: 2,
  theme: 'dark',
  mapStyle: 'satellite',
  showMosques: false,
  showQibla: false,
  haptics: false,
  locationMode: 'manual',
  manualLocation: { name: 'Malmö', latitude: 55.605, longitude: 13.0038 },
  adjustments: { fajr: 5, sunrise: 0, dhuhr: -3, asr: 0, maghrib: 2, isha: 0 },
  notifications: {
    enabled: true,
    prayers: { fajr: false, dhuhr: true, asr: false, maghrib: true, isha: false },
    fajrWindowEnd: true,
    lead: { fajr: 15, sunrise: 30, dhuhr: 10, asr: 5, maghrib: 0, isha: 20 },
    sound: {
      fajr: 'silent',
      sunrise: 'silent',
      dhuhr: 'silent',
      asr: 'silent',
      maghrib: 'silent',
      isha: 'silent',
    },
  },
};

// Reads/writes the shared settings so a test can mutate them and observe a reset as the
// actual persisted state (not by re-running any logic under test).
function Probe() {
  const { settings, update, reset } = useSettings();
  return (
    <>
      <Text testID="dump">{JSON.stringify(settings)}</Text>
      {/* Object IDENTITY against the exported constant, compared HERE, inside the render.
          It cannot be asserted from `dump` — JSON.parse hands back fresh objects every
          time, so a `not.toBe(DEFAULT_SETTINGS.lead)` on parsed output passes whether or
          not the live state aliases the constant, and would silently stop guarding
          anything. This is what makes the aliasing test below real. */}
      <Text testID="aliases">
        {JSON.stringify({
          adjustments: settings.adjustments === DEFAULT_SETTINGS.adjustments,
          notifications: settings.notifications === DEFAULT_SETTINGS.notifications,
          prayers: settings.notifications.prayers === DEFAULT_SETTINGS.notifications.prayers,
          lead: settings.notifications.lead === DEFAULT_SETTINGS.notifications.lead,
          sound: settings.notifications.sound === DEFAULT_SETTINGS.notifications.sound,
        })}
      </Text>
      <Pressable testID="probe-mutate" onPress={() => update(MUTATION)} />
      <Pressable testID="probe-reset" onPress={reset} />
    </>
  );
}

const aliases = (): Record<string, boolean> =>
  JSON.parse(screen.getByTestId('aliases').props.children as string) as Record<string, boolean>;

const dump = (): PrayerSettings =>
  JSON.parse(screen.getByTestId('dump').props.children as string) as PrayerSettings;

beforeEach(async () => {
  // Each change persists to AsyncStorage; clear it so a mutation from one test doesn't
  // hydrate into the next and invalidate its "starts from defaults" assumption.
  await AsyncStorage.clear();
});

describe('settings reset() — restores every field to the app defaults', () => {
  it('clears a fully-mutated settings object back to DEFAULT_SETTINGS', async () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('dump')).toBeTruthy());

    fireEvent.press(screen.getByTestId('probe-mutate'));
    // Sanity: the mutation actually took (so the reset assertion below isn't vacuous).
    expect(dump()).not.toEqual(DEFAULT_SETTINGS);
    expect(dump().theme).toBe('dark');

    fireEvent.press(screen.getByTestId('probe-reset'));
    expect(dump()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('Inställningar — the "Återställ appens standard" button', () => {
  // Auto-confirm the native dialog by invoking its destructive button, the way a user
  // tapping "Återställ" would.
  let alertSpy: ReturnType<typeof jest.spyOn>;
  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((
      _title: string,
      _message?: string,
      buttons?: AlertButton[],
    ) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
  });
  afterEach(() => alertSpy.mockRestore());

  it('confirms, then resets the live settings to defaults', async () => {
    render(
      <SettingsProvider>
        <LocationProvider>
          <Installningar />
          <Probe />
        </LocationProvider>
      </SettingsProvider>,
    );
    await waitFor(() => expect(screen.getByText('Inställningar')).toBeTruthy());

    fireEvent.press(screen.getByTestId('probe-mutate'));
    expect(dump().theme).toBe('dark');
    expect(dump().notifications.enabled).toBe(true);

    // Press the REAL reset button on the screen; the mocked Alert confirms for us.
    fireEvent.press(screen.getByLabelText('Återställ alla inställningar till appens standard'));

    expect(alertSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(dump()).toEqual(DEFAULT_SETTINGS));

    // THE BUG THIS GUARDS: reset() spreads DEFAULT_SETTINGS, so every NESTED object it
    // does not explicitly clone comes back as the very same reference as the exported
    // constant. One later in-place edit would then rewrite the app's defaults for the
    // rest of the process — and the toEqual above, which compares by VALUE, would still
    // pass. Only identity catches it, so assert identity (measured in the Probe, on the
    // live objects — see its comment for why it cannot be measured out here).
    expect(aliases()).toEqual({
      adjustments: false,
      notifications: false,
      prayers: false,
      lead: false,
      sound: false,
    });
  });
});

// The guard that keeps the two tests above honest. Both rest on MUTATION being a genuinely
// full mutation; a settings field added to the type but not to MUTATION would sail through
// "clears a fully-mutated settings object" while never having been mutated at all. Adding
// a field must therefore force an edit here — treat a failure as the guard working.
describe('MUTATION covers every settings field', () => {
  it('names exactly the keys of DEFAULT_SETTINGS', () => {
    expect(Object.keys(MUTATION).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('gives every key a value that actually differs from the default', () => {
    for (const [key, value] of Object.entries(MUTATION)) {
      expect({ [key]: value }).not.toEqual({
        [key]: DEFAULT_SETTINGS[key as keyof PrayerSettings],
      });
    }
  });
});
