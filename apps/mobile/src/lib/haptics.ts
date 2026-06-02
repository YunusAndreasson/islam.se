// Tiny safe wrapper around expo-haptics so call sites stay one-liners and never
// have to think about platform support or rejected promises. Haptics are a
// "nice to have" microinteraction — a device without a taptic engine (most
// Android emulators, web) should silently do nothing, never throw.
//
// THE POLICY — the single source of truth for *when* to buzz. Haptics fire only
// for these three classes of moment, and never otherwise:
//   1. An OUTCOME is reached            → hapticSuccess  (qibla lock, GPS fix confirmed)
//   2. The finger moves through DISCRETE → hapticSelection (scrubber crossing a prayer,
//      VALUES                              scrub-to-prayer, reset-to-now, OptionGroup change)
//   3. A custom CONTROL SNAPS under      → hapticLight    (dock open/close, scrubber
//      direct manipulation                 grab/release, Stepper step, a command button
//                                           whose result lands synchronously on the tap)
// Explicitly NO haptic for: navigation & dismissal (opening / closing / back on any screen
// or modal — the visual transition is the feedback), expanding/collapsing disclosure or FAQ
// accordions (a content reveal, treated like navigation), and native controls that carry
// their own platform affordance (the Switch in Toggle). Overusing haptics on routine
// transitions drains the signal value of the meaningful ones (Apple HIG).
//
// Every helper is gated by the user's "Haptik" setting via the module-level `enabled`
// flag below — see setHapticsEnabled.
import * as Haptics from 'expo-haptics';

// Mirrors the user's `settings.haptics` preference. It's a plain module flag (not a hook
// or context read) because the helpers are called from gesture worklets via runOnJS
// (PrayerDock) and from non-component code, where React context isn't reachable. The
// SettingsProvider pushes the persisted value here whenever it loads/changes (see
// lib/settings/context.tsx). Defaults to on so haptics work during the brief window
// before settings hydrate.
let enabled = true;

/** Sync the user's haptics preference into this module. Called by SettingsProvider. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

/** A selection tick — the lightest feedback. Use for crossing a landmark
    (scrubber passing a prayer) or confirming a small state change. */
export function hapticSelection(): void {
  if (!enabled) return;
  Haptics.selectionAsync().catch(() => {});
}

/** A light impact — use for a discrete snap (dock opening/closing, landing a
    tap-to-scrub). Heavier than a selection tick but still subtle. */
export function hapticLight(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A success notification — a small "landed it" cue. Use sparingly for reaching a
    meaningful target (the phone lining up with the qibla). */
export function hapticSuccess(): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
