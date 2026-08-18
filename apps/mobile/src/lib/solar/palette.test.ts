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

import { lc, wcagContrast } from '@/test-utils/contrast';

import { NIGHT_ORDER, type NightKey } from '@/lib/night-times';
import { PRAYER_ORDER, type PrayerKey } from '@/lib/prayer-times';
import {
  mix,
  NIGHT_COLORS,
  nightColorFor,
  PRAYER_COLORS,
  PRAYER_TEXT_COLORS,
  prayerColorFor,
  prayerTextColorFor,
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

  // The label twin of the above. It was previously covered only INCIDENTALLY, by
  // MapMarkersOverlay happening to render a pill inside a full-screen test — coverage
  // that came and went with the intro animation's timers. Pinned directly here: the two
  // pickers must resolve the same way, or a pill's label and its line disagree about
  // which scheme is active.
  it('prayerTextColorFor resolves the scheme the same way prayerColorFor does', () => {
    for (const prayer of PRAYER_ORDER) {
      expect(prayerTextColorFor(prayer, 'dark')).toBe(PRAYER_TEXT_COLORS[prayer].dark);
      expect(prayerTextColorFor(prayer, 'light')).toBe(PRAYER_TEXT_COLORS[prayer].light);
      // An unsettled scheme must fall to light, exactly as the line picker does.
      expect(prayerTextColorFor(prayer, 'unspecified')).toBe(PRAYER_TEXT_COLORS[prayer].light);
    }
  });
});

