import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

// Crash reporting, and the rules for what a report may carry. index.ts imports this before
// anything else, so it is live before the background task is defined and before any route.
//
// ⚠️ EVERY OPTION BELOW IS HELD AGAINST ONE PROMISE. The store listing and
// islam.se/integritetspolicy say the reader's position never leaves the device, and that the
// app only reaches Sentry when something has gone wrong. Sentry's defaults, and the setup
// template its docs and wizard hand out, break both — so none of these lines restates a
// default for tidiness, and sentry.test.ts fails on the edit that flips any of them:
//
// - No sendDefaultPii and no dataCollection — the SDK attaches no IP address, device name or
//   user. Left unset, the two resolve to Sentry's no-PII mapping; sendDefaultPii is deprecated,
//   and setting dataCollection at all starts from collect-everything defaults. (The project's
//   "Prevent Storing of IP Addresses" setting in Sentry covers the server side.)
// - maxBreadcrumbs: 0 — breadcrumbs are the trail of events before an error, and on this app
//   that trail is where position leaks: projection-guard's console.warn prints the map
//   camera's lat/lon to four decimals (~10 m), which the SDK files as a breadcrumb, and the
//   native iOS SDK records HTTP requests, where MapLibre's tile URLs name the tiles on screen.
//   The value is handed to both native SDKs, so it covers native crashes too — which a
//   JS-side beforeBreadcrumb filter would never see.
// - The seven enable*Breadcrumbs switches: false — the native SDKs then never RECORD network,
//   lifecycle, system or UI breadcrumbs at all, so the promise above no longer rests on the
//   single cap of maxBreadcrumbs: 0. Network breadcrumbs are the ones that carry tile URLs.
// - enableMemoryIntrospection: false — on a native crash it embeds strings found in memory
//   near the crash site, and on this app those strings can be coordinates.
// - The TurboModuleContext integration is removed. Since SDK 8.14 it is on by default and
//   flushes a periodic "TurboModule aggregate" info event: a report on a healthy launch.
//   Under today's defaults it records nothing here (it only wraps the SDK's own module, which
//   it also ignores), so this pins that rather than fixing a leak. The filter only ever
//   removes defaults; it never adds an integration.
// - attachScreenshot / attachViewHierarchy: false — the screen is a map centred on the reader.
// - enableAutoSessionTracking / sendClientReports: false — sessions and client reports go out
//   on ordinary launches, crash or no crash. With both off the app says nothing to Sentry
//   until something breaks.
// - No tracing, profiling or replay: none of their sample rates is set, so none of them runs.
//
// OTA updates need no tags of our own: the SDK's Expo integration already attaches the update
// id, channel and runtime version to every event, which is how a bad OTA shows up as one. It
// also sends ONE warning event when expo-updates falls back to the embedded bundle (an
// "emergency launch"), which is kept: a broken OTA is exactly the "something has gone wrong"
// the policy allows a report for, and it carries only the update id, channel and runtime.
const TURBO_MODULE_CONTEXT = Sentry.turboModuleContextIntegration().name;

export function sentryOptions(dsn: string | undefined): Sentry.ReactNativeOptions {
  return {
    dsn,
    // No DSN means crash reporting was never configured; a development run already has a red
    // box in front of whoever caused the error. Neither belongs in the project's issue list.
    enabled: Boolean(dsn) && !__DEV__,
    // Personal data: neither sendDefaultPii nor dataCollection is set, on purpose (see above).
    maxBreadcrumbs: 0,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableAutoSessionTracking: false,
    sendClientReports: false,
    enableNetworkBreadcrumbs: false,
    enableAutoBreadcrumbTracking: false,
    enableNetworkEventBreadcrumbs: false,
    enableActivityLifecycleBreadcrumbs: false,
    enableAppLifecycleBreadcrumbs: false,
    enableSystemEventBreadcrumbs: false,
    enableAppComponentBreadcrumbs: false,
    enableMemoryIntrospection: false,
    integrations: (defaults) => defaults.filter((integration) => integration.name !== TURBO_MODULE_CONTEXT),
  };
}

// The DSN lives in app.json (expo.extra.sentryDsn), beside the plugin's organization and
// project, so the release preflight in scripts/eas-release.sh can refuse to build while it is
// empty — an empty DSN builds cleanly and ships with crash reporting silently off. It is
// public by design (it ships inside every bundle), so there is nothing here to keep secret.
const dsn: unknown = Constants.expoConfig?.extra?.sentryDsn;
Sentry.init(sentryOptions(typeof dsn === 'string' && dsn !== '' ? dsn : undefined));
