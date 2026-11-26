// The trail as the app records it: one breadcrumb per screen change and per real move
// between foreground and background, each one already in the shape the allow-list keeps.
// A breadcrumb recorded in any other shape would be dropped by beforeBreadcrumb, and the
// reports would go back to carrying no trail at all without any test noticing.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Sentry from '@sentry/react-native';
import { act, render } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { allowBreadcrumb } from './sentry-breadcrumbs';
import { useSentryBreadcrumbs } from './useSentryBreadcrumbs';

// The route in view, as expo-router's segments. Typed routes make the real hook's return a
// union of the app's route tuples; the hook under test only joins them.
let mockSegments: string[] = [];
jest.mock('expo-router', () => ({ useSegments: () => mockSegments }));

function Probe() {
  useSentryBreadcrumbs();
  return null;
}

// The preset's AppState mock: currentState is settable, and addEventListener records the
// listeners, so `emit` calls every one registered so far.
const appState = AppState as unknown as { currentState: unknown };
const originalState = appState.currentState;

async function emit(state: 'active' | 'background' | 'inactive'): Promise<void> {
  appState.currentState = state;
  const listeners = jest
    .mocked(AppState)
    .addEventListener.mock.calls.filter(([type]) => type === 'change')
    .map(([, listener]) => listener);
  await act(async () => {
    for (const listener of listeners) listener(state);
  });
}

const recorded = () => jest.mocked(Sentry.addBreadcrumb).mock.calls.map(([crumb]) => crumb);

describe('useSentryBreadcrumbs', () => {
  beforeEach(() => {
    jest.mocked(Sentry.addBreadcrumb).mockClear();
    jest.mocked(AppState).addEventListener.mockClear();
    appState.currentState = 'active';
  });
  afterEach(() => {
    appState.currentState = originalState;
  });

  it('records each screen change, named by route file, from the screen before', async () => {
    mockSegments = ['bonetider'];
    const view = await render(<Probe />);
    mockSegments = ['(settings)', 'installningar'];
    await view.rerender(<Probe />);

    expect(recorded().map((c) => c.data)).toEqual([
      { to: 'bonetider' },
      { from: 'bonetider', to: '(settings)/installningar' },
    ]);
    // What is recorded is what the allow-list keeps, or the trail never reaches a report.
    for (const crumb of recorded()) expect(allowBreadcrumb(crumb)).toEqual(crumb);
  });

  it('records nothing before a route is in view', async () => {
    mockSegments = [];
    await render(<Probe />);
    expect(recorded()).toEqual([]);
  });

  it('records a trip to the background and back, and not iOS’s inactive', async () => {
    mockSegments = [];
    await render(<Probe />);
    await emit('inactive');
    await emit('active');
    await emit('background');
    await emit('active');

    expect(recorded().map((c) => [c.category, c.data])).toEqual([
      ['app.lifecycle', { state: 'background' }],
      ['app.lifecycle', { state: 'foreground' }],
    ]);
    for (const crumb of recorded()) expect(allowBreadcrumb(crumb)).toEqual(crumb);
  });
});
