// Pushes the prayer timeline to the native home-screen widget. The app is the only
// thing that knows the user's settings + location, so it computes a multi-day timeline
// and hands it over to WidgetKit or the Android provider. Both advance the
// schedule while the React Native process is suspended.
// Called on launch, on every foreground, whenever settings, appearance or location change
// (app/_layout.tsx → WidgetSync, keyed on widgetSignature), and from the background task.
import type { Widget } from 'expo-widgets';
import { Platform } from 'react-native';

import type { LatLng } from '@/lib/prayer-times';
import { widgetSignature } from '@/lib/settings/compute-signature';
import type { PrayerSettings } from '@/lib/settings/types';
import { getDisplayZone } from '@/lib/zone-time';
import { buildAndroidSnapshot, selectEntry, type AndroidWidgetSnapshot } from './android-snapshot';
import type { WidgetPayload } from './payload';
import { buildTimeline } from './timeline';

/**
 * Drop every `null` from a timeline before it crosses to WidgetKit.
 *
 * expo-widgets turns a JS `null` into `NSNull` and stores the timeline with
 * `UserDefaults.set`, which accepts property-list values only, and `NSNull` is not one.
 * The whole write was lost (dropped, or thrown and swallowed by the catch below).
 * Bug pinned here: from 2026-10-18 the terminal expiry entry carried `nextAtMs: null`,
 * so NO timeline reached the widget. It sat on the last schedule written before
 * that, and its relative countdown counted UP from a long-passed Fajr ("2 dagar").
 * The layout reads every field with a typeof guard, so an absent key renders exactly
 * as `null` did.
 */
export function toPropertyList<T>(value: T): T {
  if (Array.isArray(value)) return value.map(toPropertyList) as T;
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== null && item !== undefined) out[key] = toPropertyList(item);
  }
  return out as T;
}

/** Replenish the five-day horizon at most once per quarter-hour for unchanged inputs. */
export const WIDGET_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

interface WidgetLoaders {
  ios(): Promise<Pick<Widget<WidgetPayload>, 'updateTimeline'>>;
  android(): Promise<{
    updateSnapshot(snapshot: AndroidWidgetSnapshot): void | Promise<void>;
    reload(): void | Promise<void>;
  }>;
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
              await widget.reload();
              applied.renderedEntryAt = entryAt;
            }
          }
          return;
        }

        if (platform === 'android') {
          const widget = await loaders.android();
          const snapshotKey = inputKey();
          const snapshot = buildAndroidSnapshot(coords, settings, location, now);
          await widget.updateSnapshot(snapshot);
          applied = { key: snapshotKey, at: now, snapshot, renderedEntryAt: selectEntry(snapshot, now)?.fromMs };
        } else {
          const widget = await loaders.ios();
          const entries = buildTimeline(coords, settings, location, now);
          if (entries.length === 0) return;
          // One timeline push: updateSnapshot on iOS would overwrite it and spend
          // another reload request. Its first entry already represents `now`.
          widget.updateTimeline(toPropertyList(entries));
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
  android: async () => (await import('./placement')).androidPrayerWidget(),
});

/**
 * Reconcile the home-screen widget with the current settings + location. Best-effort and
 * idempotent: a native refresh failure cannot crash the app.
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
    const { androidPrayerWidget } = await import('./placement');
    await androidPrayerWidget().reload();
  } catch {
    // As above.
  }
}
