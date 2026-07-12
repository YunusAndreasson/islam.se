// Tiny safe wrapper around expo-haptics so call sites stay one-liners and never
// have to think about platform support or rejected promises. Haptics are a
// "nice to have" microinteraction — a device without a taptic engine (most
// Android emulators, web) should silently do nothing, never throw.
//
// THE POLICY — the single source of truth for *when* to buzz. Haptics fire only
// for these four classes of moment, and never otherwise:
//   1. An OUTCOME is reached            → hapticSuccess  (qibla lock, GPS fix confirmed)
//   2. A negative OUTCOME is reached    → hapticWarning  (GPS/permission denied, notifications
//                                          blocked). Only for a discrete failure the user just
//                                          triggered — never for a continuously-flipping state
//                                          (e.g. losing qibla alignment as the phone moves).
//   3. The finger moves through DISCRETE → hapticSelection (scrubber crossing a prayer,
//      VALUES                              scrub-to-prayer, reset-to-now, OptionGroup change,
//                                          picking a city)
//   4. A custom CONTROL SNAPS under      → hapticLight    (dock open/close, scrubber
//      direct manipulation                 grab/release, Stepper step, a command button
//                                           whose result lands synchronously on the tap)
// Explicitly NO haptic for: navigation & dismissal (opening / closing / back on any screen
// or modal — the visual transition is the feedback), expanding/collapsing disclosure or FAQ
// accordions (a content reveal, treated like navigation), and native controls that carry
// their own platform affordance (the Switch in Toggle). Overusing haptics on routine
// transitions drains the signal value of the meaningful ones (Apple HIG).
//
// PLATFORM MAPPING. On iOS the helpers hit the Taptic Engine directly (selection / impact /
// notification generators). On Android, expo-haptics' selectionAsync/impactAsync/
// notificationAsync route through the raw `Vibrator` waveform API — a timed buzz Expo's own
// docs flag as "not recommended". So on Android we use `performAndroidHapticsAsync`, which
// drives the OS's device-tuned semantic haptic engine (View.performHapticFeedback) and needs
// no VIBRATE permission — the Android analogue of iOS's crisp taptics.
//   selection → Clock_Tick,  light → Virtual_Key   (both universal: API 21 / API 5)
//   success   → Confirm,     warning → Reject       (API 30+; below 30 those constants don't
//                                                     exist, so we fall back to the Vibrator
//                                                     notification so Android 7–10 still buzzes)
// Clock_Tick/Virtual_Key are chosen over the semantically-closer but API-34-only Segment_Tick/
// Toggle_* precisely so every supported device (minSdk 24) keeps its feedback.
//
// Every helper is gated by the user's "Haptik" setting via the module-level `enabled`
// flag below — see setHapticsEnabled.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Mirrors the user's `settings.haptics` preference. It's a plain module flag (not a hook
// or context read) because the helpers are called from gesture worklets via scheduleOnRN
// (PrayerDock) and from non-component code, where React context isn't reachable. The
// SettingsProvider pushes the persisted value here whenever it loads/changes (see
// lib/settings/context.tsx). Defaults to on so haptics work during the brief window
// before settings hydrate.
let enabled = true;

/** Sync the user's haptics preference into this module. Called by SettingsProvider. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

// Android ≥ 30 (Android 11) exposes the Confirm/Reject semantic constants; on older devices
// those don't exist and performHapticFeedback would silently no-op, so we fall back to the
// Vibrator-backed notification to keep some feedback. Platform.Version is the SDK_INT integer
// on Android (a version *string* on iOS, which never reaches this branch). Platform.OS is read
// per-call (not cached) to match the rest of the codebase and stay unit-testable.
function androidSemantic(
  type: Haptics.AndroidHaptics,
  fallback: Haptics.NotificationFeedbackType,
): void {
  if ((Platform.Version as number) >= 30) {
    Haptics.performAndroidHapticsAsync(type).catch(() => {});
  } else {
    Haptics.notificationAsync(fallback).catch(() => {});
  }
}

/** A selection tick — the lightest feedback. Use for crossing a landmark
    (scrubber passing a prayer) or confirming a small state change. */
export function hapticSelection(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick).catch(() => {});
  } else {
    Haptics.selectionAsync().catch(() => {});
  }
}

/** A light impact — use for a discrete snap (dock opening/closing, landing a
    tap-to-scrub). Heavier than a selection tick but still subtle. */
export function hapticLight(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key).catch(() => {});
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** A success notification — a small "landed it" cue. Use sparingly for reaching a
    meaningful target (the phone lining up with the qibla, a confirmed GPS fix). */
export function hapticSuccess(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    androidSemantic(Haptics.AndroidHaptics.Confirm, Haptics.NotificationFeedbackType.Success);
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }
}

/** A warning notification — a discrete "that didn't work" cue. Use sparingly for a negative
    outcome the user just triggered (GPS/permission denied, notifications blocked). Never for a
    state that flips on its own (see the policy note above). */
export function hapticWarning(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    androidSemantic(Haptics.AndroidHaptics.Reject, Haptics.NotificationFeedbackType.Warning);
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
}
