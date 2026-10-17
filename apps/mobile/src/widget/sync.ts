// Pushes the prayer timeline to the native home-screen widget. The app is the only
// thing that knows the user's settings + location, so it computes a multi-day timeline
// and hands it over: on iOS to WidgetKit, which renders each entry at its scheduled
// instant with no background JS (see ./timeline.ts); on Android as one snapshot whose
// layout picks the entry in force each time it renders (see ./android-snapshot.ts).
// Called on launch, on every foreground, whenever settings, appearance or location change
// (app/_layout.tsx → WidgetSync, keyed on widgetSignature), and from the background task.
import { Platform } from 'react-native';

import type { LatLng } from '@/lib/prayer-times';
import { widgetSignature } from '@/lib/settings/compute-signature';
import type { PrayerSettings } from '@/lib/settings/types';
import { getDisplayZone } from '@/lib/zone-time';
import { buildAndroidSnapshot, selectEntry, type AndroidWidgetSnapshot } from './android-snapshot';
import { buildTimeline, type WidgetTimelineEntry } from './timeline';

/** Replenish the five-day horizon at most once per quarter-hour for unchanged inputs. */
export const WIDGET_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

interface WidgetLoaders {
  ios(): Promise<{ updateTimeline(entries: WidgetTimelineEntry[]): void }>;
  android(): Promise<{ updateSnapshot(snapshot: AndroidWidgetSnapshot): void; reload(): void }>;
}

/** Each coordinator owns session-local state; cold starts always push a fresh schedule.
 * Loaders keep native imports deferred and let tests exercise the real sync path. */
export function createPrayerWidgetSync(loaders: WidgetLoaders) {
  let applied: {
    key: string;
    at: number;
    snapshot?: AndroidWidgetSnapshot;
    renderedEntryAt?: number;
  } | undefined;
  let queue: Promise<void> = Promise.resolve();

  return function sync(
    coords: LatLng,
    settings: PrayerSettings,
    location: string,
    now: number = Date.now(),
  ): Promise<void> {
    // Serialize imports and writes as well as the cache check. Concurrent foreground,
    // settings and background syncs otherwise all see an empty cache and push at once.
    const run = queue.then(async () => {
      try {
        const platform = Platform.OS;
        if (platform !== 'ios' && platform !== 'android') return;
        const inputKey = () => JSON.stringify([
          platform, coords.latitude, coords.longitude, location,
          widgetSignature(settings), getDisplayZone(),
        ]);
        const key = inputKey();
        const age = applied ? now - applied.at : -1;
        if (applied?.key === key && age >= 0 && age < WIDGET_REFRESH_INTERVAL_MS) {
          if (platform === 'android' && applied.snapshot) {
            const entryAt = selectEntry(applied.snapshot, now)?.fromMs;
            if (entryAt !== applied.renderedEntryAt) {
              const widget = await loaders.android();
              widget.reload();
              applied.renderedEntryAt = entryAt;
            }
          }
          return;
        }

        if (platform === 'android') {
          const widget = await loaders.android();
          const snapshot = buildAndroidSnapshot(coords, settings, location, now);
          widget.updateSnapshot(snapshot);
          applied = { key: inputKey(), at: now, snapshot, renderedEntryAt: selectEntry(snapshot, now)?.fromMs };
        } else {
          const widget = await loaders.ios();
          const entries = buildTimeline(coords, settings, location, now);
          if (entries.length === 0) return;
          // One timeline push: updateSnapshot on iOS would overwrite it and spend
          // another reload request. Its first entry already represents `now`.
          widget.updateTimeline(entries);
          applied = { key: inputKey(), at: now };
        }
      } catch {
        // Cache only successful writes. Import/build/native failures remain retryable
        // on the next call and must never poison the queue or escape to the app.
      }
    });
    queue = run;
    return run;
  };
}

const syncWidget = createPrayerWidgetSync({
  ios: async () => (await import('../widgets/PrayerTimesWidget')).default,
  android: async () => (await import('../widgets/PrayerTimesWidgetAndroid')).default,
});

/**
 * Reconcile the home-screen widget with the current settings + location. Best-effort and
 * idempotent: fully wrapped so a refresh failure (no widget in this build, WidgetKit or
 * Glance unavailable) can never crash the app.
 */
export async function syncPrayerWidget(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
): Promise<void> {
  await syncWidget(coords, settings, location, now);
}

/**
 * Android: re-render the widget from the snapshot it already holds, so "next prayer" is
 * recomputed for the moment the reader lands on the home screen. Cheap — no timeline is
 * built — which is why it can run on every trip out of the app. A no-op elsewhere: WidgetKit
 * swaps timeline entries on its own.
 */
export async function reloadPrayerWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const { default: PrayerTimesWidgetAndroid } = await import('../widgets/PrayerTimesWidgetAndroid');
    PrayerTimesWidgetAndroid.reload();
  } catch {
    // As above.
  }
}
