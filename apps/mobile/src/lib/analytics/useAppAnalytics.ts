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
import { isoDay, superPropertiesFor, usesAdhan } from './properties';

// From the moment the root layout loads this module, screen views, intro steps and taps
// wait for the cold open (see afterAppOpen in ./index).
holdForAppOpen();

/** Test seam: a fresh JS start, not opened yet, with the hold back on. */
export function resetAppAnalyticsForTests(): void {
  appLaunch.resetForTests();
  holdForAppOpen();
}

/** Persisted once First Open has been sent: its `install_kind`, for the super property on
 *  every later launch. Its own key, like the hint records, so "Återställ appens standard"
 *  (which wipes PrayerSettings) cannot make an install new again. */
export const FIRST_OPEN_KEY = 'analytics:firstOpen:v1';

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

/**
 * Whether this is the install's first open of a build with analytics, and what kind of
 * install it is. 'new' exactly when the introduction is still pending at launch: lib/intro
 * lets every install that predates it through, so pending means nothing has been saved yet.
 * The record is written before First Open is sent, and First Open is sent only if the write
 * worked: a storage failure loses one First Open rather than sending one per launch.
 */
async function claimFirstOpen(
  status: IntroStatus,
): Promise<{ fresh: true; kind: SuperProperties['install_kind'] } | { fresh: false; kind: SuperProperties['install_kind'] | undefined }> {
  try {
    const raw = await storage.getItem(FIRST_OPEN_KEY);
    if (raw) {
      const stored: unknown = JSON.parse(raw);
      const kind =
        typeof stored === 'object' && stored !== null && 'install_kind' in stored
          ? stored.install_kind
          : undefined;
      return { fresh: false, kind: kind === 'new' || kind === 'existing' ? kind : undefined };
    }
    const kind = status === 'pending' ? 'new' : 'existing';
    await storage.setItem(FIRST_OPEN_KEY, JSON.stringify({ install_kind: kind }));
    return { fresh: true, kind };
  } catch {
    return { fresh: false, kind: undefined };
  }
}

/** Send one open. A cold one first settles First Open and the once-only properties, and
 *  releases what waited for it, whatever happens. */
async function recordOpen(kind: LaunchKind, inputs: Inputs): Promise<void> {
  if (kind === 'warm') {
    analytics.register(await currentSuperProperties(inputs));
    void analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'warm' });
    return;
  }
  const safety = setTimeout(releaseAppOpen, RELEASE_AFTER_MS);
  try {
    const [properties, day, first] = await Promise.all([
      currentSuperProperties(inputs),
      installDate(),
      claimFirstOpen(inputs.status),
    ]);
    analytics.registerOnce({ install_date: day, install_kind: first.kind });
    analytics.register(properties);
    if (first.fresh) {
      void analytics.track(ANALYTICS_EVENTS.FIRST_OPEN, { install_kind: first.kind });
    }
    void analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
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
  const waiting = useRef<LaunchKind | null>(null);

  const onOpen = useEffectEvent((kind: LaunchKind) => {
    if (!ready) {
      waiting.current = waiting.current === 'cold' ? 'cold' : kind;
      return;
    }
    void recordOpen(kind, inputs());
  });

  // A foreground that is not an open (a return inside 30 s) still re-reads the properties:
  // the reader may have just allowed notifications in the system settings.
  const onForeground = useEffectEvent(() => {
    if (!ready) return;
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
    void recordOpen(kind, inputs());
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
