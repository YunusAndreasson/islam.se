import { afterEach, describe, expect, it } from '@jest/globals';

import { sentryOptions } from './sentry';

const DSN = 'https://public@o0.ingest.sentry.io/0';

// The privacy promises of the store listing and islam.se/integritetspolicy, as options. Each
// assertion fails on the edit that would quietly break one of them. Turning on "a bit more
// context" is the natural move for anyone chasing a crash, and every switch below is a way
// for the reader's position to leave the phone.
describe('sentryOptions — what a crash report may carry', () => {
  const options = sentryOptions(DSN);

  it('attaches no personal data, no breadcrumbs, no screenshot and no view hierarchy', () => {
    expect(options).toMatchObject({
      sendDefaultPii: false,
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
      'integrations',
    ]) {
      expect(options).not.toHaveProperty(key);
    }
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
