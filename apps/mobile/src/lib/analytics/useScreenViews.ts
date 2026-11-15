import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { ANALYTICS_EVENTS, analytics, screenName } from './index';

/** One Screen Viewed event each time the route in view changes. Mounted once, at the root. */
export function useScreenViews(): void {
  const screen = screenName(useSegments());
  useEffect(() => {
    void analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen });
  }, [screen]);
}
