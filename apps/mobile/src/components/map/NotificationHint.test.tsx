import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PermissionStatus } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';
import { Text } from 'react-native';

import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useNotificationPermission } from '@/lib/notifications-permission';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
import { NotificationHint } from './NotificationHint';

jest.mock('@/lib/haptics', () => ({
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  setHapticsEnabled: jest.fn(),
}));

const getPermissionsMock = Notifications.getPermissionsAsync as unknown as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const requestPermissionsMock =
  Notifications.requestPermissionsAsync as unknown as jest.MockedFunction<
    typeof Notifications.requestPermissionsAsync
  >;

function undetermined(): Awaited<ReturnType<typeof Notifications.getPermissionsAsync>> {
  return {
    granted: false,
    canAskAgain: true,
    status: PermissionStatus.UNDETERMINED,
    expires: 'never',
  };
}

async function renderHint(overrides: Partial<Parameters<typeof NotificationHint>[0]> = {}) {
  const props = { top: 68, onEnable: jest.fn(), onClose: jest.fn(), ...overrides };
  await render(<NotificationHint {...props} />);
  return props;
}

// The map's soft ask for notification permission. Its entire reason to exist is that iOS
// grants ONE notification prompt per install: the card explains the offer so the prompt is
// only ever spent on a user who has already said yes to the idea.
describe('NotificationHint', () => {
  afterEach(() => { jest.useRealTimers(); });
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    getPermissionsMock.mockResolvedValue(undetermined());
  });

  it('offers reminders in plain Swedish with one clear action', async () => {
    await renderHint();
    expect(screen.getByText('Påminn om bönetider')).toBeTruthy();
    expect(screen.getByText('Slå på påminnelser')).toBeTruthy();
  });

  // THE regression this file exists to prevent. If dismissing ever reached the OS, a user
  // brushing the card away would silently spend the one prompt they will ever get, and
  // prayer reminders would be locked behind the system Settings app forever.
  it('does not touch the OS prompt when dismissed', async () => {
    const { onClose, onEnable } = await renderHint();

    await fireEvent.press(screen.getByLabelText('Stäng'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(requestPermissionsMock).not.toHaveBeenCalled();
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('asks the OS once and turns reminders on when the user accepts', async () => {
    requestPermissionsMock.mockResolvedValue({
      ios: { status: Notifications.IosAuthorizationStatus.AUTHORIZED } as NonNullable<Notifications.NotificationPermissionsStatus['ios']>,
      granted: true,
      canAskAgain: true,
      status: PermissionStatus.GRANTED,
      expires: 'never',
    });
    const { onEnable } = await renderHint();

    await act(async () => {
      await fireEvent.press(screen.getByText('Slå på påminnelser'));
    });

    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
    expect(onEnable).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Påminnelser är på')).toBeTruthy());
  });

  // A refusal must not leave a dead end. The card stays put and becomes the door to system
  // settings — the only route left, since iOS will not show its dialog a second time.
  it('offers the system-settings route when the user refuses', async () => {
    requestPermissionsMock.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: PermissionStatus.DENIED,
      expires: 'never',
    });
    const { onEnable, onClose } = await renderHint();

    await act(async () => {
      await fireEvent.press(screen.getByText('Slå på påminnelser'));
    });

    await waitFor(() => expect(screen.getByText(/Notiser är blockerade/)).toBeTruthy());
    // A refusal offers recovery but must leave the master off.
    expect(onEnable).not.toHaveBeenCalled();
    // The card does NOT retire itself on a refusal — the user closes it when ready.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marks the hint resolved so it is never offered again', async () => {
    requestPermissionsMock.mockResolvedValue({
      ios: { status: Notifications.IosAuthorizationStatus.AUTHORIZED } as NonNullable<Notifications.NotificationPermissionsStatus['ios']>,
      granted: true,
      canAskAgain: true,
      status: PermissionStatus.GRANTED,
      expires: 'never',
    });
    await renderHint();

    await act(async () => {
      await fireEvent.press(screen.getByText('Slå på påminnelser'));
    });

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem('notificationHintSeen:v1');
      expect(raw && JSON.parse(raw).resolved).toBe(true);
    });
  });

  // Double-tapping the CTA must not put two OS dialogs in flight.
  it('ignores a second tap while the prompt is in flight', async () => {
    requestPermissionsMock.mockResolvedValue({
      ios: { status: Notifications.IosAuthorizationStatus.AUTHORIZED } as NonNullable<Notifications.NotificationPermissionsStatus['ios']>,
      granted: true,
      canAskAgain: true,
      status: PermissionStatus.GRANTED,
      expires: 'never',
    });
    await renderHint();

    const cta = screen.getByText('Slå på påminnelser');
    await act(async () => {
      await fireEvent.press(cta);
      await fireEvent.press(cta);
    });

    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])('preserves a late permission answer (%s) without stale feedback', async (granted) => {
    let finish!: (value: Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>) => void;
    requestPermissionsMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { onClose, onEnable } = await renderHint();
    jest.useFakeTimers();
    await fireEvent.press(screen.getByText('Slå på påminnelser'));
    await act(async () => {});
    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Stäng'));
    await screen.unmount();

    await act(async () => {
      finish({
        ios: { status: granted ? 2 : 1 } as NonNullable<Notifications.NotificationPermissionsStatus['ios']>,
        granted,
        canAskAgain: false,
        status: granted ? PermissionStatus.GRANTED : PermissionStatus.DENIED,
        expires: 'never',
      });
    });
    expect(onEnable).toHaveBeenCalledTimes(granted ? 1 : 0);
    const raw = await AsyncStorage.getItem('notificationHintSeen:v1');
    expect(raw && JSON.parse(raw).resolved).toBe(true);
    expect(hapticSuccess).not.toHaveBeenCalled();
    expect(hapticWarning).not.toHaveBeenCalled();
    await act(async () => jest.runOnlyPendingTimers());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not let a pending map hint override a newer off choice in settings', async () => {
    let finish!: (value: Awaited<ReturnType<typeof Notifications.requestPermissionsAsync>>) => void;
    requestPermissionsMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const onEnable = jest.fn();
    function Controls() {
      const { settings, update } = useSettings();
      const notifications = useNotificationPermission();
      return (
        <>
          <NotificationHint top={68} onClose={jest.fn()} onEnable={() => {
            onEnable();
            update((prev) => ({ notifications: { ...prev.notifications, enabled: true } }));
          }} />
          <Text onPress={() => { void notifications.setEnabled(false, 'settings'); }}>Turn off</Text>
          <Text>{settings.notifications.enabled ? 'enabled' : 'disabled'}</Text>
        </>
      );
    }
    await render(<SettingsProvider><Controls /></SettingsProvider>);
    await act(async () => {});
    await fireEvent.press(screen.getByText('Slå på påminnelser'));
    await act(async () => {});
    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Turn off'));
    await act(async () => {
      finish({ granted: true, canAskAgain: true, status: PermissionStatus.GRANTED, expires: 'never' });
    });

    expect(screen.getByText('disabled')).toBeTruthy();
    expect(onEnable).not.toHaveBeenCalled();
    expect(hapticSuccess).not.toHaveBeenCalled();
    expect(hapticWarning).not.toHaveBeenCalled();
    const raw = await AsyncStorage.getItem('notificationHintSeen:v1');
    expect(raw && JSON.parse(raw).resolved).toBe(true);
  });
});
