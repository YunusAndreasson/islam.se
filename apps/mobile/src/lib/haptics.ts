// Tiny safe wrapper around expo-haptics so call sites stay one-liners and never
// have to think about platform support or rejected promises. Haptics are a
// "nice to have" microinteraction — a device without a taptic engine (most
// Android emulators, web) should silently do nothing, never throw.
//
// THE POLICY — the single source of truth for *when* to buzz. Haptics fire only
// for these four classes of moment, and never otherwise:
//   1. An OUTCOME is reached            → hapticSuccess  (qibla lock, sighting the Moon on
//                                          Månen's sky dial, GPS fix confirmed, finishing
//                                          the introduction)
//   2. A negative OUTCOME is reached    → hapticWarning  (GPS/permission denied, notifications
//                                          blocked). Only for a discrete failure the user just
//                                          triggered — never for a continuously-flipping state
//                                          (e.g. losing qibla alignment as the phone moves).
//   3. The finger moves through DISCRETE → hapticSelection (scrubber crossing a prayer,
//      VALUES                              scrub-to-prayer, reset-to-now, OptionGroup change,
//                                          picking a city, stepping the introduction)
//   4. A custom CONTROL SNAPS under      → hapticLight    (Stepper step, a command button
//      direct manipulation                 whose result lands synchronously on the tap)
//      …and two named cases of the same class, which exist only because Android has a
//      constant that says precisely what they are:
//                                          → hapticToggle  (the dock opening / closing)
//                                          → hapticGrab /
//                                            hapticRelease (the scrubber thumb, both ends)
// Explicitly NO haptic for: navigation & dismissal (opening / closing / back on any screen
// or modal — the visual transition is the feedback), expanding/collapsing disclosure or FAQ
// accordions (a content reveal, treated like navigation), and native controls that carry
// their own platform affordance — the Switch in Toggle, and every @expo/ui control, whose
// SwiftUI / Jetpack Compose implementation feeds back on its own (SegmentedChoice, which is
// a native segmented Picker, is silent here for exactly that reason even though the
// OptionGroup it replaced on Utseende ticks). Overusing haptics on routine
// transitions drains the signal value of the meaningful ones (Apple HIG).
//
// The introduction's step buttons look like they fall under that exclusion and do not:
// what advances is the progress MARK (IntroMarkProgress), a discrete 1-of-4 counter the
// button steps through, which is class 3 above — not a move between screens. Stepping BACK
// is the same counter moving the other way and carries the same tick. See app/valkommen.tsx,
// where the cue sits on the state change rather than on whatever caused it — which is why
// the Android back gesture, the flow's only way backwards, ticks as well.
//
// PLATFORM MAPPING. On iOS the helpers hit the Taptic Engine directly (selection / impact /
// notification generators). On Android, expo-haptics' selectionAsync/impactAsync/
// notificationAsync route through the raw `Vibrator` waveform API — a timed buzz Expo's own
// docs flag as "not recommended". So on Android we use `performAndroidHapticsAsync`, which
// drives the OS's device-tuned semantic haptic engine (View.performHapticFeedback) and needs
// no VIBRATE permission — the Android analogue of iOS's crisp taptics.
//   selection → Clock_Tick,  light  → Virtual_Key       (universal: API 21 / API 5)
//   toggle    → Toggle_On/Off (API 34)   ┐ the semantically exact constants, each with a
//   grab/rel  → Gesture_Start/End (API 30) ┘ FLOOR: below it they fall back to Virtual_Key
//   success   → Confirm,     warning → Reject          (API 30+; below 30 those constants
//                                                       don't exist, so we fall back to the
//                                                       Vibrator notification so Android
//                                                       7–10 still buzzes)
// The floors are not defensive padding — they are required. expo-haptics resolves these
// constants by REFLECTION and throws HapticsNotSupportedException for one the device lacks
// (its own always-available set is Clock_Tick / Context_Click / Keyboard_Tap / Long_Press /
// Virtual_Key — see HapticsRecord.kt in the package), and minSdk here is 24. An unguarded
// Toggle_On on Android 11 is silence, not a graceful downgrade.
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

// A semantic constant with a floor: below the API level that introduced it, fall back to
// Virtual_Key, which every supported device has. See PLATFORM MAPPING above for why the floor
// is mandatory. Distinct from androidSemantic() above, whose success/warning cases have no
// universal haptic constant to land on and so fall back to the Vibrator instead.
function androidSemanticOrKey(type: Haptics.AndroidHaptics, since: number): void {
  const constant =
    (Platform.Version as number) >= since ? type : Haptics.AndroidHaptics.Virtual_Key;
  Haptics.performAndroidHapticsAsync(constant).catch(() => {});
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

/** A light impact — use for a discrete snap that has no truer name below (landing a
    tap-to-scrub, a Stepper step). Heavier than a selection tick but still subtle. */
export function hapticLight(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Virtual_Key).catch(() => {});
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** A toggle landing in its new position — the dock opening or closing, by drag or by tap.
    Class 4 like hapticLight, split out only because Android has a constant that means exactly
    this where Virtual_Key (a key press) does not. iOS has no toggle-specific generator, so
    there this is the same light impact hapticLight gives. */
export function hapticToggle(on: boolean): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    androidSemanticOrKey(
      on ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off,
      34,
    );
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** Taking hold of a control under direct manipulation — the scrubber thumb. Class 4. */
export function hapticGrab(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    androidSemanticOrKey(Haptics.AndroidHaptics.Gesture_Start, 30);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** Letting go of it again — the other end of the same drag. Class 4. */
export function hapticRelease(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    androidSemanticOrKey(Haptics.AndroidHaptics.Gesture_End, 30);
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
