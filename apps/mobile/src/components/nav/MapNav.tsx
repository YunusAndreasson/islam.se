// The map's floating navigation, replacing the old single hamburger. Bönetider is home, so
// the things you reach for live right on it as glanceable controls: a ROW OF INSTRUMENTS on
// the left — the live Qibla compass and, beside it, the Moon at tonight's phase — and the
// settings cog alone on the RIGHT, pinned just below the safe-area top. Each opens its
// screen as a sheet you dismiss back to the map (see the root _layout's modal
// presentation). `box-none` everywhere so the map stays draggable across the whole top
// edge — only the discs themselves intercept touches.
//
// ⚠️ THE ROW COSTS THE CHIP ITS LANE, AND THAT IS PAID FOR IN bonetider. The Moon sat UNDER
// the compass because a second disc at the same height collides with the centred "Återställ"
// chip on a narrow phone — at 320 dp the chip is about 116 wide, so it starts at x = 102,
// and a row of two discs ends at x = 112. Ten points of overlap, invisible on any handset
// wide enough to develop on. Side by side is what was asked for, so the chip moved out of
// this row instead: `NAV_LANE_TOP` below is the first full-width lane clear of the discs,
// and the chip, the basemap-failure notice and the hint cards all measure from it. Do not
// put anything back at `insets.top + space.lg` — that is inside the discs now.
//
// Theming: Apple Maps-style, the discs follow the OS palette (useColors) — light glass on
// the warm parchment basemap, dark glass on the deep-navy basemap. The earlier sun-driven
// flip was retired here too (see PrayerDock): chrome stays anchored to one OS theme so it
// doesn't shift under the user's hand at dusk.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';
import { CompassButton, GLYPH } from './CompassButton';
import { GlassRoundButton } from './GlassRoundButton';
import { MoonButton } from './MoonButton';
import { Icon } from '@/components/ui/Icon';

/** Disc diameter — GlassRoundButton's own default, restated here because the map measures
 *  its floating cards against this stack and must not have to guess at it. */
const NAV_DISC = 46;
/** Gap from the safe-area top to the first disc. */
export const NAV_TOP_GAP = 10;
/** Height of the left instrument row — one disc, since the Moon moved up beside the compass.
 *  Exported so anything that has to clear the nav reads the real number instead of
 *  re-deriving it. The hints drifted out of step with this once already, back when it was
 *  one disc, and again the day a second one went under it. */
export const NAV_ROW_HEIGHT = NAV_DISC;

/** The first full-width lane BELOW the instrument row, measured from the safe-area top.
 *  Everything centred across the map's top region stacks from here — the "Återställ" chip,
 *  the basemap-failure notice, the permission hints — because the discs now occupy the whole
 *  of the row above it. */
export const NAV_LANE_TOP = NAV_TOP_GAP + NAV_ROW_HEIGHT + space.sm;

export function MapNav({ active }: { active: boolean }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const top = insets.top + NAV_TOP_GAP;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.left, { top }]} pointerEvents="box-none">
        <CompassButton active={active} />
        <MoonButton />
      </View>
      <View style={[styles.right, { top }]} pointerEvents="box-none">
        <GlassRoundButton
          tint={c.cardGlass}
          rim={c.hairline}
          accessibilityLabel="Inställningar"
          onPress={() => router.navigate('/installningar')}
        >
          {/* 26 to match the compass opposite — see CompassButton's GLYPH for the ratio. */}
          <Icon name="settings" size={GLYPH} color={c.ink} />
        </GlassRoundButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  left: { position: 'absolute', left: 12, flexDirection: 'row', gap: space.sm },
  right: { position: 'absolute', right: 12 },
});
