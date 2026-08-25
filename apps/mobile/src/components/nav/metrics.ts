// The map nav's geometry, in one place because three things have to agree on it: the discs
// themselves (compass, moon, cog), the marks inside them, and everything the map floats
// BELOW them — the "Återställ" chip, the basemap-failure notice, the permission hints.
//
// It is a hook rather than a set of constants because the numbers follow the reader's text
// size, and `fontScale` changes under a running app (Android recreates the activity; iOS
// does not even do that).
import { useWindowDimensions } from 'react-native';

import { space } from '@/theme/tokens';

/** Disc diameter at the default text size — GlassRoundButton's own default, restated here
 *  because the map measures its floating cards against this stack and must not have to
 *  guess at it. */
const NAV_DISC = 46;

/** The mark inside the disc at the default text size.
 *  26, not the 22 it used to be. A glyph inks only its own em coverage — `explore` 0.83,
 *  `location.north.fill` 0.79 — so 22 put about 18 dp of ink inside a 46 dp disc: 38%,
 *  against the ~50% the platform's own map controls sit at, and the disc read as mostly
 *  empty air with a small mark floating in it. */
const NAV_GLYPH = 26;

/** Gap from the safe-area top to the first disc. */
export const NAV_TOP_GAP = 10;

/** How far the discs follow the OS text size, at most.
 *
 *  They used to ignore it completely: at Android's 2× text every word on the map grew and
 *  the three controls stayed 46 dp with a 26 dp mark in them — so the one part of the
 *  screen a reader with poor sight has to HIT was the one part that never answered the
 *  setting they had changed for exactly that reason.
 *
 *  Capped, because these are discs floating over the country rather than text in a column:
 *  a full 2× would put 92 dp of chrome in each top corner, and iOS's accessibility Dynamic
 *  Type sizes go past 3×. At the cap the disc is 69 dp with a 39 dp mark — visibly bigger,
 *  still map furniture. */
const NAV_SCALE_CAP = 1.5;

export interface NavMetrics {
  /** Disc diameter in dp. */
  disc: number;
  /** The mark inside it. */
  glyph: number;
  /** The first full-width lane BELOW the instrument row, measured from the safe-area top.
   *  Everything centred across the map's top region stacks from here, because the discs
   *  occupy the whole of the row above it. */
  laneTop: number;
}

/** The nav's geometry at the reader's text size. */
export function useNavMetrics(): NavMetrics {
  const { fontScale } = useWindowDimensions();
  const scale = Math.min(Math.max(fontScale, 1), NAV_SCALE_CAP);
  const disc = Math.round(NAV_DISC * scale);
  return {
    disc,
    glyph: Math.round(NAV_GLYPH * scale),
    laneTop: NAV_TOP_GAP + disc + space.sm,
  };
}
