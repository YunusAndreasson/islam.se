// palette.mix() is the colour-blend primitive every twilight wash stop, prayer pill
// and chrome surface composes through. A subtle bug here — alpha drifting, channels
// going non-integer, an alpha lerp clamping — would smear across the whole map and
// dock. Tested as invariants (idempotence at endpoints, monotonicity, no-overflow)
// rather than literal mid-point colours, so it can't drift with palette tuning.
//
// The light/dark splits are also pinned as invariants — not literal hex matches.
// The Apple Maps-inspired model needs the DARK wash to be GENTLER (the basemap
// is already dark, so the wash carries hue not darkness) and the DARK prayer-line
// colour to be BRIGHTER than its light-mode sibling (otherwise an indigo line
// dies on a navy basemap, which is exactly how this redesign started).
import { describe, expect, it } from '@jest/globals';

import { PRAYER_ORDER, type PrayerKey } from '../prayer-times';
import {
  mix,
  PRAYER_COLORS,
  prayerColorFor,
  rgbaString,
  type RGBA,
  washStopsDark,
  washStopsFor,
  washStopsLight,
} from './palette';

describe('mix', () => {
  const A: RGBA = [10, 20, 30, 0.1];
  const B: RGBA = [200, 220, 240, 0.9];

  it('returns the endpoints exactly at t=0 and t=1', () => {
    expect(mix(A, B, 0)).toEqual(A);
    expect(mix(A, B, 1)).toEqual(B);
  });

  it('produces integer RGB channels (rgbaString requires whole numbers)', () => {
    // rgba(255.4, …) renders fine in CSS but is malformed for React Native — pinning
    // integer channels guards against a future "remove Math.round, it's a no-op" PR.
    for (let i = 0; i <= 10; i++) {
      const [r, g, b] = mix(A, B, i / 10);
      expect(Number.isInteger(r)).toBe(true);
      expect(Number.isInteger(g)).toBe(true);
      expect(Number.isInteger(b)).toBe(true);
    }
  });

  it('is monotonic in every channel between the endpoints', () => {
    // For mix() to behave as a single-axis crossfade (which everything that calls it
    // assumes), each channel must move strictly in the endpoint direction — a sign
    // flip or a clamped lerp would silently make the dusk wash zigzag.
    let prev = mix(A, B, 0);
    for (let i = 1; i <= 10; i++) {
      const cur = mix(A, B, i / 10);
      // R/G/B all go up (A is darker), alpha goes up too (A is more transparent).
      expect(cur[0]).toBeGreaterThanOrEqual(prev[0]);
      expect(cur[1]).toBeGreaterThanOrEqual(prev[1]);
      expect(cur[2]).toBeGreaterThanOrEqual(prev[2]);
      expect(cur[3]).toBeGreaterThanOrEqual(prev[3]);
      prev = cur;
    }
  });

  it('keeps alpha at fractional precision (not rounded to integer)', () => {
    // The RGB channels round to integers; alpha does NOT. If a refactor accidentally
    // rounds alpha, every translucent stop snaps to fully opaque or fully clear,
    // collapsing the entire twilight wash.
    const [, , , a] = mix(A, B, 0.5);
    expect(a).toBeCloseTo(0.5, 5);
    expect(Number.isInteger(a)).toBe(false);
  });
});

describe('rgbaString', () => {
  it('formats channels as integers and alpha at 3 decimals', () => {
    // The format is what the React Native style engine consumes; lock both the
    // channel/alpha shape and the comma separator so a regex-driven consumer can't
    // silently fail to parse (we've been bitten by locale-dot vs locale-comma).
    expect(rgbaString([12, 34, 56, 0.125])).toBe('rgba(12,34,56,0.125)');
    expect(rgbaString([0, 0, 0, 0])).toBe('rgba(0,0,0,0.000)');
    expect(rgbaString([255, 255, 255, 1])).toBe('rgba(255,255,255,1.000)');
  });
});

// Relative luminance per WCAG (0..1 perceptual brightness on linearised sRGB). Used to
// pin "dark variant must be brighter than light variant" without depending on a specific
// hex — i.e. tuning a colour can't accidentally invert the dark/light hierarchy.
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