// The map pill's label colours. These are the one place a prayer hue is used as small
// TEXT rather than as a glowing line, and the two jobs need different values: measured on
// the light pill surface the raw line colours run 2.05:1 (sunrise) to 3.52:1 (fajr),
// where text under 18 pt needs 4.5:1. Painting labels with the line colours verbatim
// would have made five of the six unreadable in daylight.
//
// This block is the guard on that. It recomputes WCAG contrast from the hex values rather
// than trusting the comments beside them, so retuning a prayer hue — a thing that has
// happened repeatedly to this palette — cannot quietly drop a label below the threshold.
describe('PRAYER_TEXT_COLORS — legible on the pill, and still the line’s hue', () => {
  const PILL_LIGHT = '#fffdf8';
  const PILL_DARK = '#222840';
  // One shared oracle (src/test-utils/contrast.ts), not a local copy — this file used to
  // carry its own WCAG implementation, and a WCAG-only check is precisely what let the
  // dark labels sit at Lc 49–55 while reporting a healthy 5.8:1.
  const contrast = wcagContrast;

  it.each(PRAYER_ORDER)('%s clears 4.5:1 as text in both schemes', (prayer: PrayerKey) => {
    expect(contrast(PRAYER_TEXT_COLORS[prayer].light, PILL_LIGHT)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(PRAYER_TEXT_COLORS[prayer].dark, PILL_DARK)).toBeGreaterThanOrEqual(4.5);
  });

  // The measure that WCAG hides. Both schemes must clear the body-text floor, and — the
  // real invariant — the six labels must land at roughly ONE strength, because that is
  // what makes a row of pills read as one family instead of six unrelated inks. The light
  // set has always done this (all Lc ≈ 71, derived by moving L only); dark did not until
  // 2026-08, when it ranged Lc 49–69 with three labels under the floor.
  it.each(PRAYER_ORDER)('%s clears the APCA text floor in both schemes', (prayer: PrayerKey) => {
    expect(lc(PRAYER_TEXT_COLORS[prayer].light, PILL_LIGHT)).toBeGreaterThanOrEqual(62);
    expect(lc(PRAYER_TEXT_COLORS[prayer].dark, PILL_DARK)).toBeGreaterThanOrEqual(62);
  });

  it.each([
    ['light', PILL_LIGHT],
    ['dark', PILL_DARK],
  ])('the six %s labels read as one family', (scheme, pill) => {
    const strengths = PRAYER_ORDER.map((p) => lc(PRAYER_TEXT_COLORS[p][scheme as 'light' | 'dark'], pill));
    // Isha's light value is the one deliberate outlier: its Prussian indigo was already
    // legible and was left untouched rather than lightened to match the other five.
    const spread = Math.max(...strengths) - Math.min(...strengths);
    expect(spread).toBeLessThanOrEqual(scheme === 'light' ? 22 : 4);
  });

  // Why this file needs to exist at all: it documents that the LINE colours genuinely
  // cannot be used here. If a future palette pass lifted them enough to pass on their own,
  // this fails and the whole second table can be deleted — a good failure to get.
  it('is still needed: the raw line colours fail in light mode', () => {
    const failing = PRAYER_ORDER.filter(
      (p) => contrast(PRAYER_COLORS[p].light, PILL_LIGHT) < 4.5,
    );
    expect(failing.length).toBeGreaterThan(0);
  });

  // Dark labels used to BE the line colours verbatim, on the reasoning that they already
  // cleared 4.5:1 there. They did — and still measured Lc 49–55 on three of six, because
  // WCAG 2 misjudges light-on-dark. They are now derived the same way the light ones are:
  // lightness moved, hue held. This asserts the derivation, which is what stops a future
  // pass from "simplifying" them back onto the line colours.
  it('derives the dark labels from the line colours rather than reusing them', () => {
    const derived = PRAYER_ORDER.filter((p) => PRAYER_TEXT_COLORS[p].dark !== PRAYER_COLORS[p].dark);
    expect(derived).toEqual([...PRAYER_ORDER]);
    // Note the correction went BOTH ways: fajr/maghrib/isha were lifted off the floor,
    // while sunrise and dhuhr came DOWN a little to join the family. The goal was one
    // strength, not a brighter map — "Nordic restraint, no neon" still governs.
    const brighter = PRAYER_ORDER.filter(
      (p) => lc(PRAYER_TEXT_COLORS[p].dark, PILL_DARK) > lc(PRAYER_COLORS[p].dark, PILL_DARK),
    );
    expect(brighter.length).toBeGreaterThan(0);
    expect(brighter.length).toBeLessThan(PRAYER_ORDER.length);
  });

  // The dark half of the hue-family rule the light labels already obey: moving lightness
  // is allowed, changing which channel dominates is not — a terracotta maghrib label must
  // not drift blue just because it was lifted.
  it('keeps each dark text colour in its line’s hue family', () => {
    // Spelled out rather than mapped: `.map()` over [1, 3, 5] returns number[], which
    // loses the fact that a colour has exactly three channels — and a destructure of it
    // hands the comparisons below possibly-undefined values.
    const rgb = (h: string): [number, number, number] => [
      Number.parseInt(h.slice(1, 3), 16),
      Number.parseInt(h.slice(3, 5), 16),
      Number.parseInt(h.slice(5, 7), 16),
    ];
    const order = ([r, g, b]: [number, number, number]) => [r >= g, g >= b, r >= b].join();
    for (const prayer of PRAYER_ORDER) {
      expect(order(rgb(PRAYER_TEXT_COLORS[prayer].dark))).toBe(
        order(rgb(PRAYER_COLORS[prayer].dark)),
      );
    }
  });

  // The point of deriving in OKLab was to move LIGHTNESS only. A darkened text colour
  // must stay in its line's hue family, or the pill stops reading as part of the line —
  // which is the whole reason for the change. Compared as a hue angle in OKLab-ish terms
  // via the ratio of the colour's RGB spread, which a hue shift would break.
  it('keeps each light text colour in its line’s hue family', () => {
    for (const prayer of PRAYER_ORDER) {
      const line = PRAYER_COLORS[prayer].light;
      const text = PRAYER_TEXT_COLORS[prayer].light;
      if (line === text) continue; // isha needed no adjustment
      // Spelled out rather than mapped: `.map()` over [1, 3, 5] returns number[], which
    // loses the fact that a colour has exactly three channels — and a destructure of it
    // hands the comparisons below possibly-undefined values.
    const rgb = (h: string): [number, number, number] => [
      Number.parseInt(h.slice(1, 3), 16),
      Number.parseInt(h.slice(3, 5), 16),
      Number.parseInt(h.slice(5, 7), 16),
    ];
      const [lr, lg, lb] = rgb(line);
      const [tr, tg, tb] = rgb(text);
      // Ordering of the channels (which is what "hue family" means at this resolution)
      // must survive the darkening: a warm terracotta must not come out blue-dominant.
      const order = (r: number, g: number, b: number) =>
        [r >= g, g >= b, r >= b].join();
      expect(order(tr, tg, tb)).toBe(order(lr, lg, lb));
      // And it must genuinely be DARKER, not merely different.
      expect(tr + tg + tb).toBeLessThan(lr + lg + lb);
    }
  });
});

