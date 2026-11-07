import { describe, expect, it, jest } from '@jest/globals';
import * as Sentry from '@sentry/react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';

import { ErrorScreen } from './ErrorScreen';

// The app-wide crash boundary (wired in app/_layout.tsx via `export { ... as
// ErrorBoundary }`). It cannot be exercised by driving the running app on this
// host, so these smoke tests lock in the contract expo-router relies on: the
// fallback renders a recovery affordance and `retry` is invoked on press.
describe('ErrorScreen (crash boundary fallback)', () => {
  it('shows a calm Swedish message and a retry control', async () => {
    await render(<ErrorScreen error={new Error('boom')} retry={jest.fn() as () => Promise<void>} />);
    expect(screen.getByText('Något gick fel')).toBeTruthy();
    expect(screen.getByText('Försök igen')).toBeTruthy();
  });

  it('calls retry when the user taps "Försök igen"', async () => {
    const retry = jest.fn(() => Promise.resolve());
    await render(<ErrorScreen error={new Error('boom')} retry={retry} />);
    await fireEvent.press(screen.getByText('Försök igen'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  // REGRESSION GUARD: this screen used to call captureException itself. Since the boundary
  // is Sentry's wrapper around it (app/_layout), a report from here too would send every
  // render crash twice. src/__tests__/error-boundary.test.tsx pins the "exactly once".
  it('does not report on its own', async () => {
    await render(<ErrorScreen error={new Error('boom')} retry={jest.fn() as () => Promise<void>} />);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  // REGRESSION GUARD: a throw on the first render replaces the root layout before SplashGate
  // hides the splash, and unmounting the gate clears its two-second safety net. Nothing else
  // hid it, so the reader saw the splash forever and never this screen.
  it('hides the splash, which would otherwise cover it for good', async () => {
    jest.mocked(SplashScreen.hide).mockClear();
    await render(<ErrorScreen error={new Error('boom')} retry={jest.fn() as () => Promise<void>} />);
    expect(SplashScreen.hide).toHaveBeenCalled();
  });
});
