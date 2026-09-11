// The map's floating navigation, replacing the old single hamburger. Bönetider is home, so
// the things you reach for live right on it as glanceable controls: a ROW OF INSTRUMENTS on
// the left — the live Qibla compass and, beside it, the Moon at tonight's phase — and the
// position control and settings cog on the RIGHT, pinned just below the safe-area top. Each opens its
// screen as a sheet you dismiss back to the map (see the root _layout's modal
// presentation). `box-none` everywhere so the map stays draggable across the whole top
// edge — only the discs themselves intercept touches.
//
// Theming: Apple Maps-style, the discs follow the OS palette (useColors) — light glass on
// the warm parchment basemap, dark glass on the deep-navy basemap. The earlier sun-driven
// flip was retired here too (see PrayerDock): chrome stays anchored to one OS theme so it
// doesn't shift under the user's hand at dusk.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/lib/settings/context';
import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';
import { CompassButton } from './CompassButton';
import { GlassRoundButton } from './GlassRoundButton';
import { useNavMetrics, NAV_TOP_GAP } from './metrics';
import { MoonButton } from './MoonButton';
import { Icon } from '@/components/ui/Icon';

// The disc diameter, the mark inside it and the lane below the row all live in
// ./metrics — they scale with the reader's text size, and the map's floating cards
// measure against the same numbers.

export function MapNav({ active, onLocate, zoomed = false, locationIsFallback = false }: { active: boolean; onLocate?: () => void; zoomed?: boolean; locationIsFallback?: boolean }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { settings } = useSettings();
  const { disc, glyph } = useNavMetrics();
  const top = insets.top + NAV_TOP_GAP;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.left, { top }]} pointerEvents="box-none">
        <CompassButton active={active} />
        {/* Optional, like the map's other two layers. Hiding it leaves the row one disc
            wide; nothing else measures from the row's WIDTH, so the lane below and the
            chip in it are unaffected either way. */}
        {settings.showMoon && <MoonButton active={active} />}
      </View>
      <View style={[styles.right, { top }]} pointerEvents="box-none">
        {onLocate && <GlassRoundButton tint={c.cardGlass} rim={c.hairline} size={disc}
          accessibilityLabel={locationIsFallback ? 'Välj plats på kartan' : zoomed ? 'Zooma ut till Sverige' : 'Visa min position'} onPress={onLocate}>
          <Icon name={zoomed ? 'zoomOut' : 'myLocation'} size={glyph} color={c.ink} />
        </GlassRoundButton>}
        <GlassRoundButton
          tint={c.cardGlass}
          rim={c.hairline}
          size={disc}
          accessibilityLabel="Inställningar"
          onPress={() => router.navigate('/installningar')}
        >
          {/* Same disc and same mark as the compass opposite, at every text size. */}
          <Icon name="settings" size={glyph} color={c.ink} />
        </GlassRoundButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  left: { position: 'absolute', left: 12, flexDirection: 'row', gap: space.sm },
  right: { position: 'absolute', right: 12, flexDirection: 'row', gap: space.sm },
});
