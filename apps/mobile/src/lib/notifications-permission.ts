// The master reminders switch, and everything that has to happen around it.
//
// Lifted out of (settings)/installningar so the introduction's notification step drives
// the identical flow. Duplicating it was not an option: iOS grants exactly ONE
// notification prompt per install, and the rules for spending it well — ask only under a
// finger, enable the setting only on a full grant, re-read the permission when the app comes
// back from system settings, and treat any non-grant while the toggle is on as "blocked"
// — are the accumulated result of getting each of them wrong once. Two copies would
// drift, and the drift would be invisible until a user's reminders silently died.
import { uuid } from 'expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { clearReminderDraft } from './first-run';
import { setReminderOrigin } from './analytics/return-setup';
import { ANALYTICS_EVENTS, analytics, type PermissionSource } from '@/lib/analytics';
import { storage } from '@/lib/storage';
import { hapticWarning } from '@/lib/haptics';
import { markRemindersDisabled, noteNotificationResolved, recordReminderDenial, REMINDERS_DECLINED_KEY } from '@/lib/notification-hint';
import {
  type ExactAlarmState,
  getExactAlarmState,
  getNotificationPermissionState,
  type NotificationPermissionState,
  requestNotificationPermission,
} from '@/lib/notifications';
import type { NotificationSettings } from '@/lib/settings/types';
import { useSettings } from '@/lib/settings/context';
import { notificationsBlockedMessage } from '@/lib/system-settings';

// Reminders are one shared preference, even when the control moves between
// introduction, map hint and settings. An older screen's pending OS answer must
// never replace a choice made in a newer screen.
let notificationPreferenceIntent = 0;
export function beginNotificationPreferenceIntent(): () => boolean {
  const intent = ++notificationPreferenceIntent;
  return () => intent === notificationPreferenceIntent;
}

export interface NotificationPermissionControl {
  /** Latest read of the OS state. 'unknown' until the first check lands. */
  permission: NotificationPermissionState;
  /** Reminders are ON but the OS will not deliver them — the recovery state. */
  blocked: boolean;
  /** The section footnote that matches the current state, or undefined when reminders
   *  are off (there is nothing to explain yet). */
  footnote: string | undefined;
  /** Flip the master switch. Turning it ON fires the OS prompt under the finger and
   *  resolves before the setting is written. Returns the OS's answer so a caller that
   *  wants to react (the intro reveals its per-prayer list on a grant) can.
   *  Returns null when switched off or superseded by a newer toggle. `source` is the
   *  surface the switch is on, for analytics. */
  setEnabled: (
    enabled: boolean,
    source: Exclude<PermissionSource, 'qibla'>,
    selection?: NotificationSettings,
    current?: () => boolean,
  ) => Promise<NotificationPermissionState | null>;
}

/**
 * @param active Whether the owning screen is on-screen. The permission re-read is paused
 * when false, matching the settings screen's `useIsFocused()` gate — a backgrounded
 * sheet has no reason to poll. Defaults to true for callers that are always visible.
 */
export function useNotificationPermission(active = true, readWhileDisabled = false, readPermission = getNotificationPermissionState): NotificationPermissionControl {
  const { settings, update } = useSettings();
  const [permission, setPermission] = useState<NotificationPermissionState>('unknown');
  const enabled = settings.notifications.enabled;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Re-read on focus and on every return to the foreground: the user may have just walked
  // out to system settings to allow notifications, and the status row has to catch up
  // without them having to toggle anything.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const refreshPermission = (): void => {
      void (async () => {
        if (!readWhileDisabled && !enabled && !(await storage.getItem(REMINDERS_DECLINED_KEY))) return;
        const state = await readPermission();
        if (alive) setPermission(state);
      })().catch(() => undefined);
    };
    refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [active, enabled, readWhileDisabled, readPermission]);

  const setEnabled = useCallback(
    async (next: boolean, source: Exclude<PermissionSource, 'qibla'>, selection?: NotificationSettings, current?: () => boolean): Promise<NotificationPermissionState | null> => {
      const isLatestIntent = beginNotificationPreferenceIntent();
      if (!next) {
        void clearReminderDraft();
        void markRemindersDisabled();
        const reminderOptOutId = uuid.v4();
        update((prev) => ({ reminderOptOutId, notifications: { ...prev.notifications, enabled: false } }));
        void analytics.track(ANALYTICS_EVENTS.REMINDERS_TOGGLED, { enabled: false, source });
        return null;
      }
      // Asked right here, awaited under the finger — one of only two places in the app
      // that fires the notification prompt (the other is the map's notification hint).
      // syncPrayerNotifications deliberately never asks: it runs on every foreground, so
      // prompting from it would spend iOS's single lifetime dialog with no tap behind it.
      const state = await requestNotificationPermission(source);
      // An off tap must win even when the earlier OS prompt answers later.
      if (!isLatestIntent() || (current && !current())) return null;
      // The reader has answered the reminders question here, so the map's soft-ask card
      // has nothing left to offer them — the same record the card and the introduction
      // write. It matters most on Android, where an OS that grants notifications by default
      // makes the card offer itself to anyone with reminders off (see lib/notification-hint):
      // without this, switching reminders off in Inställningar would earn a card asking to
      // switch them back on.
      if (state === 'denied' || state === 'granted') void noteNotificationResolved();
      if (mounted.current) setPermission(state);
      if (state === 'granted') {
        void setReminderOrigin(source === 'first_reading' ? 'first_reading' : source.startsWith('settings') ? 'settings' : 'other');
        update((prev) => ({ notifications: { ...(selection ?? prev.notifications), enabled: true } }));
        void analytics.track(ANALYTICS_EVENTS.REMINDERS_TOGGLED, { enabled: true, source });
      } else if (state === 'denied') {
        update(prev => ({ notifications: { ...prev.notifications, enabled: false } }));
        await recordReminderDenial();
        if (mounted.current) hapticWarning();
      }
      return state;
    },
    // `settings` is deliberately absent: both writes are functional patches that read the
    // latest state themselves, so this callback no longer goes stale when a notification
    // sub-setting changes — and no longer churns identity on every one.
    [update],
  );

  // Older installs may lack the Android prompt marker. While the switch is on,
  // either non-granted state needs the recovery link.
  const blocked = permission === 'denied' || (enabled && permission === 'undetermined');
  const footnote = blocked ? notificationsBlockedMessage() : undefined;

  return { permission, blocked, footnote, setEnabled };
}

/**
 * Android's exact-alarm permission, kept current the way the notification permission is:
 * re-read on focus and on every return to the foreground, because the reader may have just
 * come back from the system page that grants it. 'unknown' until the first read lands.
 *
 * @param active Whether the owning screen is on-screen; the re-read pauses when false.
 */
export function useExactAlarmPermission(active = true): ExactAlarmState {
  const [state, setState] = useState<ExactAlarmState>('unknown');
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const refresh = (): void => {
      void getExactAlarmState().then((next) => {
        if (alive) setState(next);
      });
    };
    refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [active]);
  return state;
}
