// nightChrome turns one scalar (how dark is it, 0→1) into the colour palette every
// floating surface (dock, menu, map pills, status bar tint) leans on. The pinned bug:
// surface crossfades light→dark while ink crossfades dark→light, so a naïve linear
// blend has both meet at the same mid-grey near t=0.5 — the dock turns grey-text-on-
// grey and is unreadable at every dusk and dawn. The fix compresses the whole
// transition into a narrow band centred at 0.525, on purpose so the two 0.05-
// quantised live values that straddle the centre (0.50 / 0.55, see bonetider.tsx:
// `Math.round(nightRaw * 20) / 20`) land on opposite, high-contrast sides. These
// tests are the durable memory of that bug: they assert the live-rendered band, not
// the steep() shape, so any future "improvement" that re-introduces a mid-grey wash
// trips here instead of in the user's eyes at dusk.
import { describe, expect, it } from '@jest/globals';

import { nightChrome } from './nightChrome';

// Pull the three RGB channels out of an `rgba(r,g,b,a)` string. Alpha is dropped on
// purpose: contrast on a translucent dock is dominated by the channels, and pulling
// it apart keeps the assertions about *colour identity* (warm-light vs deep-indigo).
function rgb(s: string): [number, number, number] {
  const m = s.match(/rgba\((\d+),(\d+),(\d+),/);
  if (!m) throw new Error(`not an rgba string: ${s}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// Luminance proxy for ink/surface separation. We need a single scalar so we can ask
// "is the dock readable here?" — the relative-luminance Rec.709 mix is more honest
// than a plain mean (the eye treats green as ~2× brighter than blue) and good enough
// for "is ink decisively darker or lighter than surface" at every t.
function lum([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('nightChrome — endpoints', () => {
  it('reads as a warm light glass at full day (t=0)', () => {
    const c = nightChrome(0);
    const surface = rgb(c.surface);
    const ink = rgb(c.ink);
    // The DAY surface stop is a warm near-white (255,253,248); ink is a warm
    // charcoal (26,23,18). If either flips, the day dock can't be readable —
    // pin the *category* (very light vs very dark) rather than the literal stops.
    expect(lum(surface)).toBeGreaterThan(240);
    expect(lum(ink)).toBeLessThan(40);
  });

  it('reads as a deep indigo glass at full night (t=1)', () => {
    const c = nightChrome(1);
    const surface = rgb(c.surface);
    const ink = rgb(c.ink);
    // NIGHT surface is a deep indigo (22,28,52); ink is a near-white text colour.
    // If a future change brightens the night surface or darkens the night ink,
    // the dock loses contrast against the night map.
    expect(lum(surface)).toBeLessThan(40);
    expect(lum(ink)).toBeGreaterThan(220);
  });
});

describe('nightChrome — the dead-zone fix', () => {
  // The bug: a linear blend of surface (light→dark) against ink (dark→light) makes
  // their luminances meet at the same mid-grey near t=0.5. The fix compresses the
  // entire crossover into a band centred at 0.525 so the two live steps the app can
  // ever feed (0.50 and 0.55) land on opposite, decisively-readable sides. This is
  // the test that prevents a sincere "I cleaned up steep()" PR from reopening the
  // bug — assert the LIVE band (the values the app actually quantises to), not the
  // shape of the easing function.
  it('keeps the two live-quantised steps straddling 0.525 on opposite sides', () => {
    const just_below = nightChrome(0.5); // app can feed exactly this
    const just_above = nightChrome(0.55); // and exactly this — never the centre
    // 0.50 must still read as day-side (light surface, dark ink) and 0.55 must
    // already read as night-side (dark surface, light ink). The band is steep
    // enough that these two 0.05-apart steps span the entire crossover.
    expect(lum(rgb(just_below.surface))).toBeGreaterThan(lum(rgb(just_below.ink)));
    expect(lum(rgb(just_above.surface))).toBeLessThan(lum(rgb(just_above.ink)));
  });

  it('never lets the live-quantised palette collapse to grey-text-on-grey', () => {
    // Sweep every value the app can ever quantise to (0, 0.05, …, 1) and require a
    // decisive surface↔ink separation at each. The threshold (80 lum units) is
    // generous — far below WCAG levels — so it only trips on the *actual* failure
    // mode (a mid-grey wash, ~0 separation), never on tasteful contrast tuning.
    const FORBIDDEN_SEPARATION = 80;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const c = nightChrome(t);
      const sep = Math.abs(lum(rgb(c.surface)) - lum(rgb(c.ink)));
      expect(sep).toBeGreaterThan(FORBIDDEN_SEPARATION);
    }
  });

  it('crosses ink and surface luminance only inside the narrow band', () => {
    // The whole point of the steep remap: ink-vs-surface inversion happens between
    // ~0.47 and ~0.58, NOT around 0.5. Anywhere outside that band the chrome must
    // be decisively in one mode — so the live 0.50/0.55 steps are guaranteed safe
    // even if the quantisation step ever widens to 0.1.
    const inkLighterAt = (t: number) =>
      lum(rgb(nightChrome(t).ink)) > lum(rgb(nightChrome(t).surface));
    // Day side, well below the band: surface lighter than ink.
    expect(inkLighterAt(0.3)).toBe(false);
    expect(inkLighterAt(0.45)).toBe(false);
    // Night side, well above the band: ink lighter than surface.
    expect(inkLighterAt(0.62)).toBe(true);
    expect(inkLighterAt(0.8)).toBe(true);
  });
});

describe('nightChrome — monotonicity and clamping', () => {
  it('is monotonic in surface darkness across the full range', () => {
    // Surface luminance must fall as t rises — any non-monotonic dip would mean a
    // "lighter dock at deeper night" frame, which is the visual stutter the steep
    // ramp is designed to eliminate.
    let prev = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const cur = lum(rgb(nightChrome(t).surface));
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it('clamps out-of-range inputs to the endpoints', () => {
    // Defensive: an upstream bug feeding -1 or 2 (a clock spike, an NaN→cast)
    // must not produce a nonsense palette. The implementation clamps; pin it.
    expect(nightChrome(-1)).toEqual(nightChrome(0));
    expect(nightChrome(2)).toEqual(nightChrome(1));
  });
});
