import { useWindowDimensions } from 'react-native';

/**
 * The one reflow breakpoint the settings surfaces share.
 *
 * Six files used to spell this out verbatim — Stepper (stacks its −/+ control under the
 * label), SegmentedChoice (falls back to radio rows, because native segments cannot wrap
 * their labels), PreviewStrip (two columns instead of three, and stops clamping), the two
 * settings screens (stack label over value; Beräkning unpins its preview) and
 * DisclosureGroup (drops its two-line clamp). NavRow now reads it too. PlacePicker had
 * already drifted to a looser test of its own. One copy means they can no longer disagree
 * about when the screen is short of room.
 *
 * ⚠️ 1.3 IS NOT THE ANDROID SETTING OF THE SAME NAME, and do not "fix" the strict `>` on
 * the theory that it is. Android's font-size stops are 0.85 / 1.0 / 1.15 / 1.3 / 1.5 /
 * 1.8 / 2.0, so a `>` looks like it excludes readers sitting exactly on 1.3 — it does
 * not, because this is not that number. React Native derives `fontScale` on Android from
 * `scaledDensity / density`, and under the non-linear font scaling of Android 14+ that is
 * not the requested configuration scale. Measured on a Pixel emulator (API 35, 2026-09):
 * with `settings put system font_scale 1.3` the app stays in the roomy layout, and only
 * at 1.5 does it cross. Both layouts were checked at 1.3 and nothing clipped or collided,
 * which is the test that actually matters.
 *
 * Read through useWindowDimensions rather than PixelRatio.getFontScale() so this notices
 * a change at the same moment Icon's Android glyph fix does — see components/ui/Icon.
 */
export const COMPACT_MAX_WIDTH = 360;
export const COMPACT_MIN_FONT_SCALE = 1.3;

export function useCompactLayout(): boolean {
  const { width, fontScale } = useWindowDimensions();
  return width < COMPACT_MAX_WIDTH || fontScale > COMPACT_MIN_FONT_SCALE;
}
