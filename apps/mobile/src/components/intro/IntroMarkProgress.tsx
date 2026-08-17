// The wizard's progress indicator: the app's own mark (theme/tokens.ts `brand` — the same
// blue ring / gold disc as the splash screen), split into `total` equal wedges instead of
// a row of dots. A step you've reached shows its wedge in the mark's true colour; a step
// still ahead shows it dimmed. By the last step the full two-tone mark is on screen,
// whole — which is also the first thing bönetider itself never shows you again, so
// finishing the wizard is the one time you see it assembled.
//
// Binary per-wedge state (dim / true colour), not a partial sweep — the dots this
// replaces only ever had on/off too, and a smoothly animating fill would imply progress
// WITHIN a step that doesn't exist (each step is answered in one tap, not gradually).
//
// Sized as a MARK, not a hero illustration — it sits in IntroStep's fixed header row, so
// it reads as brand chrome at the top edge of the frame, not a competing focal point. A
// first pass at 112pt (roughly a third of screen width) fought the title for attention
// and, worse, sat inside the scrollable content instead of a fixed slot, so its vertical
// position hopped between steps with however much lead text preceded it.
//
// The default 72 is the standalone size; IntroStep asks for a smaller one because there it
// is paired with a "Steg 2 av 4" label on the same baseline, and a mark that outweighs its
// own caption stops reading as a progress chip and starts reading as a logo someone put a
// number next to.
import { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

import { brand } from '@/theme/tokens';
import { useActiveScheme, useColors } from '@/theme/useColors';

const DEFAULT_SIZE = 72;
// 12 o'clock. Skia measures arc angles from 3 o'clock, so the first wedge starts here.
const START_ANGLE = -90;
// Measured from splash-icon.png along its horizontal diameter: the gold disc's edge sits
// at 70.6% of the outer ring's radius, and the ring itself is the remaining 29.4% —
// keeping this component's proportions true to the actual artwork rather than guessed.
const GOLD_RATIO = 0.706;
// The old `CENTER - 2` at size 72, kept as a ratio so every size insets proportionally.
const INSET_RATIO = 1 / 36;

interface Props {
  /** 0-based current step. */
  index: number;
  total: number;
  /** Edge length of the square canvas. */
  size?: number;
}

export function IntroMarkProgress({ index, total, size = DEFAULT_SIZE }: Props) {
  const c = useColors();
  const scheme = useActiveScheme();

  // Drawn as a dimmed WHOLE mark with the reached span laid over it in one piece —
  // NOT as `total` separately-filled wedges. Skia anti-aliases each path against what
  // is already on the canvas, so two abutting wedges each cover their shared edge ~50%
  // and the pixel composites to ~75% — a visible hairline of background. Between two
  // DIFFERENT colours that seam hides in the colour change, but between two same-coloured
  // wedges it reads as a crosshair scored through the mark, worst of all on the last step,
  // where the whole point is to show the mark assembled and unbroken. One base path plus
  // one overlay leaves a single edge, and that edge is always a real colour boundary.
  const mark = useMemo(() => {
    const center = size / 2;
    const rOuter = center - size * INSET_RATIO;
    const rInner = rOuter * GOLD_RATIO;
    const ringWidth = rOuter - rInner;
    const ringRadius = (rOuter + rInner) / 2;
    const reached = Math.min(Math.max(index + 1, 0), total);
    const complete = reached >= total;
    const sweep = (reached / total) * 360;
    const ringRect = Skia.XYWHRect(
      center - ringRadius,
      center - ringRadius,
      ringRadius * 2,
      ringRadius * 2,
    );
    const goldRect = Skia.XYWHRect(center - rInner, center - rInner, rInner * 2, rInner * 2);

    return {
      ringWidth,
      // The whole mark in the dim colour. One filled disc rather than a dim ring plus a
      // dim inner circle, because those two would abut at R_INNER in the SAME colour and
      // score their own seam — the exact artifact this shape exists to avoid.
      base: Skia.Path.Circle(center, center, rOuter),
      // A closed circle rather than a 360° arc: an arc that wraps a full turn still has
      // two butt caps meeting, which is one more same-colour edge.
      ring: complete
        ? Skia.Path.Circle(center, center, ringRadius)
        : Skia.PathBuilder.Make().addArc(ringRect, START_ANGLE, sweep).build(),
      gold: complete
        ? Skia.Path.Circle(center, center, rInner)
        : Skia.PathBuilder.Make()
            .moveTo(center, center)
            .arcToOval(goldRect, START_ANGLE, sweep, false)
            .close()
            .build(),
    };
  }, [index, total, size]);

  return (
    <Canvas style={{ width: size, height: size }}>
      <Path path={mark.base} color={c.track} />
      <Path
        path={mark.ring}
        style="stroke"
        strokeWidth={mark.ringWidth}
        strokeCap="butt"
        color={brand.blue[scheme]}
      />
      <Path path={mark.gold} color={brand.gold[scheme]} />
    </Canvas>
  );
}
