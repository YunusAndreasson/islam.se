// Product analytics: the Mixpanel token, its server, and the only event names Mixpanel may
// receive.
import Constants from 'expo-constants';

// The token lives in app.json (expo.extra.mixpanelToken), beside sentryDsn and for the same
// reason: it is public by design (it ships inside every bundle), and one place holds what the
// binary reports to. Empty, analytics is a silent no-op.
const token: unknown = Constants.expoConfig?.extra?.mixpanelToken;
export const MIXPANEL_TOKEN = typeof token === 'string' && token.trim() !== '' ? token : undefined;

// The project uses Mixpanel's EU data residency. The SDK's default is the US endpoint, which
// an EU project does not accept, so this is handed to init() explicitly.
export const MIXPANEL_SERVER_URL = 'https://api-eu.mixpanel.com';

// Keep this list short. Every name here is something that leaves the device.
//
// ⚠️ NO EVENT CARRIES A POSITION. Not the GPS fix, not the map camera, not a chosen place,
// not a mosque, not anything computed from them (a prayer time, a zone, a distance). The
// only geography Mixpanel has is the city it derives server-side from the request's IP
// address. See ./index.ts.
export const ANALYTICS_EVENTS = {
  /** A route came into view. `screen` is the route's file path, never its parameters. */
  SCREEN_VIEWED: 'Screen Viewed',
  /** The introduction reached its end through its last step. */
  INTRO_COMPLETED: 'Intro Completed',
  /** The introduction was left through the welcome step's "Hoppa över". */
  INTRO_SKIPPED: 'Intro Skipped',
  /** A mosque correction reached the server. `reason` is the ReportReason, nothing else. */
  MOSQUE_REPORT_SENT: 'Mosque Report Sent',
} as const;

/**
 * The events `analytics.track` accepts. A hand-written string is a compile error rather
 * than a row in Mixpanel under a name no report queries.
 */
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
