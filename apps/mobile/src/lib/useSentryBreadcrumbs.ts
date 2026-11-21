import * as Sentry from '@sentry/react-native';
import { useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { screenName } from '@/lib/analytics';
import { createLifecycleBreadcrumbs, screenBreadcrumb } from '@/lib/sentry-breadcrumbs';

/**
 * Records the two breadcrumbs a crash report may carry (see @/lib/sentry-breadcrumbs): a
 * screen change each time the route in view changes, and a move between foreground and
 * background. Mounted once, at the root.
 *
 * Recorded here in JS for both platforms, not by the native SDKs: the native lifecycle and
 * screen sources come bundled with ones that must stay off (on iOS one switch covers app
 * lifecycle, system events and touches alike), and from here every breadcrumb passes the
 * one allow-list. The SDK hands each one to the native layer too, so a native crash carries
 * the same trail.
 *
 * Unlike Screen Viewed this does not wait for the app to be opened: a crash during an iOS
 * background launch is exactly when the trail should say the app was in the background.
 */
export function useSentryBreadcrumbs(): void {
  const screen = screenName(useSegments());
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (screen === null) return;
    Sentry.addBreadcrumb(screenBreadcrumb(previous.current, screen));
    previous.current = screen;
  }, [screen]);

  useEffect(() => {
    const next = createLifecycleBreadcrumbs(AppState.currentState);
    const sub = AppState.addEventListener('change', (state) => {
      const crumb = next(state);
      if (crumb) Sentry.addBreadcrumb(crumb);
    });
    return () => sub.remove();
  }, []);
}
