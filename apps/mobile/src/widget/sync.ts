// Pushes the prayer timeline to the native home-screen widget. The app is the only
// thing that knows the user's settings + location, so it computes a multi-day timeline
// and hands it over: on iOS to WidgetKit, which renders each entry at its scheduled
// instant with no background JS (see ./timeline.ts); on Android as one snapshot whose
// layout picks the entry in force each time it renders (see ./android-snapshot.ts).
// Called on launch, on every foreground, whenever settings, appearance or location change
// (app/_layout.tsx → WidgetSync, keyed on widgetSignature), and from the background task.
import { Platform } from 'react-native';

import type { LatLng } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import { buildAndroidSnapshot } from './android-snapshot';
import { buildTimeline } from './timeline';

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
  if (Platform.OS === 'android') {
    try {
      // The Android layout under the same widget name — never imported on iOS, where it
      // would overwrite the SwiftUI layout (see the header of that file).
      const { default: PrayerTimesWidgetAndroid } = await import('../widgets/PrayerTimesWidgetAndroid');
      // updateSnapshot stores the props and re-renders every placed instance at once.
      PrayerTimesWidgetAndroid.updateSnapshot(buildAndroidSnapshot(coords, settings, location, now));
    } catch {
      // No widget in this build, or Glance unavailable — nothing the user can act on.
    }
    return;
  }
  if (Platform.OS !== 'ios') return;
  try {
    // Deferred import so the WidgetKit module (and @expo/ui native bindings) is never
    // evaluated on a platform/build without the widget extension.
    const { default: PrayerTimesWidget } = await import('../widgets/PrayerTimesWidget');
    const entries = buildTimeline(coords, settings, location, now);
    if (entries.length === 0) return;
    // ONE push, deliberately. expo-widgets' updateSnapshot(props) is not a separate
    // "show this now" channel — it is updateTimeline([{ now, props }]), i.e. it
    // OVERWRITES the stored timeline with a single entry and fires its own
    // WidgetCenter.reloadTimelines. Calling it before updateTimeline therefore bought
    // nothing (buildTimeline's first entry is already `now`) and cost a second reload
    // request per foreground, which WidgetKit is free to coalesce or defer — it
    // imposes a ~5 minute floor between reloads of the same widget.
    PrayerTimesWidget.updateTimeline(entries);
  } catch {
    // No widget extension or WidgetKit unavailable — nothing the user can act on.
  }
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
