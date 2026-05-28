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
  /** Faintest ink tier (quiet sub-labels: clock·place, ticks). */
  inkFaint: string;
  accent: string;
  /** Warm brass-gold — the "live right now" emphasis (the next prayer). Sparingly
   * used so it always means "look here"; the bridge to the website's warmth. */
  highlight: string;
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
  /** Soft brass wash behind the "next" emphasis (e.g. the next-prayer mark halo). */
  highlightSoft: string;
}

// [day, night] endpoints (RGBA, alpha 0..1). The DAY endpoints are the warm light
// palette (so the dock floats over a warm day map as one piece); the NIGHT endpoints
// stay the indigo night-sky language (the map is a sky — it can't go brown). See
// theme/tokens.ts for the matching screen palette.
const STOPS: Record<keyof NightChrome, [RGBA, RGBA]> = {
  surface: [
    [255, 253, 248, 0.9], // warm white glass
    [22, 28, 52, 0.8],
  ],
  ink: [
    [26, 23, 18, 1], // warm charcoal
    [237, 240, 245, 1],
  ],
  inkMuted: [
    [111, 100, 86, 1], // warm taupe
    [168, 177, 196, 1],
  ],
  inkFaint: [
    [151, 140, 123, 1], // warm faint (tokens light inkFaint)
    [124, 134, 156, 1], // dim periwinkle-grey on the night indigo
  ],
  accent: [
    [51, 67, 122, 1], // Prussian night-indigo (synced with tokens lightPalette.accent)
    [148, 162, 221, 1], // synced with darkPalette.accent
  ],
  // Brass-gold "next" emphasis — warm by day, a muted-but-still-warm brass by night.
  // The night value was pulled from [216,169,78] toward the Cloud Dancer calm direction
  // (synced with darkPalette.highlight), still legible on the dark indigo map.
  highlight: [
    [184, 134, 47, 1],
    [200, 154, 72, 1],
  ],
  accentSoft: [
    [231, 232, 241, 1],
    [255, 255, 255, 0.16],
  ],
  track: [
    [26, 23, 18, 0.14],
    [255, 255, 255, 0.18],
  ],
  trackFill: [
    [51, 67, 122, 0.4],
    [148, 162, 221, 0.55],
  ],
  thumb: [
    [255, 253, 248, 1],
    [237, 240, 245, 1],
  ],
  hairline: [
    [26, 23, 18, 0.1],
    [255, 255, 255, 0.13],
  ],
  handle: [
    [26, 23, 18, 0.2],
    [255, 255, 255, 0.32],
  ],
  halo: [
    [250, 247, 240, 0.92], // warm light halo
    [16, 22, 44, 0.66],
  ],
  // Opaque pill fill: warm near-white by day (≈ the 0.9 glass), solid indigo by night.
  pillSurface: [
    [255, 253, 248, 1],
    [34, 40, 64, 1],
  ],
  // Normal pill border: a faint warm hairline by day, a subtle *opaque* indigo line
  // by night (uniform over any map terrain, unlike the translucent shared hairline).
  pillBorder: [
    [26, 23, 18, 0.1],
    [78, 88, 120, 1],
  ],
  // Next-pill border: brass-gold in both modes (opaque, so the rounded caps stay
  // smooth) — the same "next prayer = gold" signal the dock's countdown carries, so
  // the map and the dock answer "what's coming" in one colour. Night value muted to
  // match darkPalette.highlight (the 2026 calmer brass).
  pillNextBorder: [
    [184, 134, 47, 1],
    [200, 154, 72, 1],
  ],
  highlightSoft: [
    [241, 231, 208, 1], // soft warm brass tint by day (tokens light highlightSoft)
    [200, 154, 72, 0.18], // a faint brass glow on the night indigo (synced with new highlight)
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
