// The app's single design source of truth. Every surface speaks one Nordic
// language: a calm warm-paper / cool-navy ground (light / dark), a single solar
// night-indigo accent, hairline structure, and a restrained type scale. Settings
// screens consume these via `useSettingsColors()`; map and screens directly via
// `useColors()`.
import type { TextStyle, ViewStyle } from 'react-native';

/** 4/8-based spacing scale — the only gaps/paddings the app should use. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** Corner radii. `xl` is the floating-card radius; `round` for pills/circles. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  round: 999,
} as const;

/**
 * THE MARK'S OWN COLOURS — the blue/gold concentric rings of the islam.se logo.
 * These are the SAME values as `--mark-blue` / `--mark-gold` in
 * `apps/web/src/styles/tokens.css`; the mark is one artwork across web and mobile, so
 * it gets one pair of colours. Two sets because no single pair clears both grounds:
 * the blue that reads on cream (7.2:1) collapses to 2.1:1 on the dark ground.
 *
 * NOT a UI accent, and deliberately not the same thing as `accent` / `highlight`
 * below. The mark identifies the app (icon, splash, the Android notification's
 * tinted glyph); `accent` and `highlight` are FUNCTIONAL colours derived from the
 * solar palette, and they answer to contrast requirements the mark does not — brand
 * gold measures 1.75:1 on the light ground and could never carry label text. Reach
 * for `brand` only where the LOGO is what's being drawn.
 */
export const brand = {
  blue: { light: '#2a557f', dark: '#4b739d' },
  gold: { light: '#e1b761', dark: '#fad486' },
} as const;

// Colour. Two palettes — light + dark — sharing one key set, so `useColors()`
// (theme/useColors.ts) can hand a surface the active one and every component reads
// the same names. The light palette is a WARM editorial parchment that makes the
// app read as family with the islam.se website. The dark palette is a COOL deep
// navy: when the OS is dark the Bönetider basemap also goes deep navy (Apple
// Maps-style), so the screens, sheets and modal backdrops share the basemap's
// temperature — that's what makes the screen→map handoff coherent instead of a
// warm-dark island sitting on a cool-dark map (or vice versa).
//
// Two accents, by design (the visual hierarchy):
//   • `accent` — a deepened night-indigo. The workhorse interactive / structure /
//     "now" signal. It's the solar palette's isha hue, so the chrome speaks the
//     same sun-arc language as the living map.
//   • `highlight` — a warm brass-gold. Reserved for the single "this is live right
//     now" element on a surface (the NEXT prayer, the qibla lock). Used sparingly,
//     so it always means "look here". Brass already lives in the prayer-line palette
//     (sunrise/asr), so it isn't foreign — and it bridges to the website's warmth.
export const lightPalette = {
  // Grounds & surfaces
  paper: '#f6f3ed', //        screen background — warm neutral parchment
  paperSunken: '#eee9df', //  insets / pressed grouping
  surface: '#fffdf8', //      opaque cards — warm white
  cardGlass: 'rgba(255,253,248,0.90)', // translucent card over the living map

  // Ink — warm charcoal, web-aligned. Muted/faint are deepened vs the old cool
  // greys so secondary text actually reads (the old #8b94a0 was the "faint" feel).
  // inkFaint sits at ≥3:1 on every ground it renders on (paper 3.45, surface 3.76,
  // basemap land 3.07) — the WCAG floor for large/UI text — while staying a clear
  // tier below inkMuted (5.2). The previous #978c7b dipped to 2.98 on paper.
  ink: '#1a1712',
  inkMuted: '#6f6456',
  inkFaint: '#8c8170',

  // Structure — warm borders, hairline opacity bumped 0.08 → 0.10 so edges show.
  border: '#e4ddce',
  separator: '#eee9df',
  hairline: 'rgba(26,23,18,0.10)',

  // Accent — Prussian night-indigo (isha). Structure / interactive / "now".
  // 2026 refinement: shifted from `#3a4684` toward Prussian/sapphire (H 230°→226°,
  // L 37%→34%) — the May 2026 "refined jewel tone" centre, away from periwinkle.
  accent: '#33437a',
  accentDeep: '#26315e',
  accentSoft: '#e7e8f1',

  // Highlight — warm brass-gold. The "live right now" emphasis (next prayer, qibla
  // lock). `highlightText` is the legible brass foreground on light surfaces; `onHighlight`
  // is the legible text/icon colour on a brass fill.
  highlight: '#b8862f',
  highlightSoft: '#f1e7d0',
  highlightText: '#805b1f',
  onAccent: '#ffffff', //     text/icon on an indigo fill
  onHighlight: '#1a1712', //  text/icon on a brass fill

  // Slider / track, the switch knob and the dock's grab handle.
  track: 'rgba(26,23,18,0.14)',
  thumb: '#fffdf8', //        switch knob (warm white)
  handle: 'rgba(26,23,18,0.20)', // dock grab handle

  // The day scrubber IS the mark: a gold disc inside a blue ring, sliding along a
  // blue trail. This is the one place in the chrome that draws the logo rather than
  // referencing it, which is why it reaches for `brand` (see that export's note) —
  // the elapsed trail is brand blue's channels, and the knob is the mark itself.
  //
  // Brand gold is 1.75:1 on this light ground and could never carry text, but a knob
  // is not text: the 2 px `scrubberRing` at 7.2:1 is what draws its boundary, and
  // WCAG non-text contrast is satisfied by that boundary, not by the fill. Keep the
  // ring if the fill is ever changed.
  trackFill: 'rgba(42,85,127,0.40)', // brand.blue.light channels — keep in step
  scrubberKnob: brand.gold.light,
  scrubberRing: brand.blue.light,

  // Map prayer-pill surface. Opaque on purpose: the pills float over the changing
  // wash and basemap, so a translucent border composites unevenly behind the rounded
  // caps and they read as ragged. Opaque fill + opaque border = uniform smooth edge.
  // (The pill BORDER is the prayer's own line hue, set at the call site — next-prayer
  // emphasis is brass label text, never a border recolour that breaks the line bond.)
  pillSurface: '#fffdf8',

  shadow: '#1c150b', //       warm shadow (was cool #0b1220)
} as const;

