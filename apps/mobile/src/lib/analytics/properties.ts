// What the analytics events and super properties say, as pure functions of app state.
//
// Kept apart from the hooks that send them so the one thing worth proving about each value
// (that it is coarse: an enum, a count or a flag, and never a place, a method or a madhab;
// see ./events) is testable without React, storage or the OS.
import type { IntroHistory } from '@/lib/intro';
import type { LocationSource } from '@/lib/location/resolve';
import {
  alertsPerDay,
  isAlertEnabled,
  NOTIFY_PRAYERS,
  type NotificationPermissionState,
} from '@/lib/notifications';
import { PRAYER_ORDER } from '@/lib/prayer-times';
import {
  type NotificationSettings,
  type NotificationSoundKey,
  PRAYER_SLOT_KEYS,
  type PrayerSlotKey,
} from '@/lib/settings/types';

import type { RemindersState, SuperProperties } from './events';

/** Reminders as the reader experiences them: off, on, or on but refused by the OS (the
 *  setting turns on whatever the OS answers; see lib/notifications-permission). */
export function remindersState(
  enabled: boolean,
  permission: NotificationPermissionState,
): RemindersState {
  if (!enabled) return 'off';
  return permission === 'granted' ? 'on' : 'blocked';
}

/** At least one reminder that will actually fire plays the adhan. False in a build with no
 *  adhan file: the choice then degrades to the system sound (lib/notifications). */
export function usesAdhan(n: NotificationSettings, adhanPlayable: boolean): boolean {
  if (!adhanPlayable || !n.enabled) return false;
  if (n.lastThird && n.lastThirdSound === 'adhan') return true;
  return PRAYER_ORDER.some((key) => isAlertEnabled(n, key) && n.sound[key] === 'adhan');
}

export interface SuperPropertyInputs {
  notifications: NotificationSettings;
  permission: NotificationPermissionState;
  locationSource: LocationSource;
  /** null while it is not known yet (a fresh install still in the introduction). */
  introHistory: IntroHistory | null;
  adhanPlayable: boolean;
}

/** The super properties that follow app state. install_date and install_kind are
 *  registered once, by First Open, and are not here. */
export function superPropertiesFor(i: SuperPropertyInputs): Partial<SuperProperties> {
  const n = i.notifications;
  return {
    notifications_enabled: remindersState(n.enabled, i.permission) === 'on',
    reminders_per_day: n.enabled ? alertsPerDay(n) : 0,
    adhan_sound: usesAdhan(n, i.adhanPlayable),
    location_source: i.locationSource,
    ...(i.introHistory ? { intro_status: i.introHistory } : {}),
  };
}

/** The device-calendar day of `date`, YYYY-MM-DD. Local rather than UTC: an install at
 *  00:30 in Stockholm belongs to that day, not the one before. */
export function isoDay(date: Date): string {
  const pad = (v: number): string => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type NotificationSettingName =
  | 'prayer'
  | 'lead'
  | 'sound'
  | 'fajr_window_end'
  | 'last_third'
  | 'last_third_sound'
  | 'alarm_clock';

export interface NotificationSettingChange {
  setting: NotificationSettingName;
  /** The slot the change is for, 'all' when one control changed several (the "Gäller alla"
   *  rows), absent for the setting that belongs to no slot (alarm_clock). */
  prayer?: PrayerSlotKey | 'lastThird' | 'all';
  /** On/off, minutes of lead, or a sound key. Never anything else. */
  value: boolean | number | NotificationSoundKey;
}

/**
 * What one write under Inställningar → Notiser changed, as Notification Settings Changed
 * events. One control writes one patch, so this is normally one entry; a "Gäller alla"
 * control that changed several slots at once is ONE entry with `prayer: 'all'`. The master
 * switch is Reminders Toggled, not this.
 */
export function notificationSettingChanges(
  prev: NotificationSettings,
  next: NotificationSettings,
): NotificationSettingChange[] {
  const out: NotificationSettingChange[] = [];
  const perSlot = <K extends PrayerSlotKey, V extends boolean | number | NotificationSoundKey>(
    setting: NotificationSettingName,
    keys: readonly K[],
    before: Record<K, V>,
    after: Record<K, V>,
  ): void => {
    const changed = keys.filter((key) => before[key] !== after[key]);
    const firstKey = changed[0];
    if (firstKey === undefined) return;
    out.push({ setting, prayer: changed.length > 1 ? 'all' : firstKey, value: after[firstKey] });
  };
  perSlot('prayer', NOTIFY_PRAYERS, prev.prayers, next.prayers);
  perSlot('lead', PRAYER_SLOT_KEYS, prev.lead, next.lead);
  perSlot('sound', PRAYER_SLOT_KEYS, prev.sound, next.sound);
  if (prev.fajrWindowEnd !== next.fajrWindowEnd) {
    out.push({ setting: 'fajr_window_end', prayer: 'sunrise', value: next.fajrWindowEnd });
  }
  if (prev.lastThird !== next.lastThird) {
    out.push({ setting: 'last_third', prayer: 'lastThird', value: next.lastThird });
  }
  if (prev.lastThirdSound !== next.lastThirdSound) {
    out.push({ setting: 'last_third_sound', prayer: 'lastThird', value: next.lastThirdSound });
  }
  if (prev.alarmClock !== next.alarmClock) {
    out.push({ setting: 'alarm_clock', value: next.alarmClock });
  }
  return out;
}
