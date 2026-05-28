// The one round glass control for the map's floating navigation (the Qibla compass,
// the settings cog). Lifted out of the old hamburger so every map nav button shares the
// exact 46×46 glass disc, soft shadow and chrome — and a future one stays consistent for
// free. Press gives a light haptic tick. These discs float directly ON the map canvas, so
// — like the dock and the city pills, NOT the OS-themed screens — they follow the map's
// sun-driven night factor (nightChrome): warm light glass over a day map, dark indigo
// glass past Isha. A light disc left stranded over the night map drew the eye like a beacon.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { hapticLight } from '../../lib/haptics';
import { shadow } from '../../theme/tokens';
import { nightChrome } from '../map/nightChrome';
import { GlassSurface } from '../ui/GlassSurface';

interface Props {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  /** 0 day → 1 deep night; blends the glass with the map under it (see nightChrome). */
  night: number;
}

export function GlassRoundButton({ onPress, accessibilityLabel, children, night }: Props) {
  const c = nightChrome(night);
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
      <GlassSurface
        style={styles.button}
        interactive
        fallbackColor={c.surface}
        fallbackBorderColor={c.hairline}
      >
        {children}
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.button,
  },
});
