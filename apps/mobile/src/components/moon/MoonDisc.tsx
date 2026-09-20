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
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { crescentGeometry } from '@/lib/moon/shape';

/** Room left inside the box for the rim stroke, so it is not clipped by the canvas edge. */
const RIM_WIDTH = 1;

// NO MARIA. The dial's Moon used to carry five faint circles for the seas, clipped to the
// lit shape and laid on at a tenth opacity. They were read off a real screen as a rendering
// fault — "incorrect moon artifacts" — and that is the only verdict a decoration needs. Hard
// circular edges at a tenth opacity land in the worst place available: dark enough to be
// seen, too geometric to be a surface, and rotating with the tilt so they visibly travel
// across the disc. The rest of this feature is a printed almanac — notched staves, flat
// two-tone discs, tabular numerals — and a textured Moon was the one thing in it pretending
// to be a photograph. One drawing at every size now, and the same drawing at every size.

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
  /** Use native shapes for the many small, static calendar icons. */
  staticIcon?: boolean;
  /** Illuminated fraction, 0–1. */
  illumination: number;
  /** Degrees clockwise from straight up to the middle of the bright limb, as seen from the
   *  reader's place. Defaults to 0 — lit side up — which is right for a legend or a swatch
   *  and wrong for anything claiming to show tonight's sky. */
  tilt?: number;
  /** The lit limb. */
  lit: string;
  /** The unlit disc. */
  dark: string;
  /** Hairline rim. Without it a new moon is not a dark object but an absence, and the nav
   *  disc looks broken one night a month. */
  rim: string;
}

export function MoonDisc({ size, illumination, tilt = 0, lit, dark, rim, staticIcon = false }: Props) {
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

  // A calendar can mount 30 canvases at once inside an animated sheet. Some Android
  // texture surfaces stay blank. Native circles and an ellipse draw the same phase
  // without separate GPU surfaces; keep the canvas for the larger sky illustrations.
  if (staticIcon) {
    const diameter = size - 2 * RIM_WIDTH;
    const fraction = Math.max(0, Math.min(1, illumination));
    return (
      <View style={{ width: size, height: size, transform: [{ rotate: `${tilt}deg` }] }}>
        <View style={{ position: 'absolute', left: RIM_WIDTH, top: RIM_WIDTH, width: diameter, height: diameter, borderRadius: diameter / 2, overflow: 'hidden', backgroundColor: dark }}>
          <View style={{ position: 'absolute', width: diameter, height: diameter / 2, backgroundColor: lit }} />
          <View style={{ ...StyleSheet.absoluteFill, width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: fraction >= 0.5 ? lit : dark, transform: [{ scaleY: Math.abs(2 * fraction - 1) }] }} />
        </View>
        <View style={{ position: 'absolute', left: RIM_WIDTH / 2, top: RIM_WIDTH / 2, width: size - RIM_WIDTH, height: size - RIM_WIDTH, borderRadius: size / 2, borderWidth: RIM_WIDTH, borderColor: rim }} />
      </View>
    );
  }

  return (
    // Rotated here rather than inside the canvas: the app already turns instruments with
    // React Native transforms (the qibla rose, the compass needle), and keeping to one
    // convention means a moon riding a rotating needle composes with it for free.
    <View style={{ width: size, height: size, transform: [{ rotate: `${tilt}deg` }] }}>
      <Canvas style={{ width: size, height: size }}>
        <Path path={paths.disc} color={dark} />
        <Path path={paths.lit} color={lit} />
        <Path path={paths.disc} style="stroke" strokeWidth={RIM_WIDTH} color={rim} />
      </Canvas>
    </View>
  );
}
