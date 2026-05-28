// The map's floating navigation, replacing the old single hamburger. Bönetider is home,
// so the two things you reach for live right on it as glanceable controls: a live Qibla
// compass on the LEFT and a settings cog on the RIGHT, pinned just below the safe-area
// top. Each opens its screen as a sheet you dismiss back to the map (see the root
// _layout's modal presentation). `box-none` everywhere so the map stays draggable across
// the whole top edge — only the two discs themselves intercept touches.
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nightChrome } from '../map/nightChrome';
import { CompassButton } from './CompassButton';
import { GlassRoundButton } from './GlassRoundButton';

export function MapNav({ active, night }: { active: boolean; night: number }) {
  const insets = useSafeAreaInsets();
  // The two discs float on the map, so they take the map's sun-driven night (not the OS
  // theme) — they recede into the night map instead of glowing as bright slabs over it.
  const c = nightChrome(night);
  const top = insets.top + 10;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.left, { top }]} pointerEvents="box-none">
        <CompassButton active={active} night={night} />
      </View>
      <View style={[styles.right, { top }]} pointerEvents="box-none">
        <GlassRoundButton
          night={night}
          accessibilityLabel="Inställningar"
          onPress={() => router.navigate('/installningar')}
        >
          <MaterialIcons name="settings" size={24} color={c.ink} />
        </GlassRoundButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  left: { position: 'absolute', left: 12 },
  right: { position: 'absolute', right: 12 },
});
