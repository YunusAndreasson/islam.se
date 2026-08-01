import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PermissionStatus } from 'expo-modules-core';
import * as Notifications from 'expo-notifications';

import { NotificationHint } from './NotificationHint';

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

function renderHint(overrides: Partial<Parameters<typeof NotificationHint>[0]> = {}) {
  const props = { top: 68, onEnable: jest.fn(), onClose: jest.fn(), ...overrides };
  render(<NotificationHint {...props} />);
  return props;
}

// The map's soft ask for notification permission. Its entire reason to exist is that iOS
// grants ONE notification prompt per install: the card explains the offer so the prompt is
// only ever spent on a user who has already said yes to the idea.
describe('NotificationHint', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    getPermissionsMock.mockResolvedValue(undetermined());
  });

  it('offers reminders in plain Swedish with one clear action', () => {
    renderHint();
    expect(screen.getByText('Påminn om bönetider')).toBeTruthy();
    expect(screen.getByText('Slå på påminnelser')).toBeTruthy();
  });

  // THE regression this file exists to prevent. If dismissing ever reached the OS, a user
  // brushing the card away would silently spend the one prompt they will ever get, and
  // prayer reminders would be locked behind the system Settings app forever.
  it('does not touch the OS prompt when dismissed', async () => {
    const { onClose, onEnable } = renderHint();

    fireEvent.press(screen.getByLabelText('Stäng'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(requestPermissionsMock).not.toHaveBeenCalled();
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('asks the OS once and turns reminders on when the user accepts', async () => {
    requestPermissionsMock.mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: PermissionStatus.GRANTED,
      expires: 'never',
    });
    const { onEnable } = renderHint();

    await act(async () => {
      fireEvent.press(screen.getByText('Slå på påminnelser'));
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
    const { onEnable, onClose } = renderHint();

    await act(async () => {
      fireEvent.press(screen.getByText('Slå på påminnelser'));
    });

    await waitFor(() => expect(screen.getByText(/Notiser är blockerade/)).toBeTruthy());
    // Still enabled in settings: that is what makes Inställningar show its "Blockerat"
    // status and its own recovery link, and it means a user who later allows notifications
    // in system settings starts receiving them without hunting for the toggle again.
    expect(onEnable).toHaveBeenCalledTimes(1);
    // The card does NOT retire itself on a refusal — the user closes it when ready.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('marks the hint resolved so it is never offered again', async () => {
    requestPermissionsMock.mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: PermissionStatus.GRANTED,
      expires: 'never',
    });
    renderHint();

    await act(async () => {
      fireEvent.press(screen.getByText('Slå på påminnelser'));
    });

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem('notificationHintSeen:v1');
      expect(raw && JSON.parse(raw).resolved).toBe(true);
    });
  });

  // Double-tapping the CTA must not put two OS dialogs in flight.
  it('ignores a second tap while the prompt is in flight', async () => {
    requestPermissionsMock.mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: PermissionStatus.GRANTED,
      expires: 'never',
    });
    renderHint();

    const cta = screen.getByText('Slå på påminnelser');
    await act(async () => {
      fireEvent.press(cta);
      fireEvent.press(cta);
    });

    expect(requestPermissionsMock).toHaveBeenCalledTimes(1);
  });
});
