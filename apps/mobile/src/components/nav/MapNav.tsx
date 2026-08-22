// The map's floating navigation, replacing the old single hamburger. Bönetider is home, so
// the things you reach for live right on it as glanceable controls: a COLUMN OF INSTRUMENTS
// on the left — the live Qibla compass, and under it the Moon at tonight's phase — and the
// settings cog alone on the RIGHT, pinned just below the safe-area top.
//
// The Moon went under the compass rather than beside it for two reasons. The left column
// then reads as one thing (instruments) against one destination (settings) on the right,
// which is the split Apple Maps uses. And a second disc at the same height would have sat
// under the centred "Återställ" chip on a narrow phone: at 320 dp that chip starts at about
// x = 95 and a disc beside the compass ends at 114. Each opens its screen as a sheet you dismiss back to the map (see the root
// _layout's modal presentation). `box-none` everywhere so the map stays draggable across
// the whole top edge — only the two discs themselves intercept touches.
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
/** Height of the whole left column. Exported so anything that has to clear the nav — the
 *  location and notification hint cards — reads the real number instead of re-deriving it.
 *  The hints drifted out of step with this once already, back when it was one disc. */
export const NAV_STACK_HEIGHT = NAV_DISC * 2 + space.sm;

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
  left: { position: 'absolute', left: 12, gap: space.sm },
  right: { position: 'absolute', right: 12 },
});
