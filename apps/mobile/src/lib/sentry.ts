import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { allowBreadcrumb, keepAllowedBreadcrumbs } from './sentry-breadcrumbs';

// Crash reporting, and the rules for what a report may carry. index.ts imports this before
// anything else, so it is live before the background task is defined and before any route.
//
// ⚠️ EVERY OPTION BELOW IS HELD AGAINST ONE PROMISE. The store listing and
// islam.se/integritetspolicy say the reader's position never leaves the device, and the
// policy says exactly what does reach Sentry: a report when something has gone wrong,
// carrying the screens visited and the trips to the background before it, and an anonymous
// session each time the app is opened. Sentry's defaults, and the setup template its docs
// and wizard hand out, break the first promise — so none of these lines restates a default
// for tidiness, and sentry.test.ts fails on the edit that flips any of them:
//
// - No sendDefaultPii and no dataCollection — the SDK attaches no IP address, device name or
//   user. Left unset, the two resolve to Sentry's no-PII mapping; sendDefaultPii is deprecated,
//   and setting dataCollection at all starts from collect-everything defaults. (The project's
//   "Prevent Storing of IP Addresses" setting in Sentry covers the server side.)
// - Breadcrumbs are an ALLOW-LIST of two kinds, from @/lib/sentry-breadcrumbs: a screen
//   change (route file names only, never params) and a move between foreground and
//   background. Every other breadcrumb on this app is where position leaks:
//   projection-guard's console.warn prints the map camera's lat/lon to four decimals
//   (~10 m), and the native iOS SDK records HTTP requests, where MapLibre's tile URLs name
//   the tiles on screen. So the list is held at three layers:
//     1. At the source, native: the seven enable*Breadcrumbs switches are false, so neither
//        native SDK RECORDS network, lifecycle, system or UI breadcrumbs at all — a native
//        crash, which no JS filter sees, has nothing of that kind to carry. (Lifecycle comes
//        from JS instead, see @/lib/useSentryBreadcrumbs: iOS has no switch for lifecycle
//        alone.)
//     2. At the source, JS: the Breadcrumbs integration is removed, so console, fetch and
//        XHR are never instrumented for breadcrumbs; beforeBreadcrumb drops anything else
//        that is not on the list (Expo Updates, the error boundary) before the SDK copies
//        it to the native scope.
//     3. On the way out: beforeSend applies the same list to a JS report's whole trail,
//        because the SDK merges the native breadcrumbs into it after beforeBreadcrumb has
//        run — and Android records touches on native views (MapLibre's compass and
//        attribution) under a switch the JS options cannot reach.
//   maxBreadcrumbs caps the trail on both native SDKs as well as in JS.
// - enableMemoryIntrospection: false — on a native crash it embeds strings found in memory
//   near the crash site, and on this app those strings can be coordinates.
// - The TurboModuleContext integration is removed. Since SDK 8.14 it is on by default and
//   flushes a periodic "TurboModule aggregate" info event: a report on a healthy launch.
//   Under today's defaults it records nothing here (it only wraps the SDK's own module, which
//   it also ignores), so this pins that rather than fixing a leak. The filter only ever
//   removes defaults; it never adds an integration.
// - attachScreenshot / attachViewHierarchy: false — the screen is a map centred on the reader.
// - enableAutoSessionTracking: true — release health. The native SDKs send a session each
//   time the app comes to the foreground (a return within 30 s continues the same one):
//   when it started, how long it ran, whether it ended in a crash, the release and the
//   environment. That is what gives Sentry a crash-free
//   rate per release, so a bad build or OTA shows up as a number and not only as the
//   reports that made it out. It carries no breadcrumbs, no user and no position; like a
//   report, it is keyed by the random id the SDK creates at install. sendClientReports
//   stays false: those are the SDK's own counts of dropped events, sent on healthy
//   launches, and nothing here reads them.
// - enableNativeCrashHandling is left at its default, on: native crashes are the reports
//   that matter most and the ones JS can never catch.
// - No tracing, profiling or replay: none of their sample rates is set, so none of them runs.
//
// OTA updates need no tags of our own: the SDK's Expo integration already attaches the update
// id, channel and runtime version to every event, which is how a bad OTA shows up as one. It
// also sends ONE warning event when expo-updates falls back to the embedded bundle (an
// "emergency launch"), which is kept: a broken OTA is exactly the "something has gone wrong"
// the policy allows a report for, and it carries only the update id, channel and runtime.
const DROPPED_INTEGRATIONS = new Set([
  Sentry.turboModuleContextIntegration().name,
  Sentry.breadcrumbsIntegration().name,
]);

/** Enough for the last few minutes of use: screen changes and trips to the background are
 *  sparse. Held by the native SDKs too, so a native crash carries the same window. */
const MAX_BREADCRUMBS = 30;

export function sentryOptions(dsn: string | undefined): Sentry.ReactNativeOptions {
  const enabled = Boolean(dsn) && !__DEV__;
  return {
    dsn,
    // No DSN means crash reporting was never configured; a development run already has a red
    // box in front of whoever caused the error. Neither belongs in the project's issue list.
    enabled,
    // Android starts ANR tracking through the native bridge independently of JS reporting.
    enableNative: enabled,
    // Personal data: neither sendDefaultPii nor dataCollection is set, on purpose (see above).
    maxBreadcrumbs: MAX_BREADCRUMBS,
    beforeBreadcrumb: allowBreadcrumb,
    beforeSend: keepAllowedBreadcrumbs,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoSessionTracking: true,
    sendClientReports: false,
    enableNetworkBreadcrumbs: false,
    enableAutoBreadcrumbTracking: false,
    enableNetworkEventBreadcrumbs: false,
    enableActivityLifecycleBreadcrumbs: false,
    enableAppLifecycleBreadcrumbs: false,
    enableSystemEventBreadcrumbs: false,
    enableAppComponentBreadcrumbs: false,
    enableMemoryIntrospection: false,
    integrations: (defaults) => defaults.filter((integration) => !DROPPED_INTEGRATIONS.has(integration.name)),
  };
}

// The DSN lives in app.json (expo.extra.sentryDsn), beside the plugin's organization and
// project, so the release preflight in scripts/eas-release.sh can refuse to build while it is
// empty — an empty DSN builds cleanly and ships with crash reporting silently off. It is
// public by design (it ships inside every bundle), so there is nothing here to keep secret.
const dsn: unknown = Constants.expoConfig?.extra?.sentryDsn;
Sentry.init(sentryOptions(typeof dsn === 'string' && dsn !== '' ? dsn : undefined));
