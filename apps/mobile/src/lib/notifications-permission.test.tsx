import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { hapticWarning } from '@/lib/haptics';
import { getNotificationPermissionState, requestNotificationPermission, type NotificationPermissionState } from '@/lib/notifications';
import { SettingsProvider, useSettings } from '@/lib/settings/context';
import { useNotificationPermission, type NotificationPermissionControl } from './notifications-permission';

jest.mock('@/lib/notifications', () => ({
  getNotificationPermissionState: jest.fn(),
  requestNotificationPermission: jest.fn(),
}));
jest.mock('@/lib/haptics', () => ({ hapticWarning: jest.fn(), setHapticsEnabled: jest.fn() }));

function deferredAnswer() {
  let resolve!: (state: NotificationPermissionState) => void;
  const promise = new Promise<NotificationPermissionState>((finish) => { resolve = finish; });
  return { promise, resolve };
}

async function mountControl() {
  let control!: NotificationPermissionControl;
  function Control() {
    control = useNotificationPermission();
    return <Text>{control.permission}</Text>;
  }
  function Preferences() {
    const { settings } = useSettings();
    return <Text>{settings.notifications.enabled ? 'enabled' : 'disabled'}</Text>;
  }
  function Host({ show = true }: { show?: boolean }) {
    return (
      <SettingsProvider>
        {show ? <Control /> : null}
        <Preferences />
      </SettingsProvider>
    );
  }
  const view = await render(<Host />);
  await act(async () => {});
  return {
    current: () => control,
    leave: () => view.rerender(<Host show={false} />),
    enter: () => view.rerender(<Host />),
  };
}

describe('notification permission intent', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    jest.mocked(getNotificationPermissionState).mockResolvedValue('granted');
  });

  it.each(['granted', 'denied', 'undetermined'] as const)(
    'keeps a newer off choice when an older enable answers %s', async (answer) => {
      const pending = deferredAnswer();
      jest.mocked(requestNotificationPermission).mockReturnValueOnce(pending.promise);
      const hook = await mountControl();
      let enabling!: Promise<NotificationPermissionState | null>;
      await act(() => { enabling = hook.current().setEnabled(true); });
      await act(async () => { await hook.current().setEnabled(false); });
      await act(async () => { pending.resolve(answer); await enabling; });

      expect(await enabling).toBeNull();
      expect(screen.getByText('disabled')).toBeTruthy();
      expect(hook.current().permission).toBe('unknown');
      expect(hapticWarning).not.toHaveBeenCalled();
    },
  );

  it('does not let an older refusal replace the newest successful enable', async () => {
    const older = deferredAnswer();
    const newer = deferredAnswer();
    jest.mocked(requestNotificationPermission)
      .mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const hook = await mountControl();
    let first!: Promise<NotificationPermissionState | null>;
    let second!: Promise<NotificationPermissionState | null>;
    await act(() => { first = hook.current().setEnabled(true); });
    await act(async () => { await hook.current().setEnabled(false); });
    await act(() => { second = hook.current().setEnabled(true); });
    await act(async () => { newer.resolve('granted'); await second; });
    await act(async () => { older.resolve('denied'); await first; });

    expect(await first).toBeNull();
    expect(await second).toBe('granted');
    expect(screen.getByText('enabled')).toBeTruthy();
    expect(hook.current().permission).toBe('granted');
    expect(hapticWarning).not.toHaveBeenCalled();
  });

  it('keeps a newer off choice made by a replacement screen', async () => {
    const pending = deferredAnswer();
    jest.mocked(requestNotificationPermission).mockReturnValueOnce(pending.promise);
    const hook = await mountControl();
    let enabling!: Promise<NotificationPermissionState | null>;
    await act(() => { enabling = hook.current().setEnabled(true); });
    await hook.leave();
    await hook.enter();
    await act(async () => { await hook.current().setEnabled(false); });
    await act(async () => { pending.resolve('granted'); await enabling; });

    expect(await enabling).toBeNull();
    expect(screen.getByText('disabled')).toBeTruthy();
    expect(hapticWarning).not.toHaveBeenCalled();
  });

  it('keeps the requested preference after leaving without stale warning feedback', async () => {
    const pending = deferredAnswer();
    jest.mocked(requestNotificationPermission).mockReturnValueOnce(pending.promise);
    const hook = await mountControl();
    let enabling!: Promise<NotificationPermissionState | null>;
    await act(() => { enabling = hook.current().setEnabled(true); });
    await hook.leave();
    await act(async () => { pending.resolve('denied'); await enabling; });

    // The provider survives the screen, so the reader's enable intent is preserved.
    expect(screen.getByText('enabled')).toBeTruthy();
    const raw = await AsyncStorage.getItem('prayerSettings:v1');
    expect(raw && JSON.parse(raw).notifications.enabled).toBe(true);
    expect(hapticWarning).not.toHaveBeenCalled();
  });

  it('still warns about a current refusal and offers blocked-permission recovery', async () => {
    jest.mocked(requestNotificationPermission).mockResolvedValueOnce('denied');
    jest.mocked(getNotificationPermissionState).mockResolvedValue('denied');
    const hook = await mountControl();
    await act(async () => { await hook.current().setEnabled(true); });
    expect(screen.getByText('enabled')).toBeTruthy();
    expect(hook.current().blocked).toBe(true);
    expect(hapticWarning).toHaveBeenCalledTimes(1);
  });
});
