import { describe, expect, it } from '@jest/globals';
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

import {
  allowBreadcrumb,
  createLifecycleBreadcrumbs,
  keepAllowedBreadcrumbs,
  screenBreadcrumb,
} from './sentry-breadcrumbs';

// What the SDKs record on this app when nothing stops them, as they record it. Each one is
// a way for the reader's position (or a URL naming it) to reach a crash report.
const LEAKS: Record<string, Breadcrumb> = {
  // projection-guard's warning, filed by the console instrumentation: the camera to ~10 m.
  console: {
    category: 'console',
    level: 'warning',
    message: 'projection-guard: camera outside the projection at 59.3293,18.0686',
    data: { arguments: ['projection-guard', 59.3293, 18.0686], logger: 'console' },
  },
  // The native iOS SDK's network breadcrumb for a MapLibre tile: z/x/y names the tile on screen.
  http: {
    type: 'http',
    category: 'http',
    data: { url: 'https://api.maptiler.com/tiles/v3/12/2251/1185.pbf', method: 'GET', status_code: 200 },
  },
  xhr: { type: 'http', category: 'xhr', data: { url: 'https://islam.se/api/moske', method: 'POST' } },
  fetch: { type: 'http', category: 'fetch', data: { url: 'https://tiles.openfreemap.org/planet/12/2251/1185' } },
  // Android's user-interaction breadcrumb on a native view.
  touch: { type: 'user', category: 'ui.click', data: { 'view.id': 'maplibre_compass', 'view.class': 'ImageView' } },
  touchJs: { type: 'user', category: 'touch', message: 'Touch event within element: MapView' },
  sentryEvent: { category: 'sentry.event', message: 'Error: fix at 59.3293, 18.0686' },
  expoUpdates: { category: 'expo.updates', message: 'Update downloaded', data: { updateId: 'abc' } },
  errorBoundary: { category: 'expo-router.error_boundary', type: 'error', data: { 'route.name': 'bonetider' } },
  dispatch: { category: 'navigation.dispatch', type: 'navigation', data: { to: 'bonetider' } },
  activity: { category: 'ui.lifecycle', type: 'navigation', data: { state: 'resumed', screen: 'MainActivity' } },
  networkEvent: { category: 'network.event', type: 'system', data: { action: 'NETWORK_AVAILABLE' } },
  systemEvent: { category: 'device.event', type: 'system', data: { action: 'BATTERY_CHANGED', level: 54 } },
  uncategorised: { message: 'something' },
};

