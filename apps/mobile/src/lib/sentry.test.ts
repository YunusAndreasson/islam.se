import { afterEach, describe, expect, it } from '@jest/globals';
import * as Sentry from '@sentry/react-native';

import { sentryOptions } from './sentry';

const DSN = 'https://public@o0.ingest.sentry.io/0';

// The privacy promises of the store listing and islam.se/integritetspolicy, as options. Each
// assertion fails on the edit that would quietly break one of them. Turning on "a bit more
// context" is the natural move for anyone chasing a crash: the context this app allows is
// the screens visited and the trips to the background, and every other switch below is a
// way for the reader's position to leave the phone.
describe('sentryOptions — what a crash report may carry', () => {
  const options = sentryOptions(DSN);

  it('attaches no personal data, no screenshot and no view hierarchy', () => {
    // Unset, the two personal-data options resolve to Sentry's no-PII mapping. sendDefaultPii is
    // deprecated, and any dataCollection object starts from collect-everything defaults
    // (userInfo, cookies, headers, bodies), so adding one "to be explicit" turns PII on.
    expect(options).not.toHaveProperty('sendDefaultPii');
    expect(options).not.toHaveProperty('dataCollection');
    expect(options).toMatchObject({
      // The screen is a map centred on the reader.
      attachScreenshot: false,
      attachViewHierarchy: false,
    });
  });

  it('sends a session per launch for the crash-free rate, and nothing else on a healthy one', () => {
    // Sessions are release health: without them Sentry has the reports that made it out but
    // no crash-free rate per release, so a bad build or OTA is only visible by its crashes.
    // Client reports are the SDK's own drop counts, sent on healthy launches, read by no one.
    expect(options).toMatchObject({ enableAutoSessionTracking: true, sendClientReports: false });
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

  it('keeps native crash reporting on', () => {
    // Native crashes are the reports JS can never catch. Both are on by default; this fails
    // on the edit that switches either off to quieten the project.
    expect(options.enableNative).not.toBe(false);
    expect(options.enableNativeCrashHandling).not.toBe(false);
  });

  // The native SDKs record their own breadcrumbs, which neither beforeBreadcrumb nor
  // maxBreadcrumbs can shape: a native crash carries them as they were recorded. Every native
  // source is therefore off at the source; the screen and lifecycle trail is recorded in JS
  // and copied to the native scope. Network breadcrumbs carry MapLibre's tile URLs, which
  // name the tiles on the reader's screen; iOS's auto-breadcrumb switch covers touches and
  // system events along with lifecycle.
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

  describe('breadcrumbs: screen changes and foreground/background, nothing else', () => {
    const navigation = {
      type: 'navigation',
      category: 'navigation',
      level: 'info' as const,
      message: 'qibla',
      timestamp: 1,
      data: { from: 'bonetider', to: 'qibla' },
    };
    const background = {
      type: 'navigation',
      category: 'app.lifecycle',
      level: 'info' as const,
      message: 'background',
      timestamp: 2,
      data: { state: 'background' },
    };
    // projection-guard's console.warn (the map camera to ~10 m) and a MapLibre tile request:
    // the two breadcrumbs that made the app send none at all before this list existed.
    const cameraWarning = { category: 'console', level: 'warning' as const, message: 'camera at 59.3293,18.0686' };
    const tileRequest = { type: 'http', category: 'http', data: { url: 'https://api.maptiler.com/tiles/v3/12/2251/1185.pbf' } };

    it('records a bounded trail, on both native SDKs too', () => {
      // maxBreadcrumbs is handed to the native SDKs as well; 0 would switch the trail off
      // everywhere, which is what the app did before.
      expect(options.maxBreadcrumbs).toBeGreaterThan(0);
      expect(options.maxBreadcrumbs).toBeLessThanOrEqual(100);
    });

    it('keeps the two kinds and drops the rest as they are recorded (beforeBreadcrumb)', () => {
      const before = options.beforeBreadcrumb;
      if (typeof before !== 'function') throw new Error('beforeBreadcrumb must be the allow-list');
      expect(before(navigation)).toEqual(navigation);
      expect(before(background)).toEqual(background);
      for (const crumb of [
        cameraWarning,
        tileRequest,
        { type: 'http', category: 'xhr', data: { url: 'https://islam.se/api' } },
        { type: 'http', category: 'fetch', data: { url: 'https://tiles.openfreemap.org/planet/12/2251/1185' } },
        { type: 'user', category: 'touch', message: 'Touch event within element: MapView' },
      ]) {
        expect(before(crumb)).toBeNull();
      }
    });

    it('applies the same list to the trail a report leaves with (beforeSend)', () => {
      // A JS report also carries the native SDKs' breadcrumbs, merged in after
      // beforeBreadcrumb ran; Android's touches on native views are switched off only in
      // the manifest (plugins/withSentryAndroidBreadcrumbs), never by a JS option.
      const send = options.beforeSend;
      if (typeof send !== 'function') throw new Error('beforeSend must apply the allow-list');
      const touch = { type: 'user', category: 'ui.click', timestamp: 3, data: { 'view.id': 'maplibre_compass' } };
      const sent = send(
        { type: undefined, breadcrumbs: [navigation, touch, cameraWarning, tileRequest, background] },
        {},
      );
      expect(sent).toEqual({ type: undefined, breadcrumbs: [navigation, background] });
    });
  });

  it('drops the JS breadcrumb instrumentation and the TurboModule instrumentation, and adds nothing', () => {
    const integrations = options.integrations;
    if (typeof integrations !== 'function') {
      throw new Error('integrations must stay a filter over the defaults, never a fixed list');
    }
    const dedupe = { name: 'Dedupe' };
    const expoContext = { name: 'ExpoContext' };
    const kept = integrations([dedupe, Sentry.breadcrumbsIntegration(), Sentry.turboModuleContextIntegration(), expoContext]);
    // Breadcrumbs is what wraps console, fetch and XHR: without it they are never
    // instrumented, so the projection-guard warning and request URLs are not even recorded.
    // TurboModuleContext's periodic "TurboModule aggregate" info event is a report on a
    // healthy launch. Anything the filter added would be a new path off the phone.
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
