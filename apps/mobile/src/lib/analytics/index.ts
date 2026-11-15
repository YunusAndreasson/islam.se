// Product analytics through Mixpanel. Never throws, never logs: analytics is not a feature
// the reader asked for, so no failure of it may reach the screen.
//
// - Lazy: Mixpanel is constructed on the first event, not at launch, and not at all in a
//   headless background wake-up (nothing there tracks).
// - One initialisation: memoised as a promise, so concurrent first events share it. A
//   failed init is forgotten, and the next event tries again.
// - trackAutomaticEvents = false: only the events in ./events.ts are sent.
// - EU data residency: every request goes to api-eu.mixpanel.com.
//
// ⚠️ IDENTITY AND PLACE, as the owner decided:
// - No identity. There is no identify() and no people profile; events stay on Mixpanel's
//   anonymous device id. The app has no accounts, so there is nothing to reset either.
// - Geography comes ONLY from Mixpanel's server-side IP geolocation (city, region,
//   country), which is left on. The app itself never sends a coordinate or anything
//   derived from one. AnalyticsProperties is kept to flat primitives so a LatLng object
//   cannot be passed whole, and ./analytics.test.ts pins the screen property to route
//   names.
import type * as MixpanelModule from 'mixpanel-react-native';

import { MIXPANEL_SERVER_URL, MIXPANEL_TOKEN } from './events';
import type { AnalyticsEventName } from './events';

export { ANALYTICS_EVENTS } from './events';
export type { AnalyticsEventName } from './events';

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

let mixpanel: MixpanelModule.Mixpanel | null = null;
let initialization: Promise<void> | null = null;

async function start(token: string): Promise<void> {
  // Required here, not imported: the native module is touched only once there is a token
  // and an event to send.
  const { Mixpanel } = require('mixpanel-react-native') as typeof MixpanelModule;
  const trackAutomaticEvents = false;
  const instance = new Mixpanel(token.trim(), trackAutomaticEvents);
  // Opted in, no super properties, the EU endpoint (see ./events).
  await instance.init(false, {}, MIXPANEL_SERVER_URL);
  // Published only once init has resolved, so a half-initialised client is never used.
  mixpanel = instance;
}

function initialize(): Promise<void> {
  if (!MIXPANEL_TOKEN) return Promise.resolve();
  initialization ??= start(MIXPANEL_TOKEN).catch(() => {
    initialization = null;
  });
  return initialization;
}

export const analytics = {
  track: async (event: AnalyticsEventName, properties?: AnalyticsProperties): Promise<void> => {
    try {
      await initialize();
      mixpanel?.track(event, properties);
    } catch {
      // Silent by design: see the top of this file.
    }
  },
};

/**
 * The route as its file path: `useSegments()` joined, e.g. `(settings)/om`. Segments name
 * the route files, never the values a dynamic route or a query string carries, which is
 * why the screen is read from them rather than from `usePathname()` or the URL: a route
 * here can carry coordinates (see app/_layout's ErrorBoundary note).
 */
export function screenName(segments: readonly string[]): string {
  return segments.length === 0 ? 'index' : segments.join('/');
}
