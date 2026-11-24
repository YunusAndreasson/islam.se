// The app-level analytics: App Opened, First Open, and the super properties that let every
// other event be split by "can we reach this reader" and "how did they set the app up".
// Mounted once, at the root, inside LocationProvider (it reads settings, the intro state
// and where the location comes from). Renders nothing.
//
// ⚠️ NOTHING HERE MAY COUNT A LAUNCH NOBODY SAW. iOS launches the app in the background for
// the notification refresh (lib/notification-refresh) and AppDelegate mounts the whole
// tree for it. Opens are therefore AppState moves to 'active' (./lifecycle), never mounts,
// and the background refresh task, which has no React tree, sends nothing at all.
import * as Application from 'expo-application';
import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState } from 'react-native';

import type { IntroHistory, IntroStatus } from '@/lib/intro';
import { useIntro } from '@/lib/intro-context';
import { useLocation } from '@/lib/location/context';
import { readCachedFix } from '@/lib/location/gps-cache';
import type { LocationSource } from '@/lib/location/resolve';
import { alertsPerDay, getNotificationPermissionState, HAS_ADHAN_SOUND } from '@/lib/notifications';
import { useSettings } from '@/lib/settings/context';
import type { LocationMode, NotificationSettings } from '@/lib/settings/types';
import { storage } from '@/lib/storage';

import {
  ANALYTICS_EVENTS,
  analytics,
  holdForAppOpen,
  releaseAppOpen,
  type SuperProperties,
} from './index';
import { appLaunch, type LaunchKind } from './lifecycle';
import { FIRST_OPEN_KEY, pendingFirstOpen, publishSetupAssignment, retryFirstOpen, type PendingFirstOpen } from './first-open';
import { isoDay, superPropertiesFor, usesAdhan } from './properties';

export { FIRST_OPEN_KEY } from './first-open';

// From the moment the root layout loads this module, screen views, intro steps and taps
// wait for the cold open (see afterAppOpen in ./index).
holdForAppOpen();

/** Test seam: a fresh JS start, not opened yet, with the hold back on. */
export function resetAppAnalyticsForTests(): void {
  appLaunch.resetForTests();
  publishSetupAssignment(false);
  holdForAppOpen();
}

/** Long enough for the cold open's few reads; short enough that if one of them hangs, the
 *  screen views waiting behind it are late rather than lost. */
const RELEASE_AFTER_MS = 5000;

interface Inputs {
  notifications: NotificationSettings;
  locationMode: LocationMode;
  source: LocationSource;
  history: IntroHistory | null;
  status: IntroStatus;
}

/** The super properties as they stand. In GPS mode the provider reports 'default' until
 *  the cached fix has been read, so at a cold start the cache is asked directly: a reader
 *  whose last fix is on disk is on GPS, not on the Stockholm fallback. */
async function currentSuperProperties(i: Inputs): Promise<Partial<SuperProperties>> {
  const [permission, cached] = await Promise.all([
    getNotificationPermissionState(),
    i.locationMode === 'gps' && i.source === 'default' ? readCachedFix() : Promise.resolve(null),
  ]);
  return superPropertiesFor({
    notifications: i.notifications,
    permission,
    locationSource: cached ? 'gps' : i.source,
    introHistory: i.history,
    adhanPlayable: HAS_ADHAN_SOUND,
  });
}

async function installDate(): Promise<string | undefined> {
  try {
    return isoDay(await Application.getInstallationTimeAsync());
  } catch {
    return undefined;
  }
}

interface FirstOpen {
  fresh: boolean;
  assigned?: boolean;
  kind?: SuperProperties['install_kind'];
  pending?: PendingFirstOpen;
}

/** Save a fresh assignment before routing. A pending denominator event survives
 * process death or SDK initialization failure with its original identity and time. */
async function claimFirstOpen(status: IntroStatus, openedAt: number): Promise<FirstOpen> {
  try {
    const raw = await storage.getItem(FIRST_OPEN_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const kind = saved?.install_kind;
      const pending = pendingFirstOpen(saved);
      return { fresh: false, assigned: kind === 'new' && Number.isFinite(saved?.setupStartedAt), kind: kind === 'new' || kind === 'existing' ? kind : undefined, pending };
    }
    const kind = status === 'pending' ? 'new' : 'existing';
    const pending = kind === 'new'
      ? { id: 'first-' + Math.random().toString(36).slice(2), at: openedAt, development: __DEV__ } : undefined;
    await storage.setItem(FIRST_OPEN_KEY, JSON.stringify({ install_kind: kind, ...(pending && {
      setupStartedAt: openedAt, pendingFirstOpen: pending.id, development: pending.development,
    }) }));
    return { fresh: true, assigned: !!pending, kind, pending };
  } catch {
    return { fresh: false };
  }
}

