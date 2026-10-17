// Quiet Android counterpart to the iOS Live Activity. The system removes it at
// the prayer instant, including while JS is suspended. Existing reminders stay
// separate and retain their own sound, delivery and pending-request budgets.
import type { CustomNotificationFactory } from 'expo-widgets';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getNotificationPermissionState, isAlertEnabled } from '@/lib/notifications';
import type { LatLng } from '@/lib/prayer-times';
import type { PrayerSettings } from '@/lib/settings/types';
import type { PrayerActivityProps } from '@/widgets/PrayerLiveActivity';
import { buildPrayerActivityProps } from './live-activity';
import { buildPayloadAt } from './payload';

const NOTIFICATION_ID = 'prayer-upcoming';
const CHANNEL_ID = 'prayer-upcoming-v1';
type NotificationApi = Pick<CustomNotificationFactory<PrayerActivityProps>, 'get' | 'post' | 'cancelAll'>;
let queue: Promise<void> = Promise.resolve();
let appliedKey: string | null = null;
let channelCreated = false;
let syncGeneration = 0;

export function resetOngoingNotificationForTests(): void {
  queue = Promise.resolve();
  appliedKey = null;
  channelCreated = false;
  syncGeneration = 0;
}

/** Serialise foreground/settings/background refreshes so an older post cannot
 * survive a newer cancellation. The stable ID also replaces across cold starts. */
export function applyOngoingPrayerNotification(
  api: NotificationApi,
  props: PrayerActivityProps | null,
  now: () => number = Date.now,
): Promise<void> {
  const run = queue.then(async () => {
    if (!props || props.nextAtMs <= now()) {
      await api.cancelAll();
      appliedKey = null;
      return;
    }
    const existing = await api.get(NOTIFICATION_ID);
    const key = JSON.stringify(props);
    if (existing && key === appliedKey) return;
    // Native lookup can take us across the prayer boundary.
    const remaining = props.nextAtMs - now();
    if (remaining <= 0) {
      await api.cancelAll();
      appliedKey = null;
      return;
    }
    await api.post(props, {
      id: NOTIFICATION_ID,
      channelId: CHANNEL_ID,
      ongoing: true,
      alertOnlyOnce: true,
      autoCancel: false,
      timeoutAfter: remaining,
      title: `${props.isMarker ? 'Nästa tid' : 'Nästa bön'}: ${props.nextArabic}`,
      text: `${props.nextTime} · ${props.nextSwedish}`,
    });
    appliedKey = key;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function syncAndroidPrayerNotification(
  coords: LatLng,
  settings: PrayerSettings,
  location: string,
  now: number = Date.now(),
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const generation = ++syncGeneration;
  try {
    const { default: api } = await import('../widgets/PrayerOngoingNotification');
    let props: PrayerActivityProps | null = null;
    if (settings.notifications.enabled && await getNotificationPermissionState() === 'granted') {
      const payload = buildPayloadAt(coords, settings, now, location);
      const following = payload.nextAtMs == null ? null
        : buildPayloadAt(coords, settings, payload.nextAtMs + 1, location);
      props = buildPrayerActivityProps(payload, now, following);
      if (props && !isAlertEnabled(settings.notifications, props.nextKey)) props = null;
    }
    if (props && !channelCreated) {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Nästa bön',
        description: 'Nästa bönetid visas tyst tills tiden är inne.',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        showBadge: false,
      });
      channelCreated = true;
    }
    if (generation !== syncGeneration) return;
    await applyOngoingPrayerNotification(api, props);
  } catch {
    // Missing native support or revoked permission must never affect prayer alerts.
  }
}