/** The shared shape both palettes satisfy — every surface reads these names. */
export type Palette = { readonly [K in keyof typeof lightPalette]: string };

// Cool dark — paired with the new dark Bönetider basemap (Apple Maps-inspired
// navy land). Grounds are a slightly blue-tinted deep navy so screens, sheets,
// modal backdrops and the basemap LAND share temperature — the screen→map
// handoff reads as one continuous world instead of a warm-dark island over a
// cool-dark map. We keep the WARM pale ink: the warm-on-cool tension is the
// app's visual signature, and the contrast is high. The 2026 May Prussian /
// brass jewel-tones stay; accent is the solar isha HUE for both modes.
//
// ── The foreground tiers are set by APCA, not by WCAG (2026-08) ────────────────
// Every tier below used to be chosen against WCAG 2, and by that measure they were
// all comfortably AA (6.1–7.7:1). Measured with APCA they were not: `inkMuted` came
// in at Lc 55, `accent`-as-text at Lc 51, `highlightText` at Lc 50, and `inkFaint` —
// which carries real 13 pt captions (dock sub-place, mosque distance, day-picker
// weekdays, the Om colophon) — at **Lc 33**, which is APCA's non-text/disabled band.
//
// This is not a new opinion, it is a known defect in the WCAG 2 formula: it
// systematically flatters LIGHT-ON-DARK, so a dark palette can pass AA everywhere and
// still be thin to read. apps/web hit exactly this and re-cut its own dark column by
// APCA (see `--color-muted` in apps/web/src/styles/tokens.css, which notes its old
// value "passed WCAG AA at 4.64:1 — and measured APCA Lc 35"). Mobile never got that
// pass, which is how the two platforms drifted apart in the dark.
//
// The correction moves LIGHTNESS ONLY, holding OKLCh hue and chroma (every tier below
// stayed within 3° of hue and 0.001 of chroma) — the same technique PRAYER_TEXT_COLORS
// in lib/solar/palette.ts already used to make the light pill labels legible. So the
// palette's identity is untouched; only its legibility moved. The resulting ladder
// lines up with the web's dark ladder almost exactly:
//
//     tier            Lc here   web's dark equivalent
//     ink                87.8   --color-text   89.9
//     highlightText      81.3   --text-body    81.3
//     inkMuted           70.0   --text-quiet   72.2
//     accent             65.5   --text-meta    67.7
//     inkFaint           62.0   --color-muted  62.0
//
// theme/tokens.test.ts pins these, so the two platforms cannot silently diverge again.
export const darkPalette: Palette = {
  paper: '#161a26', //          cool deep navy ground (was warm #181613)
  paperSunken: '#0f121b', //    deeper sunken navy
  surface: '#1d2233', //        opaque cards — matches basemap LAND so cards over a dark map sit nearly invisibly raised
  cardGlass: 'rgba(29,34,51,0.90)', // translucent card over the night map

  ink: '#e8e3d8', //            warm pale ink (deliberate warm/cool tension)
  inkMuted: '#c1c6d4', //       cool muted — neutral on navy (was #a8acba, Lc 55 → 70)
  inkFaint: '#b1b8cd', //       cool faint label tier (was #7a8094, Lc 33 → 62)

  border: '#2a3045',
  separator: '#222840',
  hairline: 'rgba(225,232,255,0.12)',

  // Dark accent mirrors the light token's Prussian shift (green-ward, not just dimmer),
  // so light↔dark sits on one hue axis. Lifted from #94a2dd (Lc 51 → 65) because it is
  // read as TEXT here, not just drawn as an icon — "Återställ", the Om links, the qibla
  // status line. `accentDeep` is the PRESSED fill under it and keeps the same OKLab-L
  // press delta (0.082) it always had, so the press still reads as one step down.
  accent: '#adbcf8',
  accentDeep: '#90a1e5',
  accentSoft: 'rgba(173,188,248,0.16)',

  // `highlight` is the GRAPHIC brass — the qibla needle, the location dot, the widget
  // glyphs. It stays at the 2026 "Cloud Dancer calm" value: as a graphic it needs Lc 45
  // and measures 50, so it is fine, and brightening it would make the needle shout.
  // `highlightText` is a different job — the dock countdown and the next-prayer name —
  // and at #c89a48 it measured Lc 50, under the Lc 60 floor for text. Dark mode had
  // simply collapsed the two into one value; light mode never did (#b8862f fill vs
  // #805b1f text). Split again, and the text half lands on the MARK's own dark gold,
  // so the app's loudest "look here" is now literally the brand colour.
  highlight: '#c89a48',
  highlightSoft: 'rgba(200,154,72,0.16)',
  highlightText: brand.gold.dark,
  onAccent: '#161a26',
  onHighlight: '#161a26',

  track: 'rgba(225,232,255,0.16)',
  thumb: '#e8e3d8',
  handle: 'rgba(225,232,255,0.32)',

  // Scrubber = the mark, dark cut. Both halves take the DARK brand pair for the same
  // reason the pair exists: #2a557f collapses to 2.1:1 on this ground. The alpha is
  // 0.60 rather than light mode's 0.40 because brand blue on navy is a far quieter
  // trail than the periwinkle this replaced — 0.60 restores its old visual weight
  // without letting the trail outshout the prayer pips riding on it.
  trackFill: 'rgba(75,115,157,0.60)', // brand.blue.dark channels — keep in step
  scrubberKnob: brand.gold.dark,
  scrubberRing: brand.blue.dark,

  // Map prayer-pill surface (dark). A touch LIGHTER than `paper`/`surface` so pills lift
  // off the night basemap as discrete elements; opaque so their rounded caps stay smooth
  // over the changing wash. (Border = the prayer's line hue, set at the call site.)
  pillSurface: '#222840',

  shadow: '#000000',
};