/** Send one open. A cold one first settles First Open and the once-only properties, and
 *  releases what waited for it, whatever happens. */
async function recordOpen(kind: LaunchKind, inputs: Inputs, openedAt = Date.now()): Promise<void> {
  if (kind === 'warm') {
    void retryFirstOpen();
    analytics.register(await currentSuperProperties(inputs));
    void analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'warm' });
    return;
  }
  const safety = setTimeout(releaseAppOpen, RELEASE_AFTER_MS);
  try {
    const classification = claimFirstOpen(inputs.status, openedAt);
    // Enrichment may wait for an OS read. Neither it nor remote ingestion owns
    // the lifecycle edge. Apply the properties as soon as they become available.
    void Promise.all([currentSuperProperties(inputs), installDate(), classification]).then(([properties, day, first]) => {
      analytics.registerOnce({ install_date: day, install_kind: first.kind });
      analytics.register(properties);
    }).catch(() => undefined);
    const first = await classification;
    if (first.pending) {
      // Local lifecycle accounting and setup observation must continue during an offline send.
      void retryFirstOpen(first.pending);
    } else if (first.fresh && first.kind) {
      void analytics.track(ANALYTICS_EVENTS.FIRST_OPEN, { install_kind: first.kind });
    }
    void analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
    publishSetupAssignment(first.assigned === true);
  } catch {
    // Silent by design: see ./index.
  } finally {
    clearTimeout(safety);
    releaseAppOpen();
  }
}

export function useAppAnalytics(): void {
  const { settings, loaded } = useSettings();
  const { status, history } = useIntro();
  const { source } = useLocation();
  const n = settings.notifications;
  // The open waits for the two storage reads that say what to send with it.
  const ready = loaded && status !== 'unknown';

  const inputs = useEffectEvent(
    (): Inputs => ({
      notifications: settings.notifications,
      locationMode: settings.locationMode,
      source,
      history,
      status,
    }),
  );

  // An open that arrived before `ready`: at most one is kept, and a cold one wins.
  const firstForeground = useRef<number | undefined>(undefined);
  const waiting = useRef<LaunchKind | null>(null);

  const onOpen = useEffectEvent((kind: LaunchKind) => {
    if (kind === 'cold') firstForeground.current = Date.now();
    if (!ready) {
      waiting.current = waiting.current === 'cold' ? 'cold' : kind;
      return;
    }
    void recordOpen(kind, inputs(), firstForeground.current);
  });

  // A foreground that is not an open (a return inside 30 s) still re-reads the properties:
  // the reader may have just allowed notifications in the system settings.
  const onForeground = useEffectEvent(() => {
    if (!ready) return;
    void retryFirstOpen();
    void currentSuperProperties(inputs()).then(analytics.register);
  });

  useEffect(() => {
    const observe = (state: string | null | undefined): void => {
      const kind = appLaunch.observe(state, Date.now());
      if (kind) onOpen(kind);
      else if (state === 'active') onForeground();
    };
    // The state at mount first: a normal launch is usually already 'active', and then no
    // change event follows.
    observe(AppState.currentState);
    const subscription = AppState.addEventListener('change', observe);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ready || waiting.current === null) return;
    const kind = waiting.current;
    waiting.current = null;
    void recordOpen(kind, inputs(), firstForeground.current);
  }, [ready]);

  // Re-registered whenever one of the inputs moves: a reader who turns reminders on, picks
  // a city or finishes the introduction carries the new state on their very next event.
  // `key` stands in for the inputs (Effect Events are not dependencies).
  const key = [
    n.enabled,
    n.enabled ? alertsPerDay(n) : 0,
    usesAdhan(n, HAS_ADHAN_SOUND),
    settings.locationMode,
    source,
    history,
  ].join('|');
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void currentSuperProperties(inputs()).then((properties) => {
      if (alive) analytics.register(properties);
    });
    return () => {
      alive = false;
    };
  }, [ready, key]);
}
