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
//                                          picking a city, picking a day in the calendar,
//                                          stepping the introduction, and EVERY stepper —
//                                          day, month, minute adjustment. Stepping through
//                                          values is a selection change whichever control
//                                          does it, so one act never has two feels.)
//   4. A custom CONTROL SNAPS under      → hapticLight    (a command button whose result
//      direct manipulation                 lands synchronously on the tap — clearing the
//                                          adjustments; a tap that selects a feature on the
//                                          map — a mosque or burial pin, a prayer line)
//      …and two named cases of the same class, which exist only because Android has a
//      constant that says precisely what they are:
//                                          → hapticToggle  (the dock opening / closing)
//                                          → hapticGrab /
//                                            hapticRelease (the scrubber thumb, both ends)
// Explicitly NO haptic for navigation & dismissal — the visual transition is the feedback:
//   • opening / closing / back on any screen, modal or SHEET (the almanac, the month sheet,
//     the day picker, the settings, byt-plats), including the sheet's own close button;
//   • leaving the app (directions hand off to a maps app);
//   • moving the map camera (the reset and locate discs fly it; the flight is the feedback);
//   • the last press of a stepped card that dismisses it (MapLessonCard's final "next") —
//     the same button ticks while it steps, and goes quiet on the press that closes;
// nor for expanding/collapsing disclosure or FAQ accordions (a content reveal, treated like
// navigation), nor for native controls that carry their own platform affordance — the
// Switch in Toggle, and every @expo/ui control, whose SwiftUI / Jetpack Compose
// implementation feeds back on its own (SegmentedChoice, a native segmented Picker, is
// silent — and so is every onChange handed to it, which would otherwise tick twice
// whenever it falls back to the OptionGroup that ticks for itself). Overusing haptics on
// routine transitions drains the signal value of the meaningful ones (Apple HIG).
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
// docs flag as "not recommended", and one Android's haptics guide "strongly discourage[s]"
// for UI feedback as "often too loud". So on Android EVERY helper — fallbacks included — goes
// through `performAndroidHapticsAsync`, which drives the OS's device-tuned semantic haptic
// engine (View.performHapticFeedback) and needs no VIBRATE permission. There is no Vibrator
// path left anywhere in the app, and that is the point, not tidiness: performHapticFeedback
// honours the system touch-feedback setting (HAPTIC_FEEDBACK_ENABLED) and a Vibrator
// waveform does not, so the old Vibrator fallback buzzed Android 7–10 readers who had turned
// touch feedback off for the whole phone. Each Android helper is a constant with a floor —
// the API level that introduced it — and a fallback below it:
//   selection → Segment_Tick  (API 34) else Clock_Tick   "switching between a series of
//                                                         potential choices" — class 3 exactly
//   light     → Virtual_Key   (universal)
//   toggle    → Toggle_On/Off (API 34) else Virtual_Key
//   grab/rel  → Gesture_Start/End (API 30) else Virtual_Key
//   success   → Confirm       (API 30) else Virtual_Key  a click
//   warning   → Reject        (API 30) else Long_Press   the heavier click: Android's own
//                                                         pair makes reject the stronger one
// The floors are not defensive padding — they are required. expo-haptics resolves these
// constants by REFLECTION and throws HapticsNotSupportedException for one the device lacks,
// and minSdk here is 24. An unguarded Toggle_On on Android 11 is silence, not a graceful
// downgrade. So every FALLBACK must come from the package's always-available set —
// Clock_Tick / Context_Click / Keyboard_Tap / Long_Press / Virtual_Key, the `when` block in
// HapticsRecord.kt.
//
// What the OS may silence regardless: on iOS the Taptic Engine does nothing in Low Power
// Mode, with System Haptics off, while the camera is active, or during dictation (Expo's
// docs); on Android, with touch feedback off. Neither throws, which is why no helper here
// needs a capability check. Accepted cost: expo-haptics builds a fresh iOS generator per
// call and prepares it on the spot, so `prepare()` saves no latency. Holding generators
// warm would mean our own native module, which this app's restrained cues don't need.
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

// The one way an Android helper reaches the device: `type` from the API level that introduced
// it, `fallback` below that — see PLATFORM MAPPING above for why the floor is mandatory and
// why the fallback must be one of the always-available constants. Platform.Version is the
// SDK_INT integer on Android (a version *string* on iOS, which never reaches this). Platform.OS
// is read per-call (not cached) to match the rest of the codebase and stay unit-testable.
function android(
  type: Haptics.AndroidHaptics,
  since: number,
  fallback: Haptics.AndroidHaptics,
): void {
  const constant = (Platform.Version as number) >= since ? type : fallback;
  Haptics.performAndroidHapticsAsync(constant).catch(() => {});
}

/** A selection tick — the lightest feedback. Use for crossing a landmark
    (scrubber passing a prayer), stepping a value, or picking one from a set. */
export function hapticSelection(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    android(Haptics.AndroidHaptics.Segment_Tick, 34, Haptics.AndroidHaptics.Clock_Tick);
  } else {
    Haptics.selectionAsync().catch(() => {});
  }
}

/** A light impact — class 4: a command whose result lands on the tap, or a tap that selects
    a feature on the map. Heavier than a selection tick but still subtle. */
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
    android(
      on ? Haptics.AndroidHaptics.Toggle_On : Haptics.AndroidHaptics.Toggle_Off,
      34,
      Haptics.AndroidHaptics.Virtual_Key,
    );
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** Taking hold of a control under direct manipulation — the scrubber thumb. Class 4. */
export function hapticGrab(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    android(Haptics.AndroidHaptics.Gesture_Start, 30, Haptics.AndroidHaptics.Virtual_Key);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** Letting go of it again — the other end of the same drag. Class 4. */
export function hapticRelease(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    android(Haptics.AndroidHaptics.Gesture_End, 30, Haptics.AndroidHaptics.Virtual_Key);
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** A success notification — a small "landed it" cue. Use sparingly for reaching a
    meaningful target (the phone lining up with the qibla, a confirmed GPS fix). */
export function hapticSuccess(): void {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    android(Haptics.AndroidHaptics.Confirm, 30, Haptics.AndroidHaptics.Virtual_Key);
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
    android(Haptics.AndroidHaptics.Reject, 30, Haptics.AndroidHaptics.Long_Press);
  } else {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
}