// Type scale. System font (SF / Roboto — both clean and Nordic-friendly) with a
// disciplined hierarchy: a few sizes, deliberate weights, generous line-height on
// reading text, and a quiet sentence-case label for section headers. No arrays here so
// the object can be `as const` (literal weights) and spread straight into styles;
// tabular figures live in `mono` below.
export const type = {
  title: { fontSize: 28, fontWeight: '700', letterSpacing: 0, lineHeight: 34 },
  headline: { fontSize: 20, fontWeight: '700', letterSpacing: 0, lineHeight: 26 },
  // The one paragraph that sits under a hero title (the introduction's `lead`). A tier of
  // its own rather than `body`, because `body` is also what the CONTROLS underneath it are
  // set in — a lead at the same size and weight as the option labels it introduces reads
  // as one more row rather than as the sentence that frames them. One step up in size and
  // line-height is enough to put it in a different voice without crowding the title.
  lead: { fontSize: 17, fontWeight: '400', lineHeight: 25 },
  bodyStrong: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  callout: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  // Settings section header. Sentence-case (not uppercase) — a calm Linear/Notion-style
  // header that whispers the group name rather than shouting it. Paired with a muted ink
  // colour at the call-site; the near-zero tracking keeps it quiet next to 16pt body rows.
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '500', letterSpacing: 0.3 },
} as const;

/** Tabular figures — for clocks, countdowns, ticks (kept apart from `type` so the
    array doesn't force the scale readonly). Spread alongside a size from `type`. */
export const mono: TextStyle = { fontVariant: ['tabular-nums'] };

/** Elevation presets — soft, low, Nordic (never a hard drop shadow). The shadow colour
    is the LIGHT palette's on both themes: a shadow reads as the absence of light, and
    the warm near-black is dark enough to disappear against the night grounds anyway. */
export const shadow = {
  card: {
    shadowColor: lightPalette.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  button: {
    shadowColor: lightPalette.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  thumb: {
    shadowColor: lightPalette.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  // A whisper of shadow for quiet map annotations (the prayer pills float over the
  // changing wash, so they want presence without a visible drop). Lighter than `thumb`.
  dot: {
    shadowColor: lightPalette.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} satisfies Record<string, ViewStyle>;

/** Motion. Durations in ms; one spring for every snap so the app feels of a piece. */
export const motion = {
  // `quick` (110) sits below `fast` on purpose: it's the sensor-tracking easing for
  // the Qibla compass, which must follow the magnetometer near 1:1 or it feels laggy.
  quick: 110,
  fast: 160,
  base: 240,
  slow: 350,
  spring: { damping: 20, stiffness: 200, mass: 0.6 },
} as const;
