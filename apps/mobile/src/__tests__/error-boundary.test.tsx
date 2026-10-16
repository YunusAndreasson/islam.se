// The app-wide crash boundary as expo-router sees it: app/_layout's `ErrorBoundary` export.
//
// Two ways it can go wrong, both silent in normal use. Drop Sentry's wrapper and a render crash
// shows the reader the fallback and reaches no one — the project goes quiet, which reads exactly
// like a healthy release. Put a capture back into ErrorScreen as well and every crash is
// reported twice. "Exactly once" fails on both.
import { describe, expect, it, jest } from '@jest/globals';
import * as Sentry from '@sentry/react-native';
import { render, screen } from '@testing-library/react-native';

import { ErrorBoundary } from '@/app/_layout';

describe('the app-wide error boundary', () => {
  it('reports what it catches exactly once, and shows the fallback', async () => {
    const error = new Error('boom');
    await render(<ErrorBoundary error={error} retry={jest.fn(() => Promise.resolve())} />);
    expect(screen.getByText('Något gick fel')).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
