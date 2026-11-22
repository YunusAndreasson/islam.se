import { refreshDisplayZone } from '@/lib/device-zone';
import { readCachedFix } from '@/lib/location/gps-cache';
import { resolveLocation } from '@/lib/location/resolve';
import { syncPrayerNotifications } from '@/lib/notifications';
import { loadSettings } from '@/lib/settings/store';
import { syncPrayerLiveActivity } from '@/widget/live-activity';
import { syncPrayerWidget } from '@/widget/sync';
import { syncAndroidPrayerNotification } from '@/widget/android-ongoing';

export async function refreshPrayerSurfaces(): Promise<boolean> {
  const settings = await loadSettings();

  // No React, no provider, and no asking the OS for a position — a background wake-up is
  // not a moment to start the GPS. resolveLocation is the same table the app and the
  // widget resolve through, fed from the cached fix, so a background re-schedule lands on
  // the same coordinate and place name the reader last saw on screen.
  const { coords, label } = resolveLocation(
    settings.locationMode,
    settings.manualLocation,
    await readCachedFix(),
  );
  refreshDisplayZone();

  // When reminders are off, reconciliation finishes any cancellation interrupted
  // as the app backgrounded. It never asks permission or creates alerts in that case.
  const alertsReady = await syncPrayerNotifications(coords, settings);

  await syncPrayerWidget(coords, settings, label);
  await syncPrayerLiveActivity(coords, settings, label, Date.now(), { canStart: false });
  await syncAndroidPrayerNotification(coords, settings, label);
  return alertsReady;
}
