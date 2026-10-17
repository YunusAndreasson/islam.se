import { afterEach, describe, expect, it } from '@jest/globals';
import * as Sentry from '@sentry/react-native';

import { sentryOptions } from './sentry';

const DSN = 'https://public@o0.ingest.sentry.io/0';

// The privacy promises of the store listing and islam.se/integritetspolicy, as options. Each
// assertion fails on the edit that would quietly break one of them. Turning on "a bit more
// context" is the natural move for anyone chasing a crash, and every switch below is a way
// for the reader's position to leave the phone.
describe('sentryOptions — what a crash report may carry', () => {
  const options = sentryOptions(DSN);

  it('attaches no personal data, no breadcrumbs, no screenshot and no view hierarchy', () => {
    // Unset, the two personal-data options resolve to Sentry's no-PII mapping. sendDefaultPii is
    // deprecated, and any dataCollection object starts from collect-everything defaults
    // (userInfo, cookies, headers, bodies), so adding one "to be explicit" turns PII on.
    expect(options).not.toHaveProperty('sendDefaultPii');
    expect(options).not.toHaveProperty('dataCollection');
    expect(options).toMatchObject({
      // Breadcrumbs carried the map camera's lat/lon (projection-guard's console.warn) and the
      // tile URLs MapLibre fetched. Zero also reaches the native SDKs, so native crashes are
      // covered — a JS-side beforeBreadcrumb filter would not be.
      maxBreadcrumbs: 0,
      // The screen is a map centred on the reader.
      attachScreenshot: false,
      attachViewHierarchy: false,
    });
  });

  it('sends nothing on an ordinary launch: no sessions, client reports, tracing, profiling or replay', () => {
    expect(options).toMatchObject({ enableAutoSessionTracking: false, sendClientReports: false });
    for (const key of [
      'tracesSampleRate',
      'tracesSampler',
      'profilesSampleRate',
      'replaysSessionSampleRate',
      'replaysOnErrorSampleRate',
    ]) {
      expect(options).not.toHaveProperty(key);
    }
  });

  // maxBreadcrumbs: 0 drops what the native SDKs record; these stop them recording it at all,
  // so the promise does not hang on one number. Network breadcrumbs carry MapLibre's tile
  // URLs, which name the tiles on the reader's screen.
  it('switches every native breadcrumb source off at the source, and keeps memory out of crashes', () => {
    expect(options).toMatchObject({
      enableNetworkBreadcrumbs: false,
      enableAutoBreadcrumbTracking: false,
      enableNetworkEventBreadcrumbs: false,
      enableActivityLifecycleBreadcrumbs: false,
      enableAppLifecycleBreadcrumbs: false,
      enableSystemEventBreadcrumbs: false,
      enableAppComponentBreadcrumbs: false,
      // Strings near a native crash site — on this app, possibly coordinates.
      enableMemoryIntrospection: false,
    });
  });

  it('drops the TurboModule instrumentation and adds nothing in its place', () => {
    const integrations = options.integrations;
    if (typeof integrations !== 'function') {
      throw new Error('integrations must stay a filter over the defaults, never a fixed list');
    }
    const dedupe = { name: 'Dedupe' };
    const expoContext = { name: 'ExpoContext' };
    const kept = integrations([dedupe, Sentry.turboModuleContextIntegration(), expoContext]);
    // Its periodic "TurboModule aggregate" info event is a report on a healthy launch, and
    // anything the filter added would be a new path for data to leave the phone.
    expect(kept).toEqual([dedupe, expoContext]);
  });

  describe('enabled', () => {
    const globals = globalThis as unknown as { __DEV__: boolean };
    const wasDev = globals.__DEV__;
    afterEach(() => {
      globals.__DEV__ = wasDev;
    });

    it('reports from a release build that has a DSN', () => {
      globals.__DEV__ = false;
      expect(sentryOptions(DSN).enabled).toBe(true);
    });

    // app.json ships with an empty DSN until one is pasted in; that build must not try to
    // report (the release preflight refuses to build it at all).
    it('stays off without a DSN, even in a release build', () => {
      globals.__DEV__ = false;
      expect(sentryOptions(undefined).enabled).toBe(false);
    });

    it('stays off in development', () => {
      globals.__DEV__ = true;
      expect(sentryOptions(DSN).enabled).toBe(false);
    });
  });
});
