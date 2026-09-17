// What colour a card floating ON the live map should be, at this instant.
//
// The app already had the rule, it just resolved it once. `darkPalette.surface` IS the dark
// basemap's LAND (`#1d2233`), with the note "so cards over a dark map sit nearly invisibly
// raised"; the light pair says the same thing one step apart — a warm white card over warm
// parchment land. A card is meant to read as a raised sheet of the ground it floats on.
//
// That held only at noon. The wash repaints the ground continuously — parchment by day,
// terracotta at dusk, deep blue at night — while the card stayed the colour of undrowned
// parchment, so after sunset a warm sheet sat on a cool sky and stopped belonging to it.
// This module keeps the rule and drops the "once": it composites the wash over LAND to get
// the ground the card is actually over, then re-derives the card from it.
//
// ⚠️ ONE SHARED VALUE, NOT PER-SURFACE SAMPLING. `GlassSurface`'s `tint` exists precisely so
// a surface's colour is decided by the caller rather than by what the OS blur sampled under
// it — that is how the left and right nav discs ended up disagreeing at dawn, each picking up
// a different piece of the terminator. So this is computed ONCE per render from ONE reference
// point (the reader's own location — the sky where they are) and handed to every card on the
// map. The cards still can't drift apart, because they are all painted from the same number.
//
// The theme never flips: ink stays dark-on-light in the light theme, light-on-dark in the
// dark one. Only the surface's temperature and brightness drift. The retired "sun-driven dock
// flip" was a light/dark THEME swap under the reader's hands; this is the glass taking on the
// colour of the sky behind it, which is what glass does.
import type { ColorSchemeName } from 'react-native';

import { basemapGroundFor } from '@/lib/map/nordicStyle';
import { washColorAt } from '@/components/map/skia/washColor';
import { washStopsFor } from '@/lib/solar/palette';
import { sunPositionDeg } from '@/lib/solar/sun';

/** How far the card is lifted from its ground, toward white.
 *
 *  Light: the existing token pair sets it — `#ece6d8` land under a `#fffdf8` card is a lift
 *  of roughly 0.87, and feeding undrowned parchment back through this reproduces that card
 *  to within a couple of points per channel. So daylight is where it always was, and only
 *  the hours the old constant never described actually move.
 *
 *  Dark: zero, because `darkPalette.surface` IS the dark LAND. The card matches its ground
 *  exactly, which is the rule stated in tokens.ts, and at night it simply follows the ground
 *  the wash has deepened. */
const LIFT: Record<'light' | 'dark', number> = { light: 0.87, dark: 0 };

/**
 * How much of the ground's own colour cast survives the lift.
 *
 * Lifting toward white desaturates, and at a lift of 0.87 it very nearly NEUTRALISES:
 * parchment came back out as #fcfcfc, a grey card, which drops the light theme's one warm
 * hue family (tokens.ts keeps its grounds at H 81-89) and would have made every daylight
 * card a grey slab on warm paper. So after lifting, each channel gets back this fraction of
 * its distance from the ground's own mean — the cast survives the lift instead of being
 * bleached out of it. Zero in dark, where nothing is lifted and the card IS the land.
 */
const CAST: Record<'light' | 'dark', number> = { light: 0.6, dark: 0 };

/**
 * How much of the card's LIGHTNESS swing survives. Its colour may travel; its brightness
 * may barely move, and this is the constraint that says so.
 *
 * The dock's ink tiers are calibrated against a fixed card — theme/tokens.test.ts pins them
 * at Lc 85 / 68 / 56 — and moving the card out from under that calibration is how the first
 * version of this module shipped a regression. Dark took it worst, because its lift is 0 and
 * the dark wash's dusk and dawn stops are BRIGHT colours over a very dark basemap: at Maghrib
 * the card composited to #553a3b, a washed-out maroon, and even the primary ink fell to Lc 77.
 * The dark palette has almost no headroom to spend either — `inkMuted` on the static surface
 * measures Lc 69.6 against a floor of 68.
 *
 * Compressing the MEAN rather than damping the whole drift is what buys the temperature shift
 * at the smallest possible cost: per-channel distance from the mean (the hue and chroma, which
 * is the part that makes the card belong to the sky) passes through untouched, while the
 * brightness — the only term the contrast floors actually care about — stays near the anchor.
 * Values are set BY those floors, not by eye: see the all-hours contrast tests.
 */
const LUMA_DRIFT: Record<'light' | 'dark', number> = { light: 0.35, dark: 0.15 };

/**
 * How much of the ground's COLOUR the card takes on, once its brightness is pinned.
 *
 * Light keeps all of it — {@link CAST} has already decided how much cast survives the lift,
 * and a near-white card has room to carry it.
 *
 * Dark keeps under half, for a reason that is about identity rather than contrast: the dark
 * palette is deliberately ONE navy family (tokens.ts holds its grounds at H 268-274), and the
 * dark wash's dusk stop is a bright terracotta over a very dark basemap. Passed through at
 * full strength it made the dock frankly maroon at Maghrib — a card that no longer belonged
 * to the app, only to the sky. At this strength dusk warms the navy and dawn cools it, which
 * is the whole intent, without either of them leaving the family.
 */
const CHROMA_KEEP: Record<'light' | 'dark', number> = { light: 1, dark: 0.45 };

