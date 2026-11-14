import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { hapticSuccess } from '@/lib/haptics';
import { type NotificationPermissionState } from '@/lib/notifications';
import { useNotificationPermission } from '@/lib/notifications-permission';
import { SettingsProvider } from '@/lib/settings/context';
import { StepNotifications } from './StepNotifications';

jest.mock('@/lib/notifications-permission', () => ({ useNotificationPermission: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ hapticSuccess: jest.fn(), setHapticsEnabled: jest.fn() }));

describe('introduction notification answer', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('retires the offer after leaving without a stale success haptic', async () => {
    let finish!: (state: NotificationPermissionState) => void;
    const answer = new Promise<NotificationPermissionState>((resolve) => { finish = resolve; });
    const setEnabled = jest.fn<() => Promise<NotificationPermissionState>>().mockReturnValue(answer);
    jest.mocked(useNotificationPermission).mockReturnValue({
      permission: 'unknown', blocked: false, footnote: undefined, setEnabled,
    });
    await render(<SettingsProvider><StepNotifications /></SettingsProvider>);
    await act(async () => {});
    await fireEvent.press(screen.getByText('Slå på påminnelser'));
    await screen.unmount();
    await act(async () => { finish('granted'); });

    const raw = await AsyncStorage.getItem('notificationHintSeen:v1');
    expect(raw && JSON.parse(raw).resolved).toBe(true);
    expect(hapticSuccess).not.toHaveBeenCalled();
  });

  it('keeps a superseded enable unanswered and permits a fresh gesture', async () => {
    const setEnabled = jest.fn<() => Promise<NotificationPermissionState | null>>().mockResolvedValue(null);
    jest.mocked(useNotificationPermission).mockReturnValue({
      permission: 'unknown', blocked: false, footnote: undefined, setEnabled,
    });
    await render(<SettingsProvider><StepNotifications /></SettingsProvider>);
    await act(async () => {});
    await fireEvent.press(screen.getByText('Slå på påminnelser'));
    await act(async () => {});
    expect(screen.getByText('Slå på påminnelser')).toBeTruthy();
    await fireEvent.press(screen.getByText('Slå på påminnelser'));
    await act(async () => {});
    expect(setEnabled).toHaveBeenCalledTimes(2);
    expect(hapticSuccess).not.toHaveBeenCalled();
  });
});
