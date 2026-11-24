import { expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Pressable, Text } from 'react-native';

import { readReminderDraft, reminderPlace, saveReminderDraft } from './first-run';
import { useNotificationPermission } from './notifications-permission';
import { SettingsProvider, useSettings } from './settings/context';
import { DEFAULT_SETTINGS } from './settings/types';
import { storage } from './storage';

const city = { name: 'Malmö', latitude: 55.60587, longitude: 13.00073 };
const prefs = { ...DEFAULT_SETTINGS, locationMode: 'manual' as const, manualLocation: city };
const mask = { fajr: true, dhuhr: false, asr: false, maghrib: false, isha: false };
const settingsKey = 'prayerSettings:v1';
const draft = 'firstReadingDraft:v1';

function Switch() {
  const { settings, settingsReady } = useSettings();
  const { setEnabled } = useNotificationPermission();
  return <Pressable disabled={!settingsReady} onPress={() => void setEnabled(false, 'settings')}>
    <Text>{settings.notifications.enabled ? 'on' : 'off'}</Text>
  </Pressable>;
}

// A failed draft deletion must never reverse a later, durable reader opt-out.
it.each([false, true])('honours a saved disable after failed draft deletion (earlier opt-out %s)', async earlierOptOut => {
  if (earlierOptOut) await storage.setItem('remindersDeliberatelyDisabled:v1', '1');
  else await storage.removeItem('remindersDeliberatelyDisabled:v1');
  await storage.setItem(settingsKey, JSON.stringify(prefs));
  await storage.setItem('introSeen:v1', JSON.stringify({ completed: true }));
  await saveReminderDraft(reminderPlace(prefs, city), mask);
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true,
    ios: { status: 2 } } as Notifications.NotificationPermissionsStatus);
  const remove = storage.removeItem;
  const fail = jest.spyOn(storage, 'removeItem').mockImplementation(key =>
    key === draft ? Promise.reject(new Error('busy')) : remove(key));
  try {
    const mounted = await render(<SettingsProvider><Switch /></SettingsProvider>);
    await fireEvent.press(screen.getByText('on'));
    expect(await storage.getItem('remindersDeliberatelyDisabled:v1')).toBe('1');
    expect(JSON.parse((await storage.getItem(settingsKey))!).notifications.enabled).toBe(false);
    expect(await storage.getItem(draft)).toBeTruthy();
    await mounted.unmount();
  } finally { fail.mockRestore(); }
  await render(<SettingsProvider><Switch /></SettingsProvider>);
  expect(screen.getByText('off')).toBeTruthy();

  const current = JSON.parse((await storage.getItem(settingsKey))!);
  const place = reminderPlace(current, city);
  expect(await readReminderDraft(place)).toBeNull();
  await saveReminderDraft(place, mask);
  expect(await readReminderDraft(place)).toEqual(mask);
});
