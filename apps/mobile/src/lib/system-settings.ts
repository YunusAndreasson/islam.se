import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

/** User-facing name for the OS-owned settings surface. */
export const systemSettingsName = (): string =>
  Platform.OS === 'ios' ? 'iOS-inställningar' : 'appinställningar';

// Seven places in the app hand the reader over to the OS: the Plats and Notiser sections
// of Inställningar, the Qibla screen, both map hint cards, and both introduction steps.
// They render in four different vocabularies (a settings-card row, a card link, an intro
// link) and should keep doing so — the layout belongs to the surface. What must never
// drift is the destination and the words: seven copies of `Linking.openSettings()` and
// seven hand-written `Öppna ${systemSettingsName()}` is seven chances for one of them to
// say something the others don't.
//
// The four PLATS hand-offs go to openSystemSettings below; the three NOTISER ones go to
// openNotificationSettings, which is the same page on iOS and the channel list on Android
// (see the block at the bottom of this file for why that distinction earns its keep).
/** Open this app's page in the OS settings. Never throws. */
export const openSystemSettings = (): void => {
  void Linking.openSettings();
};

/** The visible label on every control that leads there. */
export const openSystemSettingsLabel = (): string => `Öppna ${systemSettingsName()}`;

/**
 * The spoken label. `reason` names what the reader is going there to allow — "plats",
 * "notiser" — so a screen reader announces the destination AND the purpose, which the
 * visible label leaves to context.
 */
export const openSystemSettingsA11yLabel = (reason: string): string =>
  `${openSystemSettingsLabel()} för ${reason}`;

// ── The two destinations that are not "this app's settings page" ─────────────────────────
//
// `Linking.openSettings()` is the right answer for a permission, because on both platforms
// a permission lives on the app's own settings page. Two of the things that stop a prayer
// alert from arriving do not.
//
// Both are Android-only, and both are handed to the OS through an intent because there is
// no cross-platform API for either. iOS has neither problem — notification categories are
// not user-mutable the way Android channels are, and there is no per-app battery
// exemption — so on iOS both fall back to the app's settings page, which is where an iOS
// reader's answer actually is.

/**
 * The app's NOTIFICATION CATEGORIES, not its permission.
 *
 * On Android a sound choice IS a channel (a channel's sound is frozen at creation — see
 * channelIdFor in ./notifications), and a reader can mute or silence an individual channel
 * from the system UI without touching the app's notification permission. When that happens
 * the app looks entirely correct: the permission reads granted, Påminnelser shows the
 * prayer switched on, and nothing arrives. The app cannot un-mute a channel — only the
 * reader can, on this screen.
 */
export const openNotificationSettings = (): void => {
  if (Platform.OS !== 'android') {
    openSystemSettings();
    return;
  }
  void IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS, {
    // The extra is how the intent is told WHICH app; without it this opens the global
    // notification settings and the reader has to find us in a list of everything.
    extra: { 'android.provider.extra.APP_PACKAGE': Application.applicationId },
  }).catch(() => {
    // A device whose ROM does not answer this intent still has the generic page.
    openSystemSettings();
  });
};

/**
 * The battery-optimisation exemption list.
 *
 * Prayer alerts are exact alarms (the app holds USE_EXACT_ALARM), and on a stock Android
 * that is enough. It is not enough on the OEM skins a lot of readers are on — Samsung,
 * Xiaomi, Huawei and friends put an app that is rarely opened into a deep sleep that drops
 * its alarms, which for this app means the alert is simply late or absent with no error
 * anywhere. Exempting the app is the fix, and only the reader can grant it.
 *
 * IGNORE_BATTERY_OPTIMIZATION_SETTINGS (the list) rather than
 * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (the one-tap dialog) on purpose: the dialog needs a
 * permission whose use Google Play restricts to apps that can justify it, and being turned
 * down at review is a worse outcome than one extra tap.
 */
export const openBatteryOptimizationSettings = (): void => {
  if (Platform.OS !== 'android') {
    openSystemSettings();
    return;
  }
  void IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
  ).catch(() => {
    openSystemSettings();
  });
};

/**
 * Android's "Alarm och påminnelser" page for this app — where exact alarms are allowed.
 *
 * Only ever offered when the permission is DENIED, which in practice means Android 12/12L
 * after the reader revoked it (13+ grants it for good to an app declaring USE_EXACT_ALARM).
 * Without it every alert falls back to an inexact alarm that Doze is free to defer.
 * expo-notifications opens the page for this package and resolves on return; it rejects
 * only if SCHEDULE_EXACT_ALARM is undeclared, and then the app's own settings page is the
 * nearest honest destination.
 */
export const openExactAlarmSettings = (): void => {
  if (Platform.OS !== 'android') {
    openSystemSettings();
    return;
  }
  void Notifications.requestExactAlarmPermissionsAsync().catch(() => {
    openSystemSettings();
  });
};
