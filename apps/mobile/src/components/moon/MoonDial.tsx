// The Moon dial — the qibla compass's twin, on the same face, answering the other question.
//
// One instrument, two things it can be pointed at, chosen by the switch above the readout:
//
//   MÅNADEN   the rim is the lunar month. Thirty notches cut round the edge like the day
//             marks on a runstav — the Swedish perpetual calendar stave, which carried the
//             new moons of the nineteen-year cycle in its second row of marks and is, of all
//             the things the Nordic countries made, the one closest in kind to a Hijri month.
//             Day one is the deep-cut head of the stave at the top; the notches darken as
//             the days are used up; the three white days stand taller in brass; today is the
//             wide brass mark, AND IT CARRIES ITS OWN NUMBER. The Moon is at the hub, at
//             tonight's phase.
//
//             ⚠️ HOW FAR THE COMPASS ANALOGY GOES, AND WHERE IT STOPS. The first version
//             wore the whole instrument: the aim index at twelve o'clock, and every fifth
//             day numbered round the rim. Read off a real screen the verdict was "I don't
//             immediately see that today is the 8th" — which is the only thing this ring
//             exists to say. Two reasons, both of them the analogy pushed past its use:
//             an index is a thing you AIM, and on a calendar ring it pointed at day one,
//             which nobody aims at; and today was the one mark on the ring WITHOUT a
//             number, so finding it meant counting notches from a label. So in month mode
//             there is no index — day one is already the deepest cut — and the only numbers
//             on the rim are today's, in brass on its own mark, and the last day's, which
//             answers whether this month runs 29 or 30. The compass chrome stays where it
//             is a compass.
//
//   PÅ HIMLEN the rim is the horizon, and this IS the qibla compass with a different target:
//             the rose turns against the phone's heading and the needle carries the Moon to
//             where it actually stands. Hold the phone up and walk the needle round, and you
//             are looking at the real thing — which is the only way anyone has ever settled
//             the beginning of a month.
//
//             ⚠️ AND IT WARMS THE SAME WAY THE COMPASS DOES. The needle, the aim index and
//             the hub all carry a brass twin faded in by `prox` — 1 when the phone is on the
//             Moon's bearing, 0 by 45° off — over a halo behind the Moon that swells as you
//             close in. That is not decoration: a binary lock gives the reader nothing to
//             steer by until the instant they are already there, and Don Norman's argument
//             for graded feedback is the same argument on both screens. Sharing the ramp
//             (and its exact numbers, in lib/aim) is what makes the second instrument feel
//             like the first one rather than like a different app's idea of a compass.
//
// The face, the ticks, the cardinal letters, the index and the hub all come from theme/dial,
// so this and Qibla cannot drift apart. What is written here is only what is the Moon's.
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';

import { MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import { DialSight } from '@/components/ui/DialSight';
import type { RingDay } from '@/lib/moon/month';
import { skyReach } from '@/lib/moon/shape';
import { makeDialStyles, rotate as rot, useBrassStyles } from '@/theme/dial';
import { hexToRgba } from '@/theme/rgba';
import { mono, motion, type Palette, type } from '@/theme/tokens';

export type MoonDialMode = 'month' | 'sky';

/** Cardinal points, Swedish — "O" for east, the convention SMHI and Swedish charts use.
 *  The same four letters the qibla rose carries, deliberately. */
const CARDINALS: readonly { deg: number; label: string }[] = [
  { deg: 0, label: 'N' },
  { deg: 90, label: 'O' },
  { deg: 180, label: 'S' },
  { deg: 270, label: 'V' },
];
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

/** Which day numbers get a printed label besides today's own. Just the last one — the answer
 *  to whether this month runs 29 days or 30, which is the only thing the rim is asked beyond
 *  "where are we". Dropped when today is on it or beside it, where the two numbers would sit
 *  on top of each other and today's is the one that matters. */
function labelledDays(length: number, today: number | null): ReadonlySet<number> {
  return new Set<number>(today != null && Math.abs(length - today) <= 1 ? [] : [length]);
}

interface Props {
  size: number;
  mode: MoonDialMode;
  /** Every day of the Hijri month on screen, with its mark. */
  ring: readonly RingDay[];
  /** 1-based day of that month the reader is on, or null when the month shown is not the
   *  one they are living in — the ring then has no "now" and draws none. */
  today: number | null;
  /** Illuminated fraction and the tilt of the bright limb over the reader's own horizon. */
  illumination: number;
  tilt: number;
  /** Sky mode: where the Moon stands. */
  azimuth: number;
  altitude: number;
  /** Sky mode: the UNWRAPPED live heading (deg) from lib/useAim. The rose turns by MINUS
   *  this, so a needle pinned inside it at the Moon's azimuth lands on the real Moon. */
  rotation: SharedValue<number>;
  /** Sky mode: "getting warmer" 0..1 — 1 when the phone is on the Moon's bearing. */
  prox: SharedValue<number>;
  /** Sky mode: false when there is no trustworthy heading — the rose then stays north-up and
   *  the screen says so, rather than turning to a direction it does not have. */
  live: boolean;
  c: Palette;
}

// Memoised for the same reason Qibla's Dial is: the readout above it re-renders on a clock
// tick and, in sky mode, whenever the heading band moves, and the thirty notches have no
// business reconciling for either. Every prop is a primitive, a stable palette, a frozen
// array or a shared value whose identity never changes.
export const MoonDial = memo(function MoonDial({
  size,
  mode,
  ring,
  today,
  illumination,
  tilt,
  azimuth,
  altitude,
  rotation,
  prox,
  live,
  c,
}: Props) {
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();
  // Switching modes swaps a 0.34-size Moon at the centre for a 0.13-size Moon out on a
  // needle — the largest thing on the screen changing size and position at once. Cut hard,
  // that reads as a glitch rather than as an instrument changing what it is pointed at, and
  // it was reported as one. A cross-fade is the whole fix; it costs nothing and it is the
  // only thing that says the two drawings are the same instrument.
  //
  // ⚠️ THE KEYS ARE LOAD-BEARING. Both branches render an Animated.View, so without distinct
  // keys React reconciles them as ONE element, updates it in place, and neither `entering`
  // nor `exiting` ever fires — a silent no-op that looks exactly like the bug it was meant
  // to fix.
  const fade = reduceMotion
    ? {}
    : { entering: FadeIn.duration(motion.base), exiting: FadeOut.duration(motion.fast) };
  // The Moon goes brass on the white days, exactly as the map's nav disc does. Derived from
  // the ring rather than passed in, so the dial and its own notches cannot disagree about
  // which days those are.
  const brass = ring.find((d) => d.day === today)?.mark?.kind === 'white';
  const ink = useMoonInk(brass);
  const r = size / 2;
  // ⚠️ BOTH OF THESE ARE GATED ON `live`, and they have to move together. When there is no
  // trustworthy heading the rose does not turn — but `rotation` keeps tracking the phone
  // regardless, so a counter-rotation still applied would spin the Moon's own drawing inside
  // a rose standing still, which is the crescent visibly leaning the wrong way while the
  // screen says the direction cannot be trusted.
  const roseStyle = useAnimatedStyle(
    () => ({ transform: [{ rotate: `${live ? -rotation.value : 0}deg` }] }),
    [live],
  );
  // Undoes the rose's own turn for whatever it wraps. It has to be an ANIMATED style, not a
  // static one: `rotation` lives on the UI thread and a `rot(-something)` computed in render
  // cannot cancel a value that moves between renders. See the Moon on the needle below.
  const counterRoseStyle = useAnimatedStyle(
    () => ({ transform: [{ rotate: `${live ? rotation.value : 0}deg` }] }),
    [live],
  );
  // The brass twin every "you are on it" overlay shares — needle, index and hub warm as one
  // thing rather than three — and the halo behind the Moon. Both from theme/dial, so this and
  // the qibla dial cannot drift on a swell constant. See useBrassStyles.
  const { brass: brassStyle, glow: glowStyle } = useBrassStyles(prox, reduceMotion);
  const labelled = useMemo(() => labelledDays(ring.length, today), [ring.length, today]);
  const below = altitude <= 0;
  // Sky mode is a dome seen from underneath: azimuth runs round the rim, ALTITUDE runs
  // inward, so low is out near the edge and the zenith is the centre. That turns the second
  // mode from an arrow that merely points into an instrument you can read — a Moon sitting
  // low is one you will lose behind the rooftops, and in Sweden a good half of them are.
  //
  // Where the Moon rides on the needle: out near the rim when it is low, in toward the hub
  // when it is high. The mapping and the reason its numbers are what they are live in
  // lib/moon/shape, where they can be tested — the first version's constants were load-
  // bearing, wrong, and invisible in every screenshot.
  const moonSize = Math.round(size * 0.13);
  const moonInset = Math.max(0, r - r * skyReach(altitude) - moonSize / 2);

  return (
    <View style={[styles.dialWrap, { width: size, height: size }]}>
      <LinearGradient colors={[c.surface, c.paperSunken]} style={[styles.face, { borderRadius: r }]} />
      <View
        style={[styles.innerRing, { width: size * 0.66, height: size * 0.66, borderRadius: size * 0.33 }]}
        pointerEvents="none"
      />

      {mode === 'month' ? (
        <Animated.View
          key="month"
          style={[StyleSheet.absoluteFill, styles.modeLayer]}
          pointerEvents="none"
          {...fade}
        >
          {ring.map(({ day, mark }) => {
            // Day one under the index, the month running clockwise from it.
            const deg = ((day - 1) / ring.length) * 360;
            const white = mark?.kind === 'white';
            const isToday = today === day;
            // Dim only PLAIN days once they are behind us. Stacking a `past` style on top of
            // the others quietly grey out the white days and the head of the stave as the
            // month went on — so from the 16th onward the ring lost the three marks it exists
            // to show. Days that mean something keep their mark all month.
            const past = today != null && day < today;
            const pastPlain = past && !white;
            return (
              <View key={day} style={[StyleSheet.absoluteFill, rot(deg)]} pointerEvents="none">
                <View style={styles.notchSlot}>
                  {/* The notch sits at the top of a bed as tall as the tallest of them, so
                      every label lands on ONE radius. Laid out in the flow instead, today's
                      20 dp mark pushed its own number eleven points further out than the
                      last day's, and the two numbers on the rim visibly disagreed about
                      where the ring's text belongs. */}
                  <View style={styles.notchBed}>
                    <View
                      style={[
                        styles.notch,
                        day === 1 && styles.notchFirst,
                        white && styles.notchWhite,
                        pastPlain && styles.notchPast,
                        isToday && styles.notchToday,
                      ]}
                    />
                  </View>
                  {isToday || labelled.has(day) || past ? (
                    // Counter-rotated so the number is upright wherever it sits on the ring.
                    <Text
                      style={[
                        styles.notchLabel,
                        past && styles.notchLabelPast,
                        isToday && styles.notchLabelToday,
                        rot(-deg),
                      ]}
                    >
                      {day}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
          <View style={styles.moonHub} pointerEvents="none">
            <MoonDisc size={Math.round(size * 0.34)} illumination={illumination} tilt={tilt} {...ink} />
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          key="sky"
          style={[StyleSheet.absoluteFill, styles.modeLayer]}
          pointerEvents="none"
          {...fade}
        >
          {/* The axis the Moon has to travel up to meet — the same fixed sight the qibla dial
              draws, and the thing that turns "a needle points somewhere" into "turn until it
              reaches the top". BEFORE the rose, exactly as on Qibla: painted after it, this
              2 dp hairline runs straight over the Moon and its halo, and does so most visibly
              at the moment of alignment, when the needle sits under the sight at full brass. */}
          <DialSight radius={r} c={c} />

          {/* The rose. It turns against the phone when there is a heading to turn against,
              and stays north-up when there is not — the honest fallback Qibla uses, and the
              only state an emulator or a tablet without a magnetometer can ever show. The
              gate is inside `roseStyle`, not here: a style swapped in and out of the array
              leaves the last frame's transform standing on the UI thread. */}
          <Animated.View style={[StyleSheet.absoluteFill, roseStyle]}>
            {TICKS.map((deg) => (
              <View key={`t${deg}`} style={[StyleSheet.absoluteFill, rot(deg)]} pointerEvents="none">
                <View style={styles.tickSlot}>
                  <View style={deg % 90 === 0 ? styles.tickMajor : styles.tickMinor} />
                </View>
              </View>
            ))}
            {CARDINALS.map((card) => (
              <View key={card.label} style={[StyleSheet.absoluteFill, rot(card.deg)]} pointerEvents="none">
                <View style={styles.cardinalSlot}>
                  <Text style={[styles.cardinal, card.label === 'N' && styles.cardinalN, rot(-card.deg)]}>
                    {card.label}
                  </Text>
                </View>
              </View>
            ))}

            {/* The Moon on its needle, pinned at its azimuth inside the rose — so the rose's
                −heading rotation lands it on the real Moon. Dimmed when it is under the
                horizon: the direction is still true, there is just nothing there to see, and
                the readout says which. */}
            <View style={[StyleSheet.absoluteFill, rot(azimuth), below && styles.belowHorizon]} pointerEvents="none">
              <View style={[styles.needleSlot, { height: r }]}>
                <View style={[styles.needleMoon, { width: moonSize, height: moonSize, marginTop: moonInset }]}>
                  {/* The halo. Sized off the Moon rather than fixed, because the Moon on the
                      needle is a fraction of the dial and a 60 dp circle behind a 30 dp Moon
                      on a small phone is a blob with a Moon somewhere in it. Centred by the
                      negative inset, which is cheaper than a wrapper and cannot mis-centre. */}
                  <Animated.View
                    style={[
                      styles.glow,
                      {
                        width: moonSize * 2.2,
                        height: moonSize * 2.2,
                        borderRadius: moonSize * 1.1,
                        top: -moonSize * 0.6,
                        left: -moonSize * 0.6,
                      },
                      glowStyle,
                    ]}
                  />
                  {/* Counter-rotated out of BOTH turns it is nested inside — the rose's
                      −heading and the needle's azimuth — so the Moon leans by its bright-limb
                      angle and by nothing else.
                      ⚠️ THE ROSE HALF IS THE ONE THAT WAS MISSING. Cancelling only the
                      azimuth left a net rotation of (−heading + tilt): turn the phone ninety
                      degrees and the crescent's horns swung ninety degrees on screen, while
                      the hub Moon in month mode — drawn with `tilt` alone — did not. Two
                      drawings of the same Moon, on one screen, disagreeing about which way it
                      leans. */}
                  <Animated.View style={counterRoseStyle}>
                    <View style={rot(-azimuth)}>
                      <MoonDisc size={moonSize} illumination={illumination} tilt={tilt} {...ink} />
                    </View>
                  </Animated.View>
                </View>
                <View style={styles.shaftWrap}>
                  <View style={styles.needleShaft} />
                  <Animated.View style={[StyleSheet.absoluteFill, styles.needleShaftBrass, brassStyle]} />
                </View>
              </View>
            </View>
          </Animated.View>

          {/* The INDEX you aim at and the HUB the needle pivots on are compass parts, and
              they are drawn here — inside the sky layer — rather than on the face, because
              in month mode there is nothing to aim and nothing to pivot. See the note at the
              top of this file. Inside the layer they also fade with the drawing they belong
              to rather than blinking on their own. */}
          <View style={styles.index} pointerEvents="none" />
          <Animated.View style={[styles.index, styles.indexBrass, brassStyle]} pointerEvents="none" />
          <View style={styles.hubWrap} pointerEvents="none">
            <View style={[StyleSheet.absoluteFill, styles.hub]} />
            <Animated.View style={[StyleSheet.absoluteFill, styles.hub, styles.hubBrass, brassStyle]} />
          </View>
        </Animated.View>
      )}
    </View>
  );
});

function makeStyles(c: Palette) {
  return StyleSheet.create({
    ...makeDialStyles(c),
    dialWrap: { alignItems: 'center', justifyContent: 'center' },
    // Each mode's drawing gets its own full-face layer so the two can cross-fade. It must
    // repeat dialWrap's centring: the hub Moon and the sky hub are laid out by their
    // parent's alignment, and an absoluteFill wrapper without it drops both to the top-left
    // corner.
    modeLayer: { alignItems: 'center', justifyContent: 'center' },

    // ── The month ring. A notch is a carved mark, so it is a plain bar with a hard edge
    //    rather than the rounded pill the compass ticks use — the two rings must not be
    //    mistakable for each other at a glance. ──
    notchSlot: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
    // As tall as the tallest notch (today's), so every label sits on one radius.
    notchBed: { height: 20, alignItems: 'center' },
    notch: { width: 2, height: 9, backgroundColor: c.inkFaint },
    // The first of the month is cut deepest, the way the head of a stave is.
    notchFirst: { width: 3, height: 16, backgroundColor: c.inkMuted },
    // The three white days — named for the full moon they fall on, so they carry the brass.
    notchWhite: { width: 2.5, height: 14, backgroundColor: c.highlight },
    // Days already used up. Quieter than the ones still to come, so the ring reads forward.
    // Passed days remain part of the ring. Hairline was too close to the face colour in dark
    // mode, making them look deleted rather than completed.
    notchPast: { backgroundColor: c.inkMuted, opacity: 0.48 },
    notchToday: { width: 5, height: 20, backgroundColor: c.highlight },
    notchLabel: { ...type.caption, ...mono, color: c.inkFaint, marginTop: 4 },
    // Today's number, on today's mark. It is the answer to the question the ring is for, so
    // it is the one thing on the rim set larger than a caption and the only thing on it that
    // is not grey.
    //
    // ⚠️ `highlightText`, NOT `highlight`. The two are split on purpose — see theme/tokens:
    // `highlight` is the GRAPHIC brass the notch itself is cut in, and it sits under the
    // text floor in both schemes (#c89a48 measures Lc 50 on the dark face, and #b8862f is a
    // fill value on cream). `highlightText` is the half that was split off to carry words.
    // Written with the graphic token, this number was legible only because it is two
    // characters long.
    notchLabelToday: { ...type.bodyStrong, ...mono, color: c.highlightText },
    notchLabelPast: { color: c.inkFaint, opacity: 0.62 },

    moonHub: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },

    // ── The sky needle. ──
    needleSlot: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    // marginTop and the box are set at the call site from the Moon's altitude and size — see
    // `moonInset` / `moonSize`. zIndex keeps the Moon painted above the shaft that runs under
    // it, and above its own halo.
    needleMoon: { zIndex: 1, alignItems: 'center', justifyContent: 'center' },
    // The halo behind the Moon. Its geometry is set at the call site; only the ink is here.
    glow: { position: 'absolute', backgroundColor: hexToRgba(c.highlight, 0.45) },
    // The shaft and its brass twin, stacked — the twin is faded in by `prox`, so the needle
    // warms as you close in exactly as the qibla needle does.
    shaftWrap: { flex: 1, width: 3, marginBottom: 2, alignItems: 'center' },
    needleShaft: { flex: 1, width: 3, borderRadius: 2, backgroundColor: c.accent },
    needleShaftBrass: { backgroundColor: c.highlight, borderRadius: 2 },
    belowHorizon: { opacity: 0.35 },
  });
}
