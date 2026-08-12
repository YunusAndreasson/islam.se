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
// Sized as a MARK, not a hero illustration — it sits in IntroStep's fixed top slot, so it
// reads as brand chrome the title sits under, not a competing focal point. A first pass at
// 112pt (roughly a third of screen width) fought the title for attention and, worse, sat
// inside the scrollable content instead of a fixed slot, so its vertical position hopped
// between steps with however much lead text preceded it.
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

import { brand } from '@/theme/tokens';
import { useActiveScheme, useColors } from '@/theme/useColors';

const SIZE = 72;
const CENTER = SIZE / 2;
// Measured from splash-icon.png along its horizontal diameter: the gold disc's edge sits
// at 70.6% of the outer ring's radius, and the ring itself is the remaining 29.4% —
// keeping this component's proportions true to the actual artwork rather than guessed.
const R_OUTER = CENTER - 2;
const R_INNER = R_OUTER * 0.706;
const RING_WIDTH = R_OUTER - R_INNER;
const RING_RADIUS = (R_OUTER + R_INNER) / 2;

interface Props {
  /** 0-based current step. */
  index: number;
  total: number;
}

export function IntroMarkProgress({ index, total }: Props) {
  const c = useColors();
  const scheme = useActiveScheme();

  const wedges = useMemo(() => {
    const sweep = 360 / total;
    const ringRect = Skia.XYWHRect(
      CENTER - RING_RADIUS,
      CENTER - RING_RADIUS,
      RING_RADIUS * 2,
      RING_RADIUS * 2,
    );
    const goldRect = Skia.XYWHRect(CENTER - R_INNER, CENTER - R_INNER, R_INNER * 2, R_INNER * 2);
    return Array.from({ length: total }, (_, i) => {
      const start = -90 + i * sweep;

      const ring = Skia.PathBuilder.Make();
      ring.addArc(ringRect, start, sweep);

      const gold = Skia.PathBuilder.Make();
      gold.moveTo(CENTER, CENTER);
      gold.arcToOval(goldRect, start, sweep, false);
      gold.close();

      return { ring: ring.detach(), gold: gold.detach(), reached: i <= index };
    });
  }, [index, total]);

  return (
    <Canvas style={styles.canvas}>
      {wedges.map((w, i) => (
        <Path
          key={`ring-${i}`}
          path={w.ring}
          style="stroke"
          strokeWidth={RING_WIDTH}
          strokeCap="butt"
          color={w.reached ? brand.blue[scheme] : c.track}
        />
      ))}
      {wedges.map((w, i) => (
        <Path key={`gold-${i}`} path={w.gold} color={w.reached ? brand.gold[scheme] : c.track} />
      ))}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { width: SIZE, height: SIZE },
});