/** The two surface colours every card on the map paints with. */
export interface SkyChrome {
  /** Opaque card ground — the dock. */
  surface: string;
  /** The same colour at the glass alpha — the nav discs and the map's floating cards. */
  cardGlass: string;
}

const clamp255 = (x: number): number => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x));

/** The card raised off a ground: lifted toward white, then handed back {@link CAST} of the
 *  cast the lift bleached out. Unrounded — the quantiser needs the real value. */
function cardFromGround(
  ground: [number, number, number],
  scheme: Extract<ColorSchemeName, 'light' | 'dark'>,
): [number, number, number] {
  const t = LIFT[scheme];
  const k = CAST[scheme];
  const mean = (ground[0] + ground[1] + ground[2]) / 3;
  return ground.map((v) => v + (255 - v) * t + (v - mean) * k) as [number, number, number];
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

const toHex = (c: number): string => c.toString(16).padStart(2, '0');

/**
 * Quantised to 4 levels per channel ON PURPOSE.
 *
 * The sky moves continuously, and every consumer of this value is a React component — the
 * dock included, which is the most expensive render on the screen. Scrubbing the timeline
 * would otherwise hand them a new colour object on every step of the drag. Rounding to a
 * step no eye can see on a glass card collapses that to a handful of distinct values across
 * a whole day, so the memo downstream actually holds.
 *
 * ⚠️ ANCHORED ON THE THEME'S OWN DAYLIGHT CARD, not on 0. A bare `round(v / 4) * 4` moved the
 * dark card off its land (`#1d2233` → `#1c2434`) and broke the one rule this module exists to
 * keep — the grid simply didn't happen to have a point there. Measuring the grid FROM the
 * daylight card means noon lands on that card exactly, in both themes, and every other hour
 * still snaps to a stable step.
 */
const QUANTISE = 4;
const quantise = (c: number, anchor: number): number =>
  anchor + Math.round((c - anchor) / QUANTISE) * QUANTISE;

/** The card over UNDROWNED land — midday, when the wash is fully transparent. This is the
 *  value the palette's `surface` token was hand-picked as, and the grid every other hour is
 *  measured from. */
const DAYLIGHT_CARD: Record<'light' | 'dark', [number, number, number]> = {
  light: cardFromGround(parseHex(basemapGroundFor('light')), 'light').map(clamp255) as [
    number,
    number,
    number,
  ],
  dark: cardFromGround(parseHex(basemapGroundFor('dark')), 'dark').map(clamp255) as [
    number,
    number,
    number,
  ],
};

/**
 * The card colour for a sky: the wash at (altitude, hour angle) composited over the basemap
 * land, then lifted toward white by the theme's own card-to-ground distance.
 *
 * Straight alpha, because that is the only compositing the real thing has: the Skia wash is a
 * sibling native view above MapLibre, so the OS blends it over the basemap exactly this way.
 * Matching it here is what makes the card the same material as what it sits on.
 */
export function skyChromeFor(
  scheme: Extract<ColorSchemeName, 'light' | 'dark'>,
  altDeg: number,
  haDeg: number,
): SkyChrome {
  const [lr, lg, lb] = parseHex(basemapGroundFor(scheme));
  const [wr, wg, wb, wa] = washColorAt(altDeg, haDeg, washStopsFor(scheme));

  // Ground the reader is actually looking at: land under this much wash.
  const ground: [number, number, number] = [
    wr * wa + lr * (1 - wa),
    wg * wa + lg * (1 - wa),
    wb * wa + lb * (1 - wa),
  ];

  const card = cardFromGround(ground, scheme);
  const anchor = DAYLIGHT_CARD[scheme];

  // Hold the brightness near the anchor the ink was calibrated against, and let the colour
  // travel. Deviations from the card's own mean survive intact, so only the lightness moves.
  const anchorMean = (anchor[0] + anchor[1] + anchor[2]) / 3;
  const cardMean = (card[0] + card[1] + card[2]) / 3;
  const targetMean = anchorMean + (cardMean - anchorMean) * LUMA_DRIFT[scheme];
  // Both damped TOWARD THE ANCHOR, never toward grey or black: the daylight card's own cast is
  // the resting state, and what is damped is how far the sky is allowed to pull away from it.
  // Measured from grey instead, a `CHROMA_KEEP` below 1 desaturated even the anchor — at noon
  // the dark card came out #22242c instead of its land, breaking the one rule this module has.
  const k = CHROMA_KEEP[scheme];
  const held = card.map((v, i) => {
    const anchorDev = (anchor[i] as number) - anchorMean;
    const cardDev = v - cardMean;
    return targetMean + anchorDev + (cardDev - anchorDev) * k;
  });

  const [r, g, b] = held.map((v, i) => clamp255(quantise(v, anchor[i] as number))) as [
    number,
    number,
    number,
  ];

  return {
    surface: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
    cardGlass: `rgba(${r}, ${g}, ${b}, 0.90)`,
  };
}

/** {@link skyChromeFor} for a place and instant. */
export function skyChromeAt(
  scheme: Extract<ColorSchemeName, 'light' | 'dark'>,
  latDeg: number,
  lonDeg: number,
  at: Date,
): SkyChrome {
  const { altDeg, haDeg } = sunPositionDeg(latDeg, lonDeg, at);
  return skyChromeFor(scheme, altDeg, haDeg);
}