// The night's two voluntary landmarks. They live in their own table (NIGHT_COLORS) rather
// than in PRAYER_COLORS because neither is a solar event that can be drawn as a contour —
// see lib/night-times.ts. But they render on the same two grounds, so they answer to the
// same floors.
describe('NIGHT_COLORS — the voluntary night landmarks', () => {
  // The dock's card ground, which is what the night glyphs actually sit on. Same values
  // the prayer pills use, so a colour that clears here clears everywhere it appears.
  const GROUND_LIGHT = '#fffdf8';
  const GROUND_DARK = '#222840';

  it.each(NIGHT_ORDER as readonly NightKey[])(
    '%s — dark variant is brighter than light variant',
    (key) => {
      expect(relativeLuminance(NIGHT_COLORS[key].dark)).toBeGreaterThan(
        relativeLuminance(NIGHT_COLORS[key].light),
      );
    },
  );

  // These are GLYPHS, not text: the dock paints each night row's label in the chrome ink
  // and tints only the icon, which is what keeps the voluntary rows quieter than the five
  // obligatory ones. So the floor is the graphics tier (Lc 45), the same one PRAYER_COLORS
  // targets — not the Lc 62 text floor the pill labels answer to.
  it.each(NIGHT_ORDER as readonly NightKey[])('%s clears the APCA graphics floor in both schemes', (key) => {
    expect(lc(NIGHT_COLORS[key].light, GROUND_LIGHT)).toBeGreaterThanOrEqual(45);
    expect(lc(NIGHT_COLORS[key].dark, GROUND_DARK)).toBeGreaterThanOrEqual(45);
  });

  // The pair must read as ONE group sitting between ʿIshāʾ and Fajr — that is what says
  // "these two belong to the night", rather than "here are two more prayer colours". Both
  // are blue-dominant with R and G close (the indigo/violet family ʿIshāʾ and Fajr share),
  // and the last third is the lighter of the two because it leans toward the dawn.
  it.each(['light', 'dark'] as const)('%s: both sit in the isha→fajr indigo family', (scheme) => {
    for (const key of NIGHT_ORDER) {
      const hex = NIGHT_COLORS[key][scheme];
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
      expect(Math.abs(r - g)).toBeLessThan(40);
    }
  });

  it.each(['light', 'dark'] as const)('%s: the last third is lifted toward Fajr’s dawn violet', (scheme) => {
    expect(relativeLuminance(NIGHT_COLORS.lastThird[scheme])).toBeGreaterThan(
      relativeLuminance(NIGHT_COLORS.middleOfNight[scheme]),
    );
  });

  it('nightColorFor resolves the scheme exactly as prayerColorFor does', () => {
    for (const key of NIGHT_ORDER) {
      expect(nightColorFor(key, 'dark')).toBe(NIGHT_COLORS[key].dark);
      expect(nightColorFor(key, 'light')).toBe(NIGHT_COLORS[key].light);
      expect(nightColorFor(key, 'unspecified')).toBe(NIGHT_COLORS[key].light);
    }
  });
});
