import { afterEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { useLocation } from '@/lib/location/context';
import { SettingsProvider } from '@/lib/settings/context';
import { recoveryVisit } from '@/lib/analytics/return-setup';
import { widgetSnapshot } from '@/widget/placement';
import { storage } from '@/lib/storage';
import { ReminderRecovery } from './ReminderRecovery';

jest.mock('@/lib/location/context', () => ({ useLocation: jest.fn() }));
jest.mock('@/lib/analytics/return-setup', () => ({ recoveryVisit: jest.fn() }));
jest.mock('@/widget/placement', () => ({ widgetSnapshot: jest.fn() }));
const original = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
const now = Date.parse('2026-11-23T09:00:00Z');
afterEach(() => { Object.defineProperty(Platform, 'OS', original); jest.restoreAllMocks(); });

async function open(askable: boolean, present: boolean) {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  jest.mocked(useLocation).mockReturnValue({ source: 'manual', label: 'Malmö', coords: { latitude: 55.6, longitude: 13 } } as ReturnType<typeof useLocation>);
  jest.mocked(recoveryVisit).mockResolvedValue({ started: now, verified: false });
  jest.mocked(widgetSnapshot).mockResolvedValue({ present, receipts: [] });
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ status: 'denied', canAskAgain: askable, granted: false } as Notifications.NotificationPermissionsStatus);
  await storage.removeItem('remindersRecoveryShown:v1');
  await storage.setItem('remindersDeclined:v1', String(now - 2 * 86400_000));
  return render(<SettingsProvider><ReminderRecovery blocked now={now} /></SettingsProvider>);
}
it('opens the existing five-prayer preview on an eligible Android tap, before spending another OS prompt', async () => {
  await open(true, false);
  await fireEvent.press(screen.getByText('Välj påminnelser'));
  expect(screen.getAllByRole('switch')).toHaveLength(5);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
it('leaves an explicit settings link for a permanent refusal and suppresses recovery after widget placement', async () => {
  await open(false, true);
  expect(screen.getByText('Öppna appinställningar')).toBeTruthy();
  expect(screen.queryByText('Påminnelser vid bönetiderna')).toBeNull();
  expect(await storage.getItem('remindersRecoveryShown:v1')).toBeNull();
});
