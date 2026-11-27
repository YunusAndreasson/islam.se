// The chrome palette's contrast contract.
//
// tokens.ts has always carried its contrast claims in COMMENTS, which is how the dark
// column drifted: a 2026-06 review measured it with WCAG, found "dark everything ≥4.4,
// all AA or better", and stopped there — but WCAG 2 systematically flatters
// light-on-dark, and by APCA the same tiers were Lc 34–56, with `inkFaint` (real 13 pt
// captions) sitting at Lc 34, inside APCA's non-text/disabled band. apps/web had already
// re-cut its own dark column by APCA for exactly this reason; mobile had not, and that
// is what made the two platforms' palettes disagree.
//
// So this file measures BOTH, on the REAL grounds each token is painted on, and — the
// part that actually prevents drift — asserts that a tier reads about as strongly in
// dark as it does in light. A palette can satisfy every absolute floor and still be a
// good scheme plus a thin one; parity is what says "these are one design".
//
// Thresholds are set just below what the palette measures today (the same discipline as
// jest.config.js's coverage gate): they lock in what is true now and fail loudly on a
// regression. Raise them as the palette improves; never lower them to make a build pass.
import { describe, expect, it } from '@jest/globals';

import { lc, wcagContrast } from '@/test-utils/contrast';
import { darkPalette, lightPalette, brand, type Palette } from './tokens';

/** Each scheme with the grounds its foregrounds are actually painted on. */
const SCHEMES: { name: string; p: Palette }[] = [
  { name: 'light', p: lightPalette },
  { name: 'dark', p: darkPalette },
];

