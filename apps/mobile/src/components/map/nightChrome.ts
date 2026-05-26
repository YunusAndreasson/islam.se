// Chrome colours interpolated by the night factor (0 day → 1 deep night), so the
// surfaces floating over the map — the prayer dock, the city markers, the menu —
// slide from light glass on a bright day map to a dark indigo glass on the night
// map, reading as one continuous surface. Built on the solar palette's own mix()
// so the chrome shares the map's colour language. See lib/solar/night.ts.
import { mix, type RGBA, rgbaString } from '../../lib/solar/palette';

export interface NightChrome {
  surface: string;
  ink: string;
  inkMuted: string;
  accent: string;
  accentSoft: string;
  track: string;
  trackFill: string;
  thumb: string;
  hairline: string;
  handle: string;
  /** Halo behind map labels — light by day, dark by night, so text always reads. */
  halo: string;
  /**
   * The map prayer pills get their own OPAQUE surface + borders (not the translucent
   * glass `surface`/`hairline`). On the dark, non-uniform night map a translucent
   * border composites differently over whatever terrain/line sits behind it, so the
   * rounded caps read as uneven and "not smooth"; an opaque fill + opaque border give
   * a crisp uniform edge in both modes — matching how clean the day pill already looks.
   */
  pillSurface: string;
  /** Subtle border for a normal pill. */
  pillBorder: string;
  /**
   * Border for the emphasised "next" prayer pill. NOT the shared `accent` (which is a
   * high-contrast fill/text colour — fine as a dark slate border by day, but a glaring
   * bright-periwinkle ring at night): a muted, *opaque* periwinkle that reads as a
   * clean accented outline in both modes.
   */
  pillNextBorder: string;
}

// [day, night] endpoints (RGBA, alpha 0..1).
const STOPS: Record<keyof NightChrome, [RGBA, RGBA]> = {
  surface: [
    [252, 252, 254, 0.9],
    [22, 28, 52, 0.8],
  ],
  ink: [
    [17, 24, 28, 1],
    [237, 240, 245, 1],
  ],
  inkMuted: [
    [91, 100, 112, 1],
    [168, 177, 196, 1],
  ],
  accent: [
    [70, 82, 127, 1],
    [176, 186, 226, 1],
  ],
  accentSoft: [
    [233, 235, 245, 1],
    [255, 255, 255, 0.16],
  ],
  track: [
    [17, 24, 28, 0.12],
    [255, 255, 255, 0.18],
  ],
  trackFill: [
    [70, 82, 127, 0.35],
    [176, 186, 226, 0.55],
  ],
  thumb: [
    [255, 255, 255, 1],
    [237, 240, 245, 1],
  ],
  hairline: [
    [17, 24, 28, 0.08],
    [255, 255, 255, 0.13],
  ],
  handle: [
    [17, 24, 28, 0.18],
    [255, 255, 255, 0.32],
  ],
  halo: [
    [245, 247, 250, 0.92],
    [16, 22, 44, 0.66],
  ],
  // Opaque pill fill: near-white by day (≈ the old 0.9 glass), solid indigo by night.
  pillSurface: [
    [252, 252, 254, 1],
    [34, 40, 64, 1],
  ],
  // Normal pill border: a faint hairline by day, a subtle *opaque* indigo line by
  // night (uniform over any map terrain, unlike the translucent shared hairline).
  pillBorder: [
    [17, 24, 28, 0.08],
    [78, 88, 120, 1],
  ],
  // Next-pill border: day slate unchanged; night a muted *opaque* periwinkle —
  // clearly accented but not the bright ring the full accent produced, and uniform
  // (opaque) so the rounded caps stay smooth.
  pillNextBorder: [
    [70, 82, 127, 1],
    [108, 120, 158, 1],
  ],
};

// A steep remap of the night factor that drives *every* chrome colour. The bug it
// kills: surface crossfades light→dark while ink crossfades dark→light, so a naïve
// linear blend has both meet at the same mid-grey near t=0.5 — the dock (and the
// map pills, same palette) turn grey-text-on-grey and become unreadable at every
// dusk and dawn. Compressing the whole transition into a narrow band keeps the
// chrome decisively light or dark almost everywhere, so the light↔dark flip reads
// as one clean switch instead of a long unreadable wash.
//
// The band is centred at 0.525 on purpose: the app feeds `night` in quantised to
// 0.05 (see bonetider.tsx), so the two steps that straddle the centre — 0.50 and
// 0.55 — map to ~0.18 and ~0.82, on opposite, high-contrast sides of the grey
// midpoint. No rendered frame, live or scrubbed, can land on the dead zone.
const BAND_LO = 0.47;
const BAND_HI = 0.58;
function steep(t: number): number {
  const x = Math.max(0, Math.min(1, (t - BAND_LO) / (BAND_HI - BAND_LO)));
  // smootherstep — eases in and out so the flip still feels animated, not abrupt.
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function nightChrome(t: number): NightChrome {
  const f = steep(Math.max(0, Math.min(1, t)));
  const out = {} as NightChrome;
  for (const key of Object.keys(STOPS) as (keyof NightChrome)[]) {
    const [day, night] = STOPS[key];
    out[key] = rgbaString(mix(day, night, f));
  }
  return out;
}
