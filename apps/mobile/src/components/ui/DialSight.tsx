// The sight line: a fixed, fading hairline from the aim index down to the hub.
//
// It draws the AXIS — the line the thing you are looking for has to travel up to meet. That
// is the conceptual model made visible, and it is what turns "a needle points somewhere" into
// "turn until it reaches the top". Both instruments aim, so both get it.
//
// It starts BELOW the cardinal band (the index wedge and the 0° tick already carry the axis
// up there) so it never strikes through the "N", and it fades in rather than beginning on a
// chopped end.
import { StyleSheet, View } from 'react-native';

import { hexToRgba } from '@/theme/rgba';
import type { Palette } from '@/theme/tokens';

/** Where the line starts: ticks end at 21, the cardinal glyphs at ~46 — so the eye reads
 *  index → tick → N → line → hub with nothing overlapping. */
const SIGHT_TOP = 48;

export function DialSight({ radius, c }: { radius: number; c: Palette }) {
  return (
    <View style={[styles.wrap, { top: SIGHT_TOP, height: Math.max(0, radius - SIGHT_TOP) }]} pointerEvents="none">
      {/* The fade is core React Native's `backgroundImage`: in over the first fifth, out
          over the rest. Every stop is the ink's own rgb at a different alpha, so the
          transparent ends cannot fringe grey whichever way the platform interpolates. */}
      <View
        style={[
          styles.line,
          {
            backgroundImage: [
              {
                type: 'linear-gradient',
                direction: 'to bottom',
                colorStops: [
                  { color: hexToRgba(c.ink, 0) },
                  { color: hexToRgba(c.ink, 0.16), positions: ['20%'] },
                  { color: hexToRgba(c.ink, 0) },
                ],
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  line: { width: 2, height: '100%' },
});
