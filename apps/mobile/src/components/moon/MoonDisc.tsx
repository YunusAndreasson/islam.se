// The Moon itself — one drawing, used at every size the app shows it: 26 dp on the map's nav
// disc, 16 dp beside the status line, 20 dp in each square of the month sheet, and large at
// the centre of the dial.
//
// WHY IT IS DRAWN RATHER THAN PICKED FROM AN ICON SET. components/ui/Icon explains that the
// app's glyphs come from SF Symbols on iOS and Material Symbols on Android, and that a name
// missing from either set is a blank icon on half the install base. SF Symbols does have a
// moon-phase family; Material Symbols has nothing of the kind — its entire vocabulary for
// the Moon is a single crescent. So an icon-set moon would be eight real phases on iOS and
// one wrong one on Android. It is the same reason the mosque map pin is a bitmap.
//
// Drawing it also buys the thing an eight-step icon family could never give: the phase is
// CONTINUOUS and the disc is TILTED to the reader's own sky (see lib/moon/ephemeris's
// brightLimbAngle). At 59–68°N the same crescent leans quite differently than it does over
// the classical Arab world, and a moon whose horns are always in the same place is wrong
// everywhere except by accident.
import { Canvas, Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';

import { crescentGeometry } from '@/lib/moon/shape';

/** Room left inside the box for the rim stroke, so it is not clipped by the canvas edge. */
const RIM_WIDTH = 1;

/** The maria, as fractions of the radius from the disc centre: (x, y, r). Uneven in size and
 *  deliberately off-centre — three equal circles in a triangle read as a clover, or as holes
 *  punched in the disc, which is what the first attempt looked like. At the sizes this draws
 *  they are TEXTURE: the moment they are legible as geography they are wrong geography. */
const MARIA: readonly (readonly [number, number, number])[] = [
  [-0.34, -0.30, 0.26],
  [-0.06, -0.44, 0.17],
  [0.30, -0.10, 0.19],
  [0.08, 0.16, 0.24],
  [-0.28, 0.42, 0.14],
];

/**
 * The tilt to draw a Moon at when it is NOT being shown as part of the sky — a calendar
 * square, a bullet beside a sentence. Lit on the right while waxing, on the left while
 * waning: the northern-hemisphere convention every printed almanac uses, and the only thing
 * that makes a month of squares read as a lunation rather than as a disc filling up from
 * one end. Without it a 45 %-lit waxing Moon and a 45 %-lit waning one are the same drawing.
 *
 * A Moon shown in the sky — the dial's hub, the needle, the nav disc — takes its real
 * bright-limb angle instead, and must never take this.
 */
export const almanacTilt = (waxing: boolean): number => (waxing ? 90 : 270);

interface Props {
  /** Box size in dp; the disc fills it. */
  size: number;
  /** Illuminated fraction, 0–1. */
  illumination: number;
  /** Degrees clockwise from straight up to the middle of the bright limb, as seen from the
   *  reader's place. Defaults to 0 — lit side up — which is right for a legend or a swatch
   *  and wrong for anything claiming to show tonight's sky. */
  tilt?: number;
  /** The lit limb. */
  lit: string;
  /** The unlit disc. Also the maria, which are this colour laid faintly over the light. */
  dark: string;
  /** Hairline rim. Without it a new moon is not a dark object but an absence, and the nav
   *  disc looks broken one night a month. */
  rim: string;
  /** Draw the maria. Worth it from about 48 dp up; below that it is dirt on the glass. */
  detail?: boolean;
}

export function MoonDisc({ size, illumination, tilt = 0, lit, dark, rim, detail }: Props) {
  const paths = useMemo(() => {
    const centre = size / 2;
    const r = centre - RIM_WIDTH;
    const g = crescentGeometry(r, illumination);
    const limb = Skia.XYWHRect(centre - r, centre - r, r * 2, r * 2);
    // The terminator ellipse shares the disc's horizontal semi-axis, so its 0° point is the
    // same point the limb arc ends on and the two contours join without a seam.
    const terminator = Skia.XYWHRect(
      centre - r,
      centre - g.terminatorHalfHeight,
      r * 2,
      g.terminatorHalfHeight * 2,
    );
    return {
      radius: r,
      centre,
      disc: Skia.Path.Circle(centre, centre, r),
      // Limb (left → top → right), then the terminator back (right → left). At exactly half
      // the ellipse is empty and Skia skips the arc — which is correct: `close` then draws
      // the straight terminator a half-moon actually has.
      lit: Skia.PathBuilder.Make()
        .addArc(limb, 180, 180)
        .arcToOval(terminator, 0, g.sweep, false)
        .close()
        .build(),
    };
  }, [size, illumination]);

  return (
    // Rotated here rather than inside the canvas: the app already turns instruments with
    // React Native transforms (the qibla rose, the compass needle), and keeping to one
    // convention means a moon riding a rotating needle composes with it for free.
    <View style={{ width: size, height: size, transform: [{ rotate: `${tilt}deg` }] }}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={paths.disc} color={dark} />
        <Path path={paths.lit} color={lit} />
        {detail ? (
          // Clipped to the lit shape, so the maria appear only where there is light to
          // darken — on the night side they would be invisible anyway, but the clip is what
          // keeps a gibbous Moon's terminator a clean edge instead of a smudged one.
          <Group clip={paths.lit} opacity={0.1}>
            {MARIA.map(([x, y, r]) => (
              <Circle
                key={`${x},${y}`}
                cx={paths.centre + x * paths.radius}
                cy={paths.centre + y * paths.radius}
                r={r * paths.radius}
                color={dark}
              />
            ))}
          </Group>
        ) : null}
        <Path path={paths.disc} style="stroke" strokeWidth={RIM_WIDTH} color={rim} />
      </Canvas>
    </View>
  );
}