describe.each(SCHEMES)('$name palette — text tiers on their real grounds', ({ p }) => {
  // The ink ladder. Each tier is checked on BOTH grounds it can land on, because
  // `surface` (cards) and `paper` (screen) are different enough to matter.
  it.each(['paper', 'surface'] as const)('ink is primary-strength on %s', (ground) => {
    expect(lc(p.ink, p[ground])).toBeGreaterThanOrEqual(85);
    expect(wcagContrast(p.ink, p[ground])).toBeGreaterThanOrEqual(7);
  });

  it.each(['paper', 'surface'] as const)('inkMuted clears the body floor on %s', (ground) => {
    expect(lc(p.inkMuted, p[ground])).toBeGreaterThanOrEqual(68);
    expect(wcagContrast(p.inkMuted, p[ground])).toBeGreaterThanOrEqual(4.5);
  });

  // The quietest tier, and the one that regressed. It sits at the secondary/large-text
  // boundary by design — quiet is its job — but it carries real captions (the dock's
  // sub-place line, mosque distances, day-picker weekdays, the Om colophon), so it may
  // not fall back into the Lc 45 "non-text" band the way the dark value had.
  it.each(['paper', 'surface'] as const)('inkFaint stays above the caption floor on %s', (ground) => {
    expect(lc(p.inkFaint, p[ground])).toBeGreaterThanOrEqual(56);
    expect(wcagContrast(p.inkFaint, p[ground])).toBeGreaterThanOrEqual(3);
  });

  // `accent` is not decoration — it is the verb colour ("Återställ", the Om links, the
  // qibla status line), so it is read as text and answers to a text floor.
  it('accent is legible as text on paper', () => {
    expect(lc(p.accent, p.paper)).toBeGreaterThanOrEqual(62);
    expect(wcagContrast(p.accent, p.paper)).toBeGreaterThanOrEqual(4.5);
  });

  // The dock countdown and the next-prayer name — the single most-looked-at text in the
  // app, and the reason `highlightText` exists apart from `highlight`.
  it.each(['paper', 'surface', 'pillSurface'] as const)('highlightText is strong on %s', (ground) => {
    expect(lc(p.highlightText, p[ground])).toBeGreaterThanOrEqual(70);
    expect(wcagContrast(p.highlightText, p[ground])).toBeGreaterThanOrEqual(4.5);
  });

  // The Moon dial's face is a gradient between `surface` and `paperSunken`, and since the
  // month ring began printing today's number on it in brass — the one number on the rim, and
  // the answer to the only question the ring is asked — that face carries TEXT.
  //
  // It was first written with `highlight`, the GRAPHIC brass the notch itself is cut in, and
  // that measures Lc 46.6 / 2.67:1 on the light face: under every floor there is, and legible
  // only because the number is at most two characters long. The split between `highlight` and
  // `highlightText` exists for exactly this, and nothing enforced it on `paperSunken` because
  // nothing had put words there before.
  it.each(['surface', 'paperSunken'] as const)('highlightText carries the dial face on %s', (ground) => {
    expect(lc(p.highlightText, p[ground])).toBeGreaterThanOrEqual(60);
    expect(wcagContrast(p.highlightText, p[ground])).toBeGreaterThanOrEqual(4.5);
  });

  it('white-on-accent fills stay legible', () => {
    expect(lc(p.onAccent, p.accent)).toBeGreaterThanOrEqual(62);
    expect(wcagContrast(p.onAccent, p.accent)).toBeGreaterThanOrEqual(4.5);
  });

  // The lock pill — "Du är vänd mot Mecka", the one sentence the qibla screen exists to
  // say, on the app's only solid brass surface. It used to be dark ink on the GRAPHIC
  // brass (`highlight`), which WCAG scored 5.5:1 and APCA scored Lc 43: a mid-tone fill is
  // where WCAG 2 over-rates dark text, the mirror image of the light-on-dark flattery that
  // thinned the dark palette. Both measures now, so neither can be satisfied alone again.
  it('the solid brass pill carries its sentence by both measures', () => {
    expect(lc(p.onHighlight, p.highlightText)).toBeGreaterThanOrEqual(75);
    expect(wcagContrast(p.onHighlight, p.highlightText)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the highlight tile and the dock handle', () => {
  const composite = (fg: string, bg: string): string => {
    if (fg.startsWith('#')) return fg;
    const [r = 0, g = 0, b = 0, a = 1] = fg.slice(fg.indexOf('(') + 1, -1).split(',').map(Number);
    const base = [1, 3, 5].map((i) => Number.parseInt(bg.slice(i, i + 2), 16));
    return `#${[r, g, b].map((v, i) => Math.round(v * a + (base[i] ?? 0) * (1 - a)).toString(16).padStart(2, '0')).join('')}`;
  };

  // `highlightSoft` is a ground TEXT sits on — the next prayer's row, the selected place,
  // the "getting warmer" pill — so it answers to the same floors as the card it tints.
  it.each(SCHEMES)('$name highlightSoft still carries ink and brass', ({ p }) => {
    for (const ground of [p.paper, p.surface]) {
      const tile = composite(p.highlightSoft, ground);
      expect(wcagContrast(p.ink, tile)).toBeGreaterThanOrEqual(7);
      expect(wcagContrast(p.highlightText, tile)).toBeGreaterThanOrEqual(4.5);
      expect(lc(p.highlightText, tile)).toBeGreaterThanOrEqual(70);
    }
  });

  // A row under the finger wears `accentSoft`, the next prayer's and the chosen place's wear
  // `highlightSoft` — and the row's own text stays on it the whole time. The ink tiers were
  // only ever measured on the plain grounds; this measures them on every tile a row can be.
  it.each(SCHEMES)('$name ink and muted ink survive every tinted row', ({ p }) => {
    for (const ground of [p.paper, p.surface]) {
      for (const tint of [p.accentSoft, p.highlightSoft]) {
        const tile = composite(tint, ground);
        expect(lc(p.ink, tile)).toBeGreaterThanOrEqual(80);
        expect(wcagContrast(p.ink, tile)).toBeGreaterThanOrEqual(7);
        expect(lc(p.inkMuted, tile)).toBeGreaterThanOrEqual(62);
        expect(wcagContrast(p.inkMuted, tile)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // Links and "verbs" are accent TEXT, and most of them sit on cards, not on the page.
  it.each(SCHEMES)('$name accent is legible as text on a card as well as on the page', ({ p }) => {
    expect(lc(p.accent, p.surface)).toBeGreaterThanOrEqual(62);
    expect(wcagContrast(p.accent, p.surface)).toBeGreaterThanOrEqual(4.5);
  });

  // The chip — "Nu", "I dag", "Standard" — is the smallest text in the app (11 pt bold) and it
  // sits on the accent's own tint. `accent` itself measured Lc 58 there in dark, against 78
  // in light, which is why the pair has its own ink.
  it.each(SCHEMES)('$name onAccentSoft reads on the accent tint', ({ p }) => {
    for (const ground of [p.paper, p.surface]) {
      const tile = composite(p.accentSoft, ground);
      expect(lc(p.onAccentSoft, tile)).toBeGreaterThanOrEqual(70);
      expect(wcagContrast(p.onAccentSoft, tile)).toBeGreaterThanOrEqual(4.5);
      // ...and stays the accent, a tier under plain ink on the same tile.
      expect(lc(p.onAccentSoft, tile)).toBeLessThan(lc(p.ink, tile));
    }
  });

  // The grab handle is the only thing that says the dock opens. It may be quiet; it may
  // not be quiet in one theme and plain in the other, which is what 0.20 light against
  // 0.32 dark was (1.5:1 against 2.6:1).
  it('the dock handle stands off its card about as far in both schemes', () => {
    const off = (p: Palette) => wcagContrast(composite(p.handle, p.surface), p.surface);
    expect(off(lightPalette)).toBeGreaterThanOrEqual(1.9);
    expect(off(darkPalette)).toBeGreaterThanOrEqual(1.9);
    expect(Math.abs(off(lightPalette) - off(darkPalette))).toBeLessThanOrEqual(0.7);
  });
});

describe('graphic tiers — the Lc 45 / 3:1 non-text bar', () => {
  // `highlight` is the qibla needle, the location dot and the widget glyphs: a GRAPHIC,
  // held to the non-text bar, and deliberately NOT brightened to a text bar (a needle
  // bright enough to be read as prose shouts across the whole compass).
  it.each(SCHEMES)('$name highlight reads as a graphic on paper', ({ p }) => {
    expect(lc(p.highlight, p.paper)).toBeGreaterThanOrEqual(45);
  });

  // KNOWN AND DELIBERATE (2026-06 review): light `highlight` measures 2.92:1 on paper,
  // a whisker under WCAG's 3:1 for non-text. It is compensated by the white rim/glow the
  // needle and location dot carry, and it clears the bar on `surface` (3.18) where the
  // needle actually sits. Pinned here so the shortfall stays a decision rather than
  // rotting into an accident — and so nobody "fixes" the brass and breaks the tuning.
  it('documents the one deliberate shortfall rather than hiding it', () => {
    expect(wcagContrast(lightPalette.highlight, lightPalette.paper)).toBeLessThan(3);
    expect(wcagContrast(lightPalette.highlight, lightPalette.paper)).toBeGreaterThan(2.9);
    expect(lc(lightPalette.highlight, lightPalette.paper)).toBeGreaterThanOrEqual(45);
  });
});

describe('light/dark parity — the drift guard', () => {
  // THE headline invariant. Before 2026-08 these gaps were inkMuted 15.8, inkFaint 25.2,
  // highlightText 22.9 — a light scheme tuned by eye and a dark scheme that had merely
  // been checked for AA. A tier that reads strongly in one scheme and thinly in the other
  // is not one design system, and no absolute floor catches it.
  const PARITY: [keyof Palette, number][] = [
    ['inkMuted', 6],
    ['inkFaint', 8],
    ['highlightText', 12],
  ];
  it.each(PARITY)('%s reads about as strongly in both schemes', (token, maxGap) => {
    const light = lc(lightPalette[token], lightPalette.paper);
    const dark = lc(darkPalette[token], darkPalette.paper);
    expect(Math.abs(light - dark)).toBeLessThanOrEqual(maxGap);
  });

  // `accent` is the documented exception: light accent is an unusually strong Prussian
  // indigo (Lc 85) and matching it in dark would mean a near-white periwinkle that stops
  // reading as a colour at all. It clears the text floor with room, which is the bar that
  // matters; the gap is the cost of keeping it recognisably blue.
  it('accent is allowed a wider gap, but still clears the text floor', () => {
    const dark = lc(darkPalette.accent, darkPalette.paper);
    expect(dark).toBeGreaterThanOrEqual(62);
    expect(lc(lightPalette.accent, lightPalette.paper) - dark).toBeLessThanOrEqual(22);
  });
});

describe('brand mark', () => {
  // The mark is one artwork across web and mobile, so these must stay byte-identical to
  // --mark-blue / --mark-gold in apps/web/src/styles/tokens.css. They are also what the
  // shipped PNGs are drawn in: assets/images/splash-icon.png centres on brand.gold.light
  // and splash-icon-dark.png on brand.gold.dark.
  it('matches the web tokens verbatim', () => {
    expect(brand.blue).toEqual({ light: '#2a557f', dark: '#4b739d' });
    expect(brand.gold).toEqual({ light: '#e1b761', dark: '#fad486' });
  });

  // Why the mark is blue-outermost and why brand gold is NOT the UI highlight: gold
  // cannot carry an edge or a label on the light ground. Asserting it keeps a future
  // session from "unifying" highlight onto the brand gold and quietly making the
  // next-prayer emphasis unreadable in daylight.
  it('brand gold cannot be used as light-mode text — which is why highlight is its own token', () => {
    expect(wcagContrast(brand.gold.light, lightPalette.paper)).toBeLessThan(2);
    expect(wcagContrast(lightPalette.highlightText, lightPalette.paper)).toBeGreaterThanOrEqual(4.5);
  });

  // On the DARK ground the two goals coincide: the mark's gold is also the most legible
  // choice, so dark highlightText simply IS the brand gold.
  it('is legible on the dark ground, where it doubles as highlightText', () => {
    expect(darkPalette.highlightText).toBe(brand.gold.dark);
    expect(lc(brand.gold.dark, darkPalette.paper)).toBeGreaterThanOrEqual(70);
  });

  // The day scrubber's knob is the mark, drawn small: gold disc, blue ring. That is a
  // deliberate request, not a coincidence of two tokens happening to match — so it is
  // pinned. The neighbouring rule ("brand gold could never carry label text") is the
  // thing most likely to talk a future session out of it; the answer is that a knob is
  // not text and its RING is what carries the contrast, which is the next assertion.
  it('is what the day scrubber knob is drawn in, in both schemes', () => {
    expect(lightPalette.scrubberKnob).toBe(brand.gold.light);
    expect(lightPalette.scrubberRing).toBe(brand.blue.light);
    expect(darkPalette.scrubberKnob).toBe(brand.gold.dark);
    expect(darkPalette.scrubberRing).toBe(brand.blue.dark);
  });

  // A control's boundary is what has to clear 3:1 for WCAG non-text contrast, and on the
  // light ground the gold fill alone is 1.75:1. Drop the ring (or recolour it to
  // something quiet) and the knob stops being a discernible control in daylight, with
  // nothing else in the scrubber to say where it is.
  it('gives the scrubber knob its contrast through the ring, not the fill', () => {
    expect(wcagContrast(lightPalette.scrubberKnob, lightPalette.paper)).toBeLessThan(3);
    expect(wcagContrast(lightPalette.scrubberRing, lightPalette.paper)).toBeGreaterThanOrEqual(3);
    expect(lc(darkPalette.scrubberKnob, darkPalette.paper)).toBeGreaterThanOrEqual(70);
  });
});
