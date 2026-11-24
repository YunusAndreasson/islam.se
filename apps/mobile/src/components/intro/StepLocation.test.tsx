import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { type GpsOutcome, useLocationStatus } from '@/lib/location/context';
import { noteLocationResolved } from '@/lib/location-hint';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
import { StepLocation } from './StepLocation';

jest.mock('@/lib/location/context', () => ({
  useLocation: () => ({ source: 'default' }),
  useLocationStatus: jest.fn(),
}));
jest.mock('@/lib/location-hint', () => ({ noteLocationResolved: jest.fn(async () => {}) }));
jest.mock('@/lib/haptics', () => ({
  setHapticsEnabled: jest.fn(), hapticSelection: jest.fn(),
  hapticSuccess: jest.fn(), hapticWarning: jest.fn(),
}));

function SettingsProbe() {
  const { settings } = useSettings();
  return <Text testID="location-choice">{`${settings.locationMode}:${settings.manualLocation?.name ?? ''}`}</Text>;
}

function Contents({ visible = true }: { visible?: boolean }) {
  return <><SettingsProbe />{visible ? <StepLocation /> : null}</>;
}

async function startPendingGps() {
  let finish!: (outcome: GpsOutcome) => void;
  const refresh = jest.fn(() => new Promise<GpsOutcome>((resolve) => { finish = resolve; }));
  jest.mocked(useLocationStatus).mockReturnValue({ locating: false, refresh, confirmFirstRunGps: jest.fn(), keepFirstRunFallback: async () => {},
    resumedCandidate: null, dismissResumedCandidate: jest.fn() });
  const view = await render(<SettingsProvider><Contents /></SettingsProvider>);
  await act(async () => {});
  await fireEvent.press(screen.getByLabelText('Använd min plats'));
  expect(refresh).toHaveBeenCalledTimes(1);
  return { ...view, finish };
}

describe('StepLocation pending GPS choice', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    jest.mocked(noteLocationResolved).mockResolvedValue(undefined);
  });

  it.each<GpsOutcome>(['ok', 'error', 'denied'])(
    'keeps the city picker open when the abandoned GPS request finishes with %s',
    async (outcome) => {
      const { finish } = await startPendingGps();
      await fireEvent.press(screen.getByLabelText('Välj stad i stället'));
      await act(async () => { finish(outcome); });
      expect(screen.getByLabelText('Sök stad')).toBeTruthy();
      expect(noteLocationResolved).not.toHaveBeenCalled();
      expect(hapticSuccess).not.toHaveBeenCalled();
      expect(hapticWarning).not.toHaveBeenCalled();
    },
  );

  it.each<GpsOutcome>(['ok', 'error', 'denied'])(
    'preserves the newer manual city when GPS finishes with %s',
    async (outcome) => {
      const { finish } = await startPendingGps();
      await fireEvent.press(screen.getByLabelText('Välj stad i stället'));
      await fireEvent.changeText(screen.getByLabelText('Sök stad'), 'Malmö');
      await fireEvent.press(screen.getByLabelText('Malmö, Skåne'));
      await act(async () => { finish(outcome); });
      expect(screen.getByTestId('location-choice').props.children).toBe('manual:Malmö');
      expect(screen.getByText('Tiderna räknas ut för Malmö.')).toBeTruthy();
      expect(hapticSuccess).not.toHaveBeenCalled();
      expect(hapticWarning).not.toHaveBeenCalled();
    },
  );

  it('does not change shared settings or play feedback after leaving the step', async () => {
    const { finish, rerender } = await startPendingGps();
    await rerender(<SettingsProvider><Contents visible={false} /></SettingsProvider>);
    await act(async () => { finish('ok'); });
    expect(noteLocationResolved).not.toHaveBeenCalled();
    expect(hapticSuccess).not.toHaveBeenCalled();
    expect(hapticWarning).not.toHaveBeenCalled();
  });

  it('checks for a newer choice again after persisting the permission answer', async () => {
    let finishPersist!: () => void;
    jest.mocked(noteLocationResolved).mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishPersist = resolve;
    }));
    const { finish } = await startPendingGps();
    await act(async () => { finish('ok'); });
    expect(noteLocationResolved).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Välj stad i stället'));
    await fireEvent.changeText(screen.getByLabelText('Sök stad'), 'Malmö');
    await fireEvent.press(screen.getByLabelText('Malmö, Skåne'));
    await act(async () => { finishPersist(); });
    expect(screen.getByTestId('location-choice').props.children).toBe('manual:Malmö');
    expect(screen.getByText('Tiderna räknas ut för Malmö.')).toBeTruthy();
    expect(hapticSuccess).not.toHaveBeenCalled();
  });
});
