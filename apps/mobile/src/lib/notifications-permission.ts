// The master reminders switch, and everything that has to happen around it.
//
// Lifted out of (settings)/installningar so the introduction's notification step drives
// the identical flow. Duplicating it was not an option: iOS grants exactly ONE
// notification prompt per install, and the rules for spending it well — ask only under a
// finger, enable the setting on either answer, re-read the permission when the app comes
// back from system settings, and treat any non-grant while the toggle is on as "blocked"
// — are the accumulated result of getting each of them wrong once. Two copies would
// drift, and the drift would be invisible until a user's reminders silently died.
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { hapticWarning } from '@/lib/haptics';
import {
  getNotificationPermissionState,
  type NotificationPermissionState,
  requestNotificationPermission,
} from '@/lib/notifications';
import { useSettings } from '@/lib/settings/context';
import { systemSettingsName } from '@/lib/system-settings';

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
   *  wants to react (the intro reveals its per-prayer list on a grant) can. */
  setEnabled: (enabled: boolean) => Promise<NotificationPermissionState | null>;
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
    async (next: boolean): Promise<NotificationPermissionState | null> => {
      if (!next) {
        update({ notifications: { ...settings.notifications, enabled: false } });
        return null;
      }
      // Asked right here, awaited under the finger — one of only two places in the app
      // that fires the notification prompt (the other is the map's notification hint).
      // syncPrayerNotifications deliberately never asks: it runs on every foreground, so
      // prompting from it would spend iOS's single lifetime dialog with no tap behind it.
      const state = await requestNotificationPermission();
      setPermission(state);
      // Enable either way. On a refusal that is not a lie — it is what makes the status
      // row and the "Öppna …" recovery link appear, and it means a user who later allows
      // notifications in system settings starts receiving them on the next sync.
      update({ notifications: { ...settings.notifications, enabled: true } });
      // A discrete negative outcome the user just triggered — the haptics policy's
      // warning case. ANY answer that is not a grant counts: on Android the first refusal
      // leaves canAskAgain true, so it arrives as 'undetermined' even though the user
      // just said no.
      if (state !== 'granted') hapticWarning();
      return state;
    },
    [settings.notifications, update],
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
      ? `Notiser är blockerade. Öppna ${systemSettingsName()} för att tillåta dem.`
      : permission === 'granted'
        ? 'Planeras lokalt på din enhet – inget skickas online.'
        : undefined;

  return { permission, blocked, footnote, setEnabled };
}
