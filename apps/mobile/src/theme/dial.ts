// The shared parts of a dial face.
//
// The app now draws TWO instruments on the same face — the qibla compass and the Moon — and
// the whole point of the second one is that it reads as the first one's twin. That only
// survives if there is one set of numbers: a face whose border went from 1.5 to 1 on one
// screen and not the other, or ticks that ended up 13 dp here and 12 there, would turn a
// pair of instruments into two things that look nearly alike, which is worse than either.
//
// So the geometry lives here and the JSX stays with each screen. What is shared is
// deliberately only the parts that are the same instrument: the face, the ring inside it,
// the tick marks and cardinal letters of a compass rose, the aim index at twelve o'clock and
// the hub at the centre. What is NOT shared is everything that carries a screen's own
// meaning — the qibla's beam, needle and Kaaba, the Moon's notched month ring — because
// those are the drawings, not the instrument.
import { StyleSheet } from 'react-native';
import { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { type Palette, shadow, type } from './tokens';

/** The dial never grows past this, on either screen. There is deliberately no lower bound:
 *  a floor that beat the height clamp would push the instrument through the title above it. */
export const DIAL_MAX = 320;

/** Rotate a slot to a bearing. Every mark on a dial is a view pinned at the top of a
 *  full-size slot that has been turned to its angle — that is what keeps a tick, a letter
 *  and a needle all measured from the same centre. */
export const rotate = (deg: number) => ({ transform: [{ rotate: `${deg}deg` }] });

export function makeDialStyles(c: Palette) {
  return StyleSheet.create({
    // Fixed face — warm gradient, a real (not hairline) border, lifted off the paper. It
    // does NOT rotate, so the "light" always falls from the top.
    face: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderWidth: 1.5,
      borderColor: c.border,
      overflow: 'hidden',
      ...shadow.card,
    },
    innerRing: {
      position: 'absolute',
      borderWidth: 1,
      borderColor: c.hairline,
    },

    // A tick lives at the top of a full-size, rotated slot.
    tickSlot: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' },
    tickMajor: { width: 2.5, height: 13, borderRadius: 1.5, backgroundColor: c.inkMuted },
    tickMinor: { width: 1.5, height: 7, borderRadius: 1, backgroundColor: c.inkFaint },

    cardinalSlot: { position: 'absolute', top: 24, left: 0, right: 0, alignItems: 'center' },
    cardinal: { ...type.bodyStrong, fontWeight: '700', color: c.ink },
    cardinalN: { color: c.accent },

    // The fixed aim sight at 12 o'clock — a slim, acute wedge (taller than it is wide) so it
    // reads as a precise pointer to line something up against, not a blunt arrowhead.
    index: {
      position: 'absolute',
      top: -13,
      width: 0,
      height: 0,
      borderLeftWidth: 7,
      borderRightWidth: 7,
      borderTopWidth: 16,
      borderLeftColor: 'transparent',
      borderRightColor: 'transparent',
      borderTopColor: c.accent,
    },
    indexBrass: { borderTopColor: c.highlight },
    hubWrap: { width: 16, height: 16 },
    hub: { borderRadius: 8, backgroundColor: c.surface, borderWidth: 3, borderColor: c.accent },
    hubBrass: { backgroundColor: 'transparent', borderColor: c.highlight },
  });
}

/** The "getting warmer" overlays, shared by both instruments.
 *
 *  Every live part of a dial — the qibla's beam, cube, needle and index; the Moon's needle,
 *  halo and index — fades in on ONE ramp so they warm as a single thing rather than as five.
 *  It lives here, beside the geometry, for the reason stated at the top of this file: the two
 *  dials are one instrument, and a swell constant that drifted on one screen and not the other
 *  would turn a pair into two things that look nearly alike. These were written out twice,
 *  character for character, before they were written once.
 *
 *  `brass` is the plain cross-fade. `glow` adds the halo's swell, which Reduce Motion drops —
 *  a fade is not vestibular motion, but a thing pulsing under the reader's eye is exactly what
 *  that setting is asking us not to do; the opacity ramp stays, so the signal survives.
 */
export function useBrassStyles(prox: SharedValue<number>, reduceMotion: boolean) {
  const brass = useAnimatedStyle(() => ({ opacity: prox.get() }));
  const glow = useAnimatedStyle(
    () => ({
      opacity: prox.get(),
      transform: [{ scale: reduceMotion ? 1 : GLOW_REST + prox.get() * GLOW_SWELL }],
    }),
    [reduceMotion],
  );
  return { brass, glow };
}

/** The halo at rest, and how much of the dial's radius it gains on the way to the lock. Set
 *  so a cold halo is small enough to read as "not yet" and a locked one still sits inside the
 *  mark it is behind. */
const GLOW_REST = 0.55;
const GLOW_SWELL = 0.55;
