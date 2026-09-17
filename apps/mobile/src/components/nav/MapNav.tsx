// The map's floating navigation, replacing the old single hamburger. Bönetider is home, so
// the things you reach for live right on it as glanceable controls: a ROW OF INSTRUMENTS on
// the left — the live Qibla compass and, beside it, the Moon at tonight's phase — and the
// position control and settings cog on the RIGHT, pinned just below the safe-area top. Each opens its
// screen as a sheet you dismiss back to the map (see the root _layout's modal
// presentation). `box-none` everywhere so the map stays draggable across the whole top
// edge — only the discs themselves intercept touches.
//
// Theming: Apple Maps-style, the discs take their light/dark axis from the OS palette
// (useColors), and that axis never follows the sun — see PrayerDock for why the sun-driven
// theme flip was retired and stays retired. What DOES follow the sun is the glass they are
// painted on: theme/skyChrome hands every card on the map one shared ground colour, so a disc
// belongs to the sky behind it at every hour. Shared, because these four discs sampling their
// own backdrops is exactly how the left and right ones came to disagree at dawn.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSettings } from '@/lib/settings/context';
import { space } from '@/theme/tokens';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';
import { CompassButton } from './CompassButton';
import { GlassRoundButton } from './GlassRoundButton';
import { useNavMetrics, NAV_TOP_GAP } from './metrics';
import { MoonButton } from './MoonButton';
import { Icon } from '@/components/ui/Icon';

// The disc diameter, the mark inside it and the lane below the row all live in
// ./metrics — they scale with the reader's text size, and the map's floating cards
// measure against the same numbers.

export function MapNav({ active, onLocate, resetAvailable = false, locationIsFallback = false }: { active: boolean; onLocate?: () => void; resetAvailable?: boolean; locationIsFallback?: boolean }) {
  const insets = useSafeAreaInsets();
  const c = useColors();
  // Discs take their ground from the sky, like the dock below them (theme/skyChrome).
  const sky = useSkyGlass();
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
        {/* The icon swap alone (myLocation → settingsRestore) reads as a different glyph at
            a glance, not as a different CAPABILITY. `accent` is the app's "this is a verb"
            ink (see PrayerDock's "Välj plats" rule) — spent here, not `highlight`, because
            that gold is reserved for the one "this is live right now" state per screen
            (CompassButton's lock, the dock's next prayer) and a second gold control would
            compete with it rather than read as its own thing. */}
        {onLocate && <GlassRoundButton tint={sky.cardGlass} rim={resetAvailable ? c.accent : c.hairline} size={disc}
          accessibilityLabel={resetAvailable ? 'Återställ kartan – visa hela Sverige' : locationIsFallback ? 'Välj plats på kartan' : 'Visa min position'} onPress={onLocate}>
          <Icon name={resetAvailable ? 'settingsRestore' : 'myLocation'} size={glyph} color={resetAvailable ? c.accent : c.ink} />
        </GlassRoundButton>}
        <GlassRoundButton
          tint={sky.cardGlass}
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
