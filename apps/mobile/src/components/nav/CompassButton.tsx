// The map's LEFT navigation control: a live qibla mini-compass. When the device has a
// compass (and location permission is already granted) a small needle points at Mecca
// and turns as the phone turns — a dynamic signifier of what the button opens, not a
// dead icon. Until a real heading arrives — and on devices with no sensor (emulators)
// or no permission yet — it shows a static `explore` glyph instead, so it never paints
// a faked direction. Tapping always opens the full Qibla screen, which owns the prompt.
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useLocation } from '../../lib/location/context';
import { qiblaBearing } from '../../lib/qibla';
import { useHeading } from '../../lib/useHeading';
import { useColors } from '../../theme/useColors';
import { GlassRoundButton } from './GlassRoundButton';

export function CompassButton({ active }: { active: boolean }) {
  const c = useColors();
  const { coords } = useLocation();
  const bearing = useMemo(() => qiblaBearing(coords), [coords]);
  const { rotation, heading } = useHeading({ active, request: false });

  // Point the needle at the qibla — bearing minus the live heading, clockwise — on the
  // UI thread so it tracks the phone smoothly without a React render per frame.
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bearing - rotation.value}deg` }],
  }));

  return (
    <GlassRoundButton accessibilityLabel="Qibla" onPress={() => router.navigate('/qibla')}>
      {heading == null ? (
        <MaterialIcons name="explore" size={24} color={c.ink} />
      ) : (
        <Animated.View style={[styles.needleBox, needleStyle]}>
          <View style={[styles.tip, { borderBottomColor: c.accent }]} />
          <View style={[styles.tail, { backgroundColor: c.inkFaint }]} />
        </Animated.View>
      )}
    </GlassRoundButton>
  );
}

const styles = StyleSheet.create({
  needleBox: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  // Arrowhead (points at the qibla) over a quiet tail — a compass needle, abstracted.
  tip: {
    position: 'absolute',
    top: 1,
    width: 0,
    height: 0,
    borderLeftWidth: 5.5,
    borderRightWidth: 5.5,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tail: { position: 'absolute', top: 13, width: 2.5, height: 11, borderRadius: 1.5 },
});
