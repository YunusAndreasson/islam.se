// Native surfaces need reconciliation when a prayer arrives even if the app
// remains open. These timers run only in the foreground; they cannot provide a
// closed-app ActivityKit expiry (that requires an end push).
import { useEffect, useEffectEvent } from 'react';
import { AppState, Platform } from 'react-native';

import { useDisplayZone } from '@/lib/device-zone';
import type { LatLng } from '@/lib/prayer-times';
import { notificationSignature } from '@/lib/settings/compute-signature';
import type { PrayerSettings } from '@/lib/settings/types';
import { syncAndroidPrayerNotification } from './android-ongoing';
import { LIVE_ACTIVITY_WINDOW_MS, syncPrayerLiveActivity } from './live-activity';
import { buildPayloadAt } from './payload';

export function usePrayerActivitySync(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  loaded: boolean,
): void {
  const zone = useDisplayZone();
  // These surfaces show no Hijri date and use the native environment's appearance.
  // Cosmetic widget changes must not rebuild their payloads or restart their timers.
  const key = `${notificationSignature(settings)}|${coords.latitude},${coords.longitude}|${location}`;
  const reconcile = useEffectEvent((foreground: boolean) => {
    const now = Date.now();
    if (Platform.OS === 'ios') {
      void syncPrayerLiveActivity(coords, settings, location, now, { canStart: foreground });
    } else {
      void syncAndroidPrayerNotification(coords, settings, location, now);
    }
    const { nextAtMs } = buildPayloadAt(coords, settings, now, location);
    // Enter the one-hour window, then clean up just after the prayer. The extra
    // second crosses the selector's at-or-after boundary without a timer spin.
    const boundary = nextAtMs == null ? now + LIVE_ACTIVITY_WINDOW_MS
      : nextAtMs - LIVE_ACTIVITY_WINDOW_MS > now ? nextAtMs - LIVE_ACTIVITY_WINDOW_MS
        : nextAtMs + 1000;
    return Math.max(1000, boundary - now);
  });

  useEffect(() => {
    if (!loaded || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = (state = AppState.currentState) => {
      clearTimeout(timer);
      timer = undefined;
      const foreground = state === 'active';
      const delay = reconcile(foreground);
      if (foreground) timer = setTimeout(() => refresh('active'), delay);
    };
    refresh();
    const subscription = AppState.addEventListener('change', refresh);
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [loaded, key, zone]);
}
