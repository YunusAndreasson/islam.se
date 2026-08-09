// Pushes the prayer timeline to the native home-screen widget. The app is the only
// thing that knows the user's settings + location, so it computes a multi-day timeline
// and hands it to WidgetKit; the system then renders each entry at its scheduled
// instant with no background JS (see ./timeline.ts). Called on launch, on every
// foreground, and whenever settings, appearance or location change (app/_layout.tsx →
// WidgetSync, keyed on widgetSignature).
import { Platform } from 'react-native';

import type { LatLng } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import { buildTimeline } from './timeline';

/**
 * Reconcile the iOS widget with the current settings + location. Best-effort and
 * idempotent: platform-guarded (Android has no widget target yet) and fully wrapped
 * so a refresh failure (no widget extension in this build, WidgetKit unavailable)
 * can never crash the app.
 */
export async function syncPrayerWidget(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
): Promise<void> {
  // Android widget support is a planned follow-up (react-native-android-widget reuses
  // this same buildTimeline core). Until then this is an iOS-only no-op elsewhere.
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