describe('allowBreadcrumb — the only breadcrumbs a report may carry', () => {
  it.each(Object.entries(LEAKS))('drops %s', (_, crumb) => {
    // Anything off the list is gone, whatever it carries: the list names what may pass,
    // so a new SDK source is dropped without anyone having to know it exists.
    expect(allowBreadcrumb(crumb)).toBeNull();
  });

  it('keeps a screen change, rebuilt from the route names alone', () => {
    const kept = allowBreadcrumb({
      type: 'navigation',
      category: 'navigation',
      message: 'Navigation to bonetider?lat=59.3293&lon=18.0686',
      timestamp: 1_700_000_000,
      data: {
        from: '(settings)/installningar',
        to: 'bonetider',
        params: { latitude: 59.3293, longitude: 18.0686 },
        url: 'islamse://bonetider?lat=59.3293',
      },
    });
    // A producer that adds params, a URL or a message to a navigation breadcrumb loses them:
    // only from/to survive, and the message is rebuilt from `to`.
    expect(kept).toEqual({
      type: 'navigation',
      category: 'navigation',
      level: 'info',
      message: 'bonetider',
      timestamp: 1_700_000_000,
      data: { from: '(settings)/installningar', to: 'bonetider' },
    });
  });

  it('keeps the first screen of a launch, which has nothing to come from', () => {
    expect(allowBreadcrumb(screenBreadcrumb(null, 'valkommen'))).toEqual(screenBreadcrumb(null, 'valkommen'));
  });

  it.each([
    ['a coordinate', 'bonetider/59.3293,18.0686'],
    ['a query string', 'bonetider?calendar=open'],
    ['a dynamic value', 'moske/1234'],
    ['a full URL', 'https://islam.se/bonetider'],
    ['nothing', ''],
  ])('drops a screen change whose route holds %s', (_, route) => {
    // A route NAME is file segments and never holds a digit; one that does is a value that
    // got into the name, and the breadcrumb is dropped rather than cleaned.
    expect(allowBreadcrumb(screenBreadcrumb(null, route))).toBeNull();
    expect(allowBreadcrumb(screenBreadcrumb(route, 'bonetider'))).toBeNull();
  });

  it('drops a navigation breadcrumb with no destination', () => {
    expect(allowBreadcrumb({ category: 'navigation', data: { from: 'bonetider' } })).toBeNull();
    expect(allowBreadcrumb({ category: 'navigation' })).toBeNull();
  });

  it('keeps foreground and background, and nothing else the lifecycle category might carry', () => {
    for (const state of ['foreground', 'background'] as const) {
      expect(allowBreadcrumb({ category: 'app.lifecycle', data: { state, screen: 'MainActivity' } })).toEqual({
        type: 'navigation',
        category: 'app.lifecycle',
        level: 'info',
        message: state,
        data: { state },
      });
    }
    expect(allowBreadcrumb({ category: 'app.lifecycle', data: { state: 'resumed' } })).toBeNull();
    expect(allowBreadcrumb({ category: 'app.lifecycle' })).toBeNull();
  });
});

describe('keepAllowedBreadcrumbs — the same list over a finished report', () => {
  it('strips what the native SDKs merged into a JS report, and keeps the order of the rest', () => {
    // The SDK merges native breadcrumbs into a JS event after beforeBreadcrumb has run, so
    // an Android touch on a native view reaches the event unless beforeSend removes it.
    const event: ErrorEvent = {
      type: undefined,
      breadcrumbs: [
        { ...screenBreadcrumb(null, 'bonetider'), timestamp: 1 },
        { ...LEAKS.touch, timestamp: 2 },
        { category: 'app.lifecycle', type: 'navigation', data: { state: 'background' }, timestamp: 3 },
        { ...LEAKS.http, timestamp: 4 },
        { ...screenBreadcrumb('bonetider', 'qibla'), timestamp: 5 },
      ],
    };
    const kept = keepAllowedBreadcrumbs(event).breadcrumbs ?? [];
    expect(kept.map((c) => [c.category, c.timestamp])).toEqual([
      ['navigation', 1],
      ['app.lifecycle', 3],
      ['navigation', 5],
    ]);
  });

  it('leaves a report without breadcrumbs as it is', () => {
    const event: ErrorEvent = { type: undefined, message: 'boom' };
    expect(keepAllowedBreadcrumbs(event)).toBe(event);
  });
});

describe('createLifecycleBreadcrumbs — one breadcrumb per real move', () => {
  it('records a trip to the background and the return, once each', () => {
    const next = createLifecycleBreadcrumbs('active');
    expect(next('active')).toBeNull();
    expect(next('background')?.data).toEqual({ state: 'background' });
    expect(next('background')).toBeNull();
    expect(next('active')?.data).toEqual({ state: 'foreground' });
  });

  it("ignores iOS's 'inactive': Control Centre over the app is not a departure", () => {
    const next = createLifecycleBreadcrumbs('active');
    expect(next('inactive')).toBeNull();
    // Back from 'inactive' the app never left, so there is nothing to record.
    expect(next('active')).toBeNull();
  });

  it('records the open of an iOS background launch as a move to the foreground', () => {
    const next = createLifecycleBreadcrumbs('background');
    expect(next('active')?.data).toEqual({ state: 'foreground' });
  });

  it('records the first known state when the app started in an unknown one', () => {
    const next = createLifecycleBreadcrumbs('unknown');
    expect(next('background')?.data).toEqual({ state: 'background' });
  });
});