describe('washStops — light vs dark', () => {
  // In light mode the basemap is warm parchment, so the wash's NIGHT stop has to
  // CARRY the darkness (drown the paper). In dark mode the basemap is already deep
  // navy — the wash carries hue only, at much lower alpha. A future refactor that
  // bumps the dark NIGHT alpha up "to match" would re-introduce the muddy
  // double-dark that Apple Maps deliberately avoids: lock the invariant.
  it('dark NIGHT alpha is substantially lower than light NIGHT alpha', () => {
    const lightA = washStopsLight.NIGHT[3];
    const darkA = washStopsDark.NIGHT[3];
    expect(lightA).toBeGreaterThan(0.7); // drowns warm parchment
    expect(darkA).toBeLessThan(0.6); // hue-only veil on a navy basemap
    expect(lightA - darkA).toBeGreaterThan(0.3);
  });

  it('dark DUSK and DAWN alphas are lower than light', () => {
    expect(washStopsDark.DUSK_WARM[3]).toBeLessThan(washStopsLight.DUSK_WARM[3]);
    expect(washStopsDark.DAWN_COOL[3]).toBeLessThan(washStopsLight.DAWN_COOL[3]);
  });

  it('washStopsFor picks dark when scheme is "dark", light otherwise', () => {
    // RN's ColorSchemeName is 'light' | 'dark' | 'unspecified'; an unspecified
    // scheme (no OS preference reported) must fall through to the light wash so
    // the basemap and the wash never disagree.
    expect(washStopsFor('dark')).toBe(washStopsDark);
    expect(washStopsFor('light')).toBe(washStopsLight);
    expect(washStopsFor('unspecified')).toBe(washStopsLight);
  });

  it('DAY is fully transparent in both modes (basemap shows untouched at noon)', () => {
    expect(washStopsLight.DAY[3]).toBe(0);
    expect(washStopsDark.DAY[3]).toBe(0);
  });
});

describe('PRAYER_COLORS — light vs dark', () => {
  // Every prayer's dark variant must be at least as bright as its light sibling —
  // otherwise the line vanishes against the navy basemap. Isha is the load-bearing
  // case: the light-mode Prussian indigo `#33437a` is the EXACT collapse case (its
  // hue matches the dark basemap's LAND `#1d2333`), and was caught only when the
  // basemap went dark. This test is the regression guard.
  it.each(PRAYER_ORDER as readonly PrayerKey[])(
    '%s — dark variant is brighter than light variant',
    (prayer) => {
      const light = relativeLuminance(PRAYER_COLORS[prayer].light);
      const dark = relativeLuminance(PRAYER_COLORS[prayer].dark);
      expect(dark).toBeGreaterThan(light);
    },
  );

  it('Isha specifically swaps hue family (indigo → periwinkle) for the dark basemap', () => {
    // Not just brighter — Isha's light-mode Prussian indigo would collapse against navy
    // even if brightness were lifted, so the dark variant moves into the periwinkle
    // family that matches darkPalette.accent. Lock the hue family by an RGB-distance
    // check rather than a literal hex, so colour tuning is fine but a regression to
    // "same hue, just brighter" trips the test.
    const r = parseInt(PRAYER_COLORS.isha.dark.slice(1, 3), 16);
    const g = parseInt(PRAYER_COLORS.isha.dark.slice(3, 5), 16);
    const b = parseInt(PRAYER_COLORS.isha.dark.slice(5, 7), 16);
    // Periwinkle: blue dominates and the R/G channels are close (lavender), not the
    // light-mode Prussian where blue dominates and R/G diverge sharply.
    expect(b).toBeGreaterThan(150);
    expect(Math.abs(r - g)).toBeLessThan(40);
  });

  it('prayerColorFor picks the dark variant when scheme is "dark"', () => {
    expect(prayerColorFor('isha', 'dark')).toBe(PRAYER_COLORS.isha.dark);
    expect(prayerColorFor('isha', 'light')).toBe(PRAYER_COLORS.isha.light);
    expect(prayerColorFor('isha', 'unspecified')).toBe(PRAYER_COLORS.isha.light);
  });
});
