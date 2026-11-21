// The trail a crash report may carry, and nothing else: which screens the reader went
// through, and when the app went to the background and came back. See @/lib/sentry for why
// every other kind of breadcrumb is a way for the reader's position to leave the phone.
//
// Pure: the app records through useSentryBreadcrumbs, the SDK filters through
// `allowBreadcrumb` (as beforeBreadcrumb) and `keepAllowedBreadcrumbs` (as beforeSend).
import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

const NAVIGATION = 'navigation';
const LIFECYCLE = 'app.lifecycle';

/** The two app states a breadcrumb names. iOS's 'inactive' (Control Centre, an alert over
 *  the app) is not a departure, the same reading as analytics/lifecycle. */
type Lifecycle = 'foreground' | 'background';

// A route name is expo-router's file segments joined with '/': letters, hyphens, the
// parentheses of a group, the brackets of a dynamic segment (`[id]`, never its value) and
// the `+` of a special route. Never a digit, and never `?`, `=`, `.` or `,` — every
// coordinate and every query string has some of those. A name that fails this is dropped,
// not cleaned: the check fails closed.
const ROUTE_NAME = /^[a-z()[\]+/-]+$/i;

const isRouteName = (value: unknown): value is string => typeof value === 'string' && ROUTE_NAME.test(value);

/** A screen change, named by route file only (the same name analytics' Screen Viewed uses). */
export function screenBreadcrumb(from: string | null, to: string, timestamp?: number): Breadcrumb {
  return {
    type: 'navigation',
    category: NAVIGATION,
    level: 'info',
    message: to,
    data: from === null ? { to } : { from, to },
    ...(timestamp === undefined ? {} : { timestamp }),
  };
}

function lifecycleBreadcrumb(state: Lifecycle, timestamp?: number): Breadcrumb {
  return {
    type: 'navigation',
    category: LIFECYCLE,
    level: 'info',
    message: state,
    data: { state },
    ...(timestamp === undefined ? {} : { timestamp }),
  };
}

function lifecycleOf(appState: string | null | undefined): Lifecycle | null {
  if (appState === 'active') return 'foreground';
  if (appState === 'background') return 'background';
  return null;
}

/**
 * Feed it every AppState value; it answers with a breadcrumb only when the app actually
 * changed sides. Seeded with the state at mount, so the first breadcrumb is a real move and
 * an iOS 'inactive' → 'active' (Control Centre pulled down and back) records nothing.
 */
export function createLifecycleBreadcrumbs(
  initial: string | null | undefined,
): (appState: string | null | undefined) => Breadcrumb | null {
  let last = lifecycleOf(initial);
  return (appState) => {
    const state = lifecycleOf(appState);
    if (state === null || state === last) return null;
    last = state;
    return lifecycleBreadcrumb(state);
  };
}

/**
 * beforeBreadcrumb: the allow-list. A navigation or lifecycle breadcrumb is REBUILT from the
 * fields it is allowed to have, so a producer that adds a URL, params or a message to one of
 * those two categories still loses them; everything else (console, fetch, xhr, http, touch,
 * the SDK's own events, Expo Updates, the error boundary) is dropped.
 */
export function allowBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const data: Record<string, unknown> = crumb.data ?? {};
  if (crumb.category === NAVIGATION) {
    const { from, to } = data;
    if (!isRouteName(to)) return null;
    if (from !== undefined && from !== null && !isRouteName(from)) return null;
    return screenBreadcrumb(isRouteName(from) ? from : null, to, crumb.timestamp);
  }
  if (crumb.category === LIFECYCLE) {
    const { state } = data;
    if (state !== 'foreground' && state !== 'background') return null;
    return lifecycleBreadcrumb(state, crumb.timestamp);
  }
  return null;
}

/**
 * beforeSend: the same allow-list over the event's finished trail. A JS error report also
 * carries the breadcrumbs the NATIVE SDKs recorded (the SDK merges them in after
 * beforeBreadcrumb has run), and Android records touches on native views that no option
 * passed from JS can switch off.
 */
export function keepAllowedBreadcrumbs(event: ErrorEvent): ErrorEvent {
  if (event.breadcrumbs === undefined) return event;
  return {
    ...event,
    breadcrumbs: event.breadcrumbs.flatMap((crumb) => allowBreadcrumb(crumb) ?? []),
  };
}
