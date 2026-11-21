// Product analytics through Mixpanel. Never throws, never logs: analytics is not a feature
// the reader asked for, so no failure of it may reach the screen.
//
// - Lazy: Mixpanel is constructed on the first event, not at launch, and not at all in a
//   headless background wake-up (nothing there tracks). Registering a super property does
//   not construct it either: the value is kept here and handed over once a client exists.
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
//   names. Super properties are typed (SuperProperties in ./events): coarse states only.
import type * as MixpanelModule from 'mixpanel-react-native';

import { MIXPANEL_SERVER_URL, MIXPANEL_TOKEN } from './events';
import type { AnalyticsEventName, SuperProperties } from './events';

export { ANALYTICS_EVENTS } from './events';
export type {
  AnalyticsEventName,
  LocationContext,
  PermissionKind,
  PermissionSource,
  RemindersState,
  SuperProperties,
} from './events';

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;
type Primitive = string | number | boolean;

let mixpanel: MixpanelModule.Mixpanel | null = null;
let initialization: Promise<void> | null = null;

// Every super property registered in this JS context, so a client constructed AFTER the
// registration (the usual order: state is known before the first event) still gets it.
// `registeredOnce` keeps Mixpanel's register-once meaning here too: the first value wins.
const registered: Record<string, Primitive> = {};
const registeredOnce: Record<string, Primitive> = {};

/** The defined entries only: an undefined value means "not known yet", never "clear it". */
function definedEntries(properties: Partial<SuperProperties>): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

function hasKeys(record: Record<string, Primitive>): boolean {
  return Object.keys(record).length > 0;
}

async function start(token: string): Promise<void> {
  // Required here, not imported: the native module is touched only once there is a token
  // and an event to send.
  const { Mixpanel } = require('mixpanel-react-native') as typeof MixpanelModule;
  const trackAutomaticEvents = false;
  const instance = new Mixpanel(token.trim(), trackAutomaticEvents);
  // Opted in, no super properties at init, the EU endpoint (see ./events). What has been
  // registered so far is applied right after, before the client is published, so the first
  // event already carries it.
  await instance.init(false, {}, MIXPANEL_SERVER_URL);
  if (hasKeys(registeredOnce)) instance.registerSuperPropertiesOnce({ ...registeredOnce });
  if (hasKeys(registered)) instance.registerSuperProperties({ ...registered });
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
  /** Set super properties: every later event carries them until they change. */
  register: (properties: Partial<SuperProperties>): void => {
    try {
      const next = definedEntries(properties);
      if (!hasKeys(next)) return;
      Object.assign(registered, next);
      mixpanel?.registerSuperProperties(next);
    } catch {
      // Silent by design.
    }
  },
  /** Set super properties that never change once set (Mixpanel keeps the first value). */
  registerOnce: (properties: Partial<SuperProperties>): void => {
    try {
      const next = definedEntries(properties);
      for (const key of Object.keys(next)) {
        if (key in registeredOnce) delete next[key];
      }
      if (!hasKeys(next)) return;
      Object.assign(registeredOnce, next);
      mixpanel?.registerSuperPropertiesOnce(next);
    } catch {
      // Silent by design.
    }
  },
};

// ── The open comes first ──────────────────────────────────────────────────────────────
//
// App Opened (and, once per install, First Open) is the first event of every session, and
// the funnels start from it: First Open → Onboarding Step Viewed → Intro Completed. It needs
// a few storage and permission reads before it can be sent with the right super properties,
// while a screen or an intro step comes into view in the same frame. Sent as they arrive,
// the step would land BEFORE the open, and a funnel would lose the user at its first step.
//
// So the events that describe what happens after the open go through `afterAppOpen`, and
// ./useAppAnalytics holds them from the moment it is loaded until the cold open has been
// sent (or a safety timeout has passed). It also keeps that path silent while the app runs
// in the background: an iOS background launch mounts the whole tree, and until the reader
// actually opens the app there is no open, so nothing is released. Where ./useAppAnalytics
// is not loaded (a screen tested on its own), nothing is held.

let openPending = false;
const afterOpen = new Set<() => void>();

/** Hold `afterAppOpen` callbacks until {@link releaseAppOpen}. Called by ./useAppAnalytics. */
export function holdForAppOpen(): void {
  openPending = true;
}

/** The cold open has been sent: run what waited for it, and stop holding. */
export function releaseAppOpen(): void {
  openPending = false;
  const waiting = [...afterOpen];
  afterOpen.clear();
  for (const run of waiting) {
    try {
      run();
    } catch {
      // Silent by design.
    }
  }
}

/** Run `fn` once this launch's open has been sent: now, if it has. Returns a cancel, for an
 *  effect whose screen goes away before then. */
export function afterAppOpen(fn: () => void): () => void {
  if (!openPending) {
    fn();
    return () => {};
  }
  const run = (): void => fn();
  afterOpen.add(run);
  return () => {
    afterOpen.delete(run);
  };
}

/**
 * The route as its file path: `useSegments()` joined, e.g. `(settings)/om`. Segments name
 * the route files, never the values a dynamic route or a query string carries, which is
 * why the screen is read from them rather than from `usePathname()` or the URL: a route
 * here can carry coordinates (see app/_layout's ErrorBoundary note).
 *
 * null for "/": app/index renders nothing and redirects, so it is not a screen anyone saw.
 * Sent as `index`, every cold launch counted a screen nobody looked at, then the map.
 */
export function screenName(segments: readonly string[]): string | null {
  return segments.length === 0 ? null : segments.join('/');
}
