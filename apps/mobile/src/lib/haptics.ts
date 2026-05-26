// Tiny safe wrapper around expo-haptics so call sites stay one-liners and never
// have to think about platform support or rejected promises. Haptics are a
// "nice to have" microinteraction — a device without a taptic engine (most
// Android emulators, web) should silently do nothing, never throw.
import * as Haptics from 'expo-haptics';

/** A selection tick — the lightest feedback. Use for crossing a landmark
    (scrubber passing a prayer) or confirming a small state change. */
export function hapticSelection(): void {
  Haptics.selectionAsync().catch(() => {});
}

/** A light impact — use for a discrete snap (dock opening/closing, landing a
    tap-to-scrub). Heavier than a selection tick but still subtle. */
export function hapticLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A success notification — a small "landed it" cue. Use sparingly for reaching a
    meaningful target (the phone lining up with the qibla). */
export function hapticSuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
