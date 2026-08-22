// The Moon dial — the qibla compass's twin, on the same face, answering the other question.
//
// One instrument, two things it can be pointed at, chosen by the switch above the readout:
//
//   MÅNADEN   the rim is the lunar month. Thirty notches cut round the edge like the day
//             marks on a runstav — the Swedish perpetual calendar stave, which carried the
//             new moons of the nineteen-year cycle in its second row of marks and is, of all
//             the things the Nordic countries made, the one closest in kind to a Hijri month.
//             Day one sits under the index; the notches darken as the days are used up; the
//             three white days stand taller in brass; today is the wide brass mark. The Moon
//             is at the hub, at tonight's phase.
//
//   PÅ HIMLEN the rim is the horizon, and this IS the qibla compass with a different target:
//             the rose turns against the phone's heading and the needle carries the Moon to
//             where it actually stands. Hold the phone up and walk the needle round, and you
//             are looking at the real thing — which is the only way anyone has ever settled
//             the beginning of a month.
//
// The face, the ticks, the cardinal letters, the index and the hub all come from theme/dial,
// so this and Qibla cannot drift apart. What is written here is only what is the Moon's.
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { MoonDisc } from '@/components/moon/MoonDisc';
import { useMoonInk } from '@/components/moon/moonInk';
import type { RingDay } from '@/lib/moon/month';
import { skyReach } from '@/lib/moon/shape';
import { makeDialStyles, rotate as rot } from '@/theme/dial';
import { mono, type Palette, type } from '@/theme/tokens';

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

/** Which day numbers get a printed label on the month ring. Every fifth, plus the last one
 *  whatever it is — a ring that stopped labelling at 25 would leave the one number a reader
 *  most wants (is this month 29 days or 30?) unwritten. */
function labelledDays(length: number): ReadonlySet<number> {
  const days = new Set<number>([length]);
  for (let d = 5; d < length; d += 5) days.add(d);
  return days;
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
  /** Sky mode: the unwrapped rose rotation (−heading), written from the heading callback. */
  roseDeg: SharedValue<number>;
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
  roseDeg,
  live,
  c,
}: Props) {
  const styles = useMemo(() => makeStyles(c), [c]);
  // The Moon goes brass on the white days, exactly as the map's nav disc does. Derived from
  // the ring rather than passed in, so the dial and its own notches cannot disagree about
  // which days those are.
  const brass = ring.find((d) => d.day === today)?.mark?.kind === 'white';
  const ink = useMoonInk(brass);
  const r = size / 2;
  const roseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${roseDeg.value}deg` }] }));
  // Undoes the rose's own turn for whatever it wraps. It has to be an ANIMATED style, not a
  // static one: `roseDeg` lives on the UI thread and a `rot(-something)` computed in render
  // cannot cancel a value that moves between renders. See the Moon on the needle below.
  const counterRoseStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-roseDeg.value}deg` }] }));
  const labelled = useMemo(() => labelledDays(ring.length), [ring.length]);
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
        <>
          {ring.map(({ day, mark }) => {
            // Day one under the index, the month running clockwise from it.
            const deg = ((day - 1) / ring.length) * 360;
            const white = mark?.kind === 'white';
            const isToday = today === day;
            // Dim only PLAIN days once they are behind us. Stacking a `past` style on top of
            // the others quietly grey out the white days and the head of the stave as the
            // month went on — so from the 16th onward the ring lost the three marks it exists
            // to show. Days that mean something keep their mark all month.
            const past = today != null && day < today && !white && day !== 1;
            return (
              <View key={day} style={[StyleSheet.absoluteFill, rot(deg)]} pointerEvents="none">
                <View style={styles.notchSlot}>
                  <View
                    style={[
                      styles.notch,
                      day === 1 && styles.notchFirst,
                      white && styles.notchWhite,
                      past && styles.notchPast,
                      isToday && styles.notchToday,
                    ]}
                  />
                  {labelled.has(day) ? (
                    // Counter-rotated so the number is upright wherever it sits on the ring.
                    <Text style={[styles.notchLabel, rot(-deg)]}>{day}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
          <View style={styles.moonHub} pointerEvents="none">
            <MoonDisc size={Math.round(size * 0.34)} illumination={illumination} tilt={tilt} {...ink} detail />
          </View>
        </>
      ) : (
        <>
          {/* The rose. It turns against the phone when there is a heading to turn against,
              and stays north-up when there is not — the honest fallback Qibla uses, and the
              only state an emulator or a tablet without a magnetometer can ever show. */}
          <Animated.View style={[StyleSheet.absoluteFill, live ? roseStyle : undefined]}>
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
                <View style={[styles.needleMoon, { marginTop: moonInset }]}>
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
                <View style={styles.needleShaft} />
              </View>
            </View>
          </Animated.View>
        </>
      )}

      {/* Fixed: the index you aim at. The HUB is drawn only in sky mode — it is a needle's
          pivot, and in month mode the centre belongs to the Moon, where a hub is not a pivot
          but a hole punched through its face. */}
      <View style={styles.index} pointerEvents="none" />
      {mode === 'sky' ? (
        <View style={styles.hubWrap} pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, styles.hub]} />
        </View>
      ) : null}
    </View>
  );
});

function makeStyles(c: Palette) {
  return StyleSheet.create({
    ...makeDialStyles(c),
    dialWrap: { alignItems: 'center', justifyContent: 'center' },

    // ── The month ring. A notch is a carved mark, so it is a plain bar with a hard edge
    //    rather than the rounded pill the compass ticks use — the two rings must not be
    //    mistakable for each other at a glance. ──
    notchSlot: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
    notch: { width: 2, height: 9, backgroundColor: c.inkFaint },
    // The first of the month is cut deepest, the way the head of a stave is.
    notchFirst: { width: 3, height: 16, backgroundColor: c.inkMuted },
    // The three white days — named for the full moon they fall on, so they carry the brass.
    notchWhite: { width: 2.5, height: 14, backgroundColor: c.highlight },
    // Days already used up. Quieter than the ones still to come, so the ring reads forward.
    notchPast: { backgroundColor: c.hairline },
    notchToday: { width: 5, height: 20, backgroundColor: c.highlight },
    notchLabel: { ...type.caption, ...mono, color: c.inkFaint, marginTop: 3 },

    moonHub: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },

    // ── The sky needle. ──
    needleSlot: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
    // marginTop is set at the call site from the Moon's altitude — see `moonInset`.
    needleMoon: { zIndex: 1 },
    needleShaft: { flex: 1, width: 3, borderRadius: 2, backgroundColor: c.accent, marginBottom: 2 },
    belowHorizon: { opacity: 0.35 },
  });
}
