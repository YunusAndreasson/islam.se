// The master reminders switch, and everything that has to happen around it.
//
// Lifted out of (settings)/installningar so the introduction's notification step drives
// the identical flow. Duplicating it was not an option: iOS grants exactly ONE
// notification prompt per install, and the rules for spending it well — ask only under a
// finger, enable the setting on either answer, re-read the permission when the app comes
// back from system settings, and treat any non-grant while the toggle is on as "blocked"
// — are the accumulated result of getting each of them wrong once. Two copies would
// drift, and the drift would be invisible until a user's reminders silently died.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ANALYTICS_EVENTS, analytics, type PermissionSource } from '@/lib/analytics';
import { hapticWarning } from '@/lib/haptics';
import { noteNotificationResolved } from '@/lib/notification-hint';
import {
  type ExactAlarmState,
  getExactAlarmState,
  getNotificationPermissionState,
  type NotificationPermissionState,
  requestNotificationPermission,
} from '@/lib/notifications';
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
  ) => Promise<NotificationPermissionState | null>;
}

/**
 * @param active Whether the owning screen is on-screen. The permission re-read is paused
 * when false, matching the settings screen's `useIsFocused()` gate — a backgrounded
 * sheet has no reason to poll. Defaults to true for callers that are always visible.
 */
export function useNotificationPermission(active = true): NotificationPermissionControl {
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
    if (!active || !enabled) return;
    let alive = true;
    const refreshPermission = (): void => {
      void getNotificationPermissionState().then((state) => {
        if (alive) setPermission(state);
      });
    };
    refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [active, enabled]);

  const setEnabled = useCallback(
    async (next: boolean, source: Exclude<PermissionSource, 'qibla'>): Promise<NotificationPermissionState | null> => {
      const isLatestIntent = beginNotificationPreferenceIntent();
      if (!next) {
        update((prev) => ({ notifications: { ...prev.notifications, enabled: false } }));
        void analytics.track(ANALYTICS_EVENTS.REMINDERS_TOGGLED, { enabled: false, source });
        return null;
      }
      // Asked right here, awaited under the finger — one of only two places in the app
      // that fires the notification prompt (the other is the map's notification hint).
      // syncPrayerNotifications deliberately never asks: it runs on every foreground, so
      // prompting from it would spend iOS's single lifetime dialog with no tap behind it.
      const state = await requestNotificationPermission(source);
      // An off tap must win even when the earlier OS prompt answers later.
      if (!isLatestIntent()) return null;
      // The reader has answered the reminders question here, so the map's soft-ask card
      // has nothing left to offer them — the same record the card and the introduction
      // write. It matters most on Android, where an OS that grants notifications by default
      // makes the card offer itself to anyone with reminders off (see lib/notification-hint):
      // without this, switching reminders off in Inställningar would earn a card asking to
      // switch them back on.
      void noteNotificationResolved();
      if (mounted.current) setPermission(state);
      // Enable either way. On a refusal that is not a lie — it is what makes the status
      // row and the "Öppna …" recovery link appear, and it means a user who later allows
      // notifications in system settings starts receiving them on the next sync.
      // Functional: the OS dialog was up while this callback was suspended, so the
      // `settings` this closure captured is from before the await. Spreading it would
      // write back whatever the notification sub-settings were then.
      update((prev) => ({ notifications: { ...prev.notifications, enabled: true } }));
      void analytics.track(ANALYTICS_EVENTS.REMINDERS_TOGGLED, { enabled: true, source });
      // A discrete negative outcome the user just triggered — the haptics policy's
      // warning case. ANY answer that is not a grant counts: on Android the first refusal
      // leaves canAskAgain true, so it arrives as 'undetermined' even though the user
      // just said no.
      if (mounted.current && state !== 'granted') hapticWarning();
      return state;
    },
    // `settings` is deliberately absent: both writes are functional patches that read the
    // latest state themselves, so this callback no longer goes stale when a notification
    // sub-setting changes — and no longer churns identity on every one.
    [update],
  );

  // Android's FIRST refusal leaves canAskAgain true — which reads as 'undetermined' — and
  // yet nothing will ever ask again: the toggle is already on, so the prompt's only two
  // entry points (this switch flipping off→on, and the map's hint) are both spent.
  // Reporting that as "Ej frågat" promised a dialog that never comes and hid the recovery
  // link, leaving reminders silently dead. Any non-grant while the toggle is on is
  // therefore "blocked".
  const blocked = enabled && (permission === 'denied' || permission === 'undetermined');
  const footnote = !enabled
    ? undefined
    : blocked
      ? notificationsBlockedMessage()
      : undefined;

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
