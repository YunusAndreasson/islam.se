import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { ANALYTICS_EVENTS, afterAppOpen, analytics, screenName } from './index';

/**
 * One Screen Viewed event each time the route in view changes. Mounted once, at the root.
 *
 * Through `afterAppOpen`: the first screen of a launch is sent after its App Opened, and a
 * screen that comes into view while the app runs in the background (an iOS background
 * launch mounts the tree and redirects to the map) waits until the reader opens the app. A
 * screen left before then is cancelled, so only the one actually in view is sent.
 */
export function useScreenViews(): void {
  const screen = screenName(useSegments());
  useEffect(() => {
    if (screen === null) return;
    return afterAppOpen(() => {
      void analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen });
    });
  }, [screen]);
}
