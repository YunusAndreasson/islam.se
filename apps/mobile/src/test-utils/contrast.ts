// The colour-contrast oracle the palette tests measure against. Deliberately a
// SEPARATE implementation from anything in src/lib — it exists to check the design
// tokens from the outside, so it must not share code with them.
//
// TWO measures, because they disagree and the disagreement is the point:
//
//   • WCAG 2.x contrast ratio — the legal/《AA》 bar (4.5:1 body, 3:1 large/UI). Kept
//     because it is what accessibility audits and app-store reviewers cite.
//   • APCA Lc (the WCAG 3 candidate, "Accessible Perceptual Contrast Algorithm") —
//     kept because WCAG 2's formula is known to be inaccurate for LIGHT-ON-DARK text
//     and will happily pass a dark palette that is genuinely thin to read. apps/web
//     found this on its own tokens (`--color-muted` there notes an old value that
//     "passed WCAG AA at 4.64:1 — and measured APCA Lc 35"); this app's dark tiers had
//     the same defect until 2026-08. Measuring both is what stops it recurring.
//
// APCA Lc is a 0–106ish score, signed by polarity: POSITIVE for dark text on a light
// ground, NEGATIVE for light text on a dark ground. Tests compare |Lc|. Rough floors:
// 75 for primary body text, 60 for secondary/body, 45 for large text and non-text
// graphics. (The full APCA lookup also weights font size and weight; these are the
// simplified "bronze" tiers, which is the level a design-token test can meaningfully
// hold.)

/** Parse `#rrggbb` into 0–255 channels. */
function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance. */
function luminance(hex: string): number {
  // Applied per channel rather than through `.map()`: mapping a 3-tuple yields a plain
  // number[], which drops the "there are exactly three of these" fact and makes the
  // destructure below three possibly-undefined values feeding a weighted sum. Naming
  // the transfer function keeps the triple a triple.
  const linear = (c: number): number => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio, 1..21. Order-independent. */
export function wcagContrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  // Compared directly rather than sorted into a destructured pair: `.sort()` on an array
  // literal returns number[], so `[hi, lo]` came back possibly-undefined and the ratio
  // could have been NaN without anything saying so.
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// APCA-W3 0.1.9 constants. Do not "simplify" these — they are a fitted curve, not a
// derivation, and the published test vectors (see contrast.test.ts) pin them.
const MAIN_TRC = 2.4;
// FOUR exponents, not two. Background and text get different TRCs, and both differ
// between polarities — which is exactly how APCA encodes the light-on-dark asymmetry
// that WCAG 2 misses. Collapsing them to one per polarity is wrong by ~0.6 Lc at the
// extremes and silently shifts every threshold; contrast.test.ts pins the published
// vectors so that mistake cannot survive.
const NORM_BG = 0.56;
const NORM_TXT = 0.57;
const REV_TXT = 0.62;
const REV_BG = 0.65;
const B_THRSH = 0.022;
const B_CLIP = 1.414;
const SCALE = 1.14;
const LO_CLIP = 0.1;
const LO_OFFSET = 0.027;

/** Screen luminance for APCA (a different, simpler TRC than WCAG's). */
function apcaY(hex: string): number {
  // Per channel rather than through `.map()`, for the same reason as `luminance` above.
  const trc = (c: number): number => (c / 255) ** MAIN_TRC;
  const [r, g, b] = channels(hex);
  return 0.2126729 * trc(r) + 0.7151522 * trc(g) + 0.072175 * trc(b);
}

/**
 * APCA lightness contrast, Lc. Positive = dark text on a light ground, negative =
 * light text on a dark ground; `text` and `background` are NOT interchangeable.
 */
export function apcaLc(text: string, background: string): number {
  const soften = (y: number): number => (y > B_THRSH ? y : y + (B_THRSH - y) ** B_CLIP);
  const ytxt = soften(apcaY(text));
  const ybg = soften(apcaY(background));
  if (Math.abs(ybg - ytxt) < 0.0005) return 0;

  if (ybg > ytxt) {
    const s = (ybg ** NORM_BG - ytxt ** NORM_TXT) * SCALE;
    return (s < LO_CLIP ? 0 : s - LO_OFFSET) * 100;
  }
  const s = (ybg ** REV_BG - ytxt ** REV_TXT) * SCALE;
  return (s > -LO_CLIP ? 0 : s + LO_OFFSET) * 100;
}

/** |Lc| — what a threshold assertion actually wants, polarity being a given. */
export function lc(text: string, background: string): number {
  return Math.abs(apcaLc(text, background));
}
