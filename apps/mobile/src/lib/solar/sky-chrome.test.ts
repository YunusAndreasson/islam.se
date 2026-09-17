import { describe, expect, it } from '@jest/globals';

import { lc, wcagContrast } from '@/test-utils/contrast';
import { lightPalette, darkPalette } from '@/theme/tokens';
import { basemapGroundFor } from '@/lib/map/nordicStyle';
import { skyChromeAt, skyChromeFor } from './sky-chrome';

// Sun positions to read the card at. Hour angle 0 is solar noon, 180 solar midnight.
const NOON = { altDeg: 40, haDeg: 0 };
const NIGHT = { altDeg: -30, haDeg: 180 };

const channels = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

/** Blue minus red: positive is a cool surface, negative a warm one. */
const warmth = (hex: string): number => {
  const [r, , b] = channels(hex);
  return r - b;
};

describe('skyChromeFor', () => {
  it('reproduces the daylight card token, so this is a generalisation and not a retune', () => {
    // THE load-bearing case. `lightPalette.surface` was hand-picked as "a warm white card on
    // warm parchment land", and daylight is the one moment the old constant DID describe
    // correctly. Feeding undrowned parchment back through the derivation has to land on it
    // again, or every screen that has nothing to do with night has quietly changed colour.
    const [r, g, b] = channels(skyChromeFor('light', NOON.altDeg, NOON.haDeg).surface);
    const [tr, tg, tb] = channels(lightPalette.surface);
    expect(Math.abs(r - tr)).toBeLessThanOrEqual(6);
    expect(Math.abs(g - tg)).toBeLessThanOrEqual(6);
    expect(Math.abs(b - tb)).toBeLessThanOrEqual(6);
  });

  it('keeps the daylight card WARM, the light theme\'s one hue family', () => {
    // Lifting a colour toward white desaturates it, and at this lift it very nearly
    // neutralises it — which would drop the card out of the warm family (tokens.ts keeps
    // light grounds at H 81-89) and make it a grey slab on parchment.
    expect(warmth(skyChromeFor('light', NOON.altDeg, NOON.haDeg).surface)).toBeGreaterThan(3);
  });

  it('turns the card cool at night, when the ground it floats on is a night sky', () => {
    // The whole point: after sunset the wash repaints the ground blue, so a card that stayed
    // warm stopped belonging to it.
    expect(warmth(skyChromeFor('light', NIGHT.altDeg, NIGHT.haDeg).surface)).toBeLessThan(-3);
  });

  it('keeps the night card light enough to carry dark ink', () => {
    // The theme never flips — ink stays dark-on-light — so the card must not drift down into
    // a value that needs light ink instead.
    const [r, g, b] = channels(skyChromeFor('light', NIGHT.altDeg, NIGHT.haDeg).surface);
    expect(Math.min(r, g, b)).toBeGreaterThan(190);
  });

  it('matches the basemap land exactly in dark mode, which is the rule tokens.ts states', () => {
    // `darkPalette.surface` IS the dark LAND — "cards over a dark map sit nearly invisibly
    // raised". At noon the wash is fully transparent, so the derivation must hand back the
    // land untouched rather than lifting it toward white.
    expect(skyChromeFor('dark', NOON.altDeg, NOON.haDeg).surface).toBe(
      basemapGroundFor('dark').toLowerCase(),
    );
    expect(darkPalette.surface.toLowerCase()).toBe(basemapGroundFor('dark').toLowerCase());
  });

  it('quantises, so scrubbing the timeline does not re-render every card per step', () => {
    // Identity stability downstream depends on this: nearby instants must give the SAME
    // strings, or the context value changes on every step of a drag and re-renders every
    // card on the map — the dock included — for a colour no eye can tell apart.
    // Deliberately NOT asserting the grid's origin: it is anchored on the daylight card
    // rather than on 0 (see the quantiser), and that is an implementation detail this test
    // has no business pinning. What matters is that the value holds still.
    const sampled = new Set(
      Array.from({ length: 12 }, (_, i) => skyChromeFor('light', -30 + i * 0.05, 180).surface),
    );
    expect(sampled.size).toBe(1);
  });

  // ── THE GUARD THIS MODULE SHIPPED WITHOUT, and the regression is exactly what it now
  //    catches. The dock's ink tiers are calibrated against a FIXED card (theme/tokens.test
  //    pins them at Lc 85 / 68 / 56), and making the card follow the sky moved the ground out
  //    from under that calibration. Dark mode took it worst: its lift is 0, so the card WAS
  //    the ground, and the dark wash's dusk and dawn stops are bright colours over a very dark
  //    basemap — at Maghrib the dock composited to a washed-out maroon and the text on it
  //    dropped below every floor the palette promises. Measured across a whole real day, at
  //    the hour the sun actually does this, in both themes. ──
  const STOCKHOLM = { lat: 59.33, lon: 18.07 };
  const acrossADay = (scheme: 'light' | 'dark') =>
    Array.from({ length: 24 * 6 }, (_, i) => {
      const at = new Date(Date.UTC(2026, 8, 17) + i * 10 * 60_000);
      return { at, card: skyChromeAt(scheme, STOCKHOLM.lat, STOCKHOLM.lon, at).surface };
    });

  for (const scheme of ['light', 'dark'] as const) {
    const p = scheme === 'dark' ? darkPalette : lightPalette;

    it(`keeps every ink tier legible on the ${scheme} card at every hour of the day`, () => {
      for (const { at, card } of acrossADay(scheme)) {
        const when = `${scheme} @ ${at.toISOString().slice(11, 16)} UTC on ${card}`;
        // Same floors theme/tokens.test.ts holds the static surfaces to. A card the sun is
        // allowed to move is still a card this text has to be readable on.
        expect({ when, lc: lc(p.ink, card) >= 85 }).toEqual({ when, lc: true });
        expect({ when, lc: lc(p.inkMuted, card) >= 68 }).toEqual({ when, lc: true });
        expect({ when, lc: lc(p.inkFaint, card) >= 56 }).toEqual({ when, lc: true });
        expect({ when, wcag: wcagContrast(p.ink, card) >= 7 }).toEqual({ when, wcag: true });
      }
    });

    it(`keeps the brass countdown legible on the ${scheme} card at every hour`, () => {
      // `highlightText` is the dock's loudest job — the countdown and the next prayer's name.
      for (const { at, card } of acrossADay(scheme)) {
        const when = `${scheme} @ ${at.toISOString().slice(11, 16)} UTC on ${card}`;
        expect({ when, lc: lc(p.highlightText, card) >= 60 }).toEqual({ when, lc: true });
      }
    });
  }

  it('emits colours the style system can actually consume', () => {
    const { surface, cardGlass } = skyChromeFor('light', NIGHT.altDeg, NIGHT.haDeg);
    expect(surface).toMatch(/^#[0-9a-f]{6}$/);
    expect(cardGlass).toMatch(/^rgba\(\d+, \d+, \d+, 0\.9\d*\)$/);
  });
});
