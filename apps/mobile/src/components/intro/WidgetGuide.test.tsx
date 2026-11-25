import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import { analytics } from '@/lib/analytics';
import { LocationProvider } from '@/lib/location/context';
import { SettingsProvider } from '@/lib/settings/context';
import { observeWidgetPin, requestWidgetPin, supportsWidgetPin } from '@/widget/placement';
import { WidgetGuide } from './WidgetGuide';

jest.mock('@/widget/placement', () => ({
  supportsWidgetPin: jest.fn(), requestWidgetPin: jest.fn(), observeWidgetPin: jest.fn(),
}));
const original = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
const close = jest.fn();
const now = Date.parse('2026-11-23T10:00:00+01:00');
async function show(at = now) {
  await render(<SettingsProvider><LocationProvider>
    <WidgetGuide now={at} onClose={close} occasion="first_session" />
  </LocationProvider></SettingsProvider>);
}
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
});
afterEach(() => { Object.defineProperty(Platform, 'OS', original); });

it('offers manual placement when the launcher cannot pin', async () => {
  jest.mocked(supportsWidgetPin).mockResolvedValue(false);
  await show();
  expect(screen.getByText(/dra den till startskärmen/)).toBeTruthy();
  expect(requestWidgetPin).not.toHaveBeenCalled();
});
it('keeps the manual instructions available when a supported launcher rejects the request', async () => {
  jest.mocked(supportsWidgetPin).mockResolvedValue(true);
  jest.mocked(requestWidgetPin).mockResolvedValue('failed');
  await show();
  await fireEvent.press(screen.getByText('Lägg till widget'));
  expect(screen.getByText(/dra den till startskärmen/)).toBeTruthy();
  expect(close).not.toHaveBeenCalled();
});
// A launcher accepting the request starts a confirmation dialog. Only a bound
// provider or configuration may emit the placement event.
it('keeps the guide open after a launcher request, then closes on verified placement', async () => {
  const track = jest.spyOn(analytics, 'track');
  let placed: (() => void) | undefined;
  jest.mocked(observeWidgetPin).mockImplementation(listener => {
    placed = listener;
    return { remove: jest.fn() };
  });
  jest.mocked(supportsWidgetPin).mockResolvedValue(true);
  jest.mocked(requestWidgetPin).mockResolvedValue('accepted');
  await show();
  await fireEvent.press(screen.getByText('Lägg till widget'));
  expect(close).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Lägg till widget'));
  expect(requestWidgetPin).toHaveBeenCalledTimes(2);
  expect(track).toHaveBeenCalledWith('Widget Setup Requested', { route: 'android_pin', launcher_result: 'accepted' });
  expect(track.mock.calls.some(([name]) => name === 'Prayer Widget Added')).toBe(false);
  await act(() => { placed?.(); });
  expect(close).toHaveBeenCalledTimes(1);
  track.mockRestore();
});

// The deprecated ImageBackground wrapper made this guide fail the mobile API gate.
it('keeps the decorative photo separate from the spoken prayer preview', async () => {
  jest.mocked(supportsWidgetPin).mockResolvedValue(false);
  await show();
  expect(screen.getByTestId('widget-preview-photo', { includeHiddenElements: true }).props.accessible).toBe(false);
  expect(screen.getByLabelText(/Bönetider för/)).toBeTruthy();
});

// On Android, percentage sizes inside the padded preview stopped at the content
// edges. The image must resolve all four edges against the rounded frame itself.
it('fills the rounded photo frame independently of the card padding', async () => {
  jest.mocked(supportsWidgetPin).mockResolvedValue(false);
  await show();
  const image = screen.getByTestId('widget-preview-photo', { includeHiddenElements: true });
  expect(image.props.resizeMode).toBe('cover');
  expect(StyleSheet.flatten(image.props.style)).toMatchObject({
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: 'auto', height: 'auto',
  });
  const frame = StyleSheet.flatten(image.parent!.props.style);
  expect(frame.overflow).toBe('hidden');
  expect(frame.borderRadius).toBeGreaterThan(0);
  expect(frame.padding ?? 0).toBe(0);
});

// After Isha the hero and the list used different Fajr times without naming either day.
it('identifies tomorrow’s next prayer beside today’s timetable after Isha', async () => {
  await show(Date.parse('2026-11-23T23:00:00+01:00'));
  expect(screen.getByText('Nästa bön i morgon', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText('I dag', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByLabelText(/nästa bön i morgon Fajr.*Bönetider för i dag/i)).toBeTruthy();
});
