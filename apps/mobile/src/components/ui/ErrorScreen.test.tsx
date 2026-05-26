import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ErrorScreen } from './ErrorScreen';

// The app-wide crash boundary (wired in app/_layout.tsx via `export { ... as
// ErrorBoundary }`). It cannot be exercised by driving the running app on this
// host, so these smoke tests lock in the contract expo-router relies on: the
// fallback renders a recovery affordance and `retry` is invoked on press.
describe('ErrorScreen (crash boundary fallback)', () => {
  it('shows a calm Swedish message and a retry control', () => {
    render(<ErrorScreen error={new Error('boom')} retry={jest.fn() as () => Promise<void>} />);
    expect(screen.getByText('Något gick fel')).toBeTruthy();
    expect(screen.getByText('Försök igen')).toBeTruthy();
  });

  it('calls retry when the user taps "Försök igen"', () => {
    const retry = jest.fn(() => Promise.resolve());
    render(<ErrorScreen error={new Error('boom')} retry={retry} />);
    fireEvent.press(screen.getByText('Försök igen'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
