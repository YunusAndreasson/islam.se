// The one round glass control for the map's floating navigation (the Qibla compass,
// the settings cog). Lifted out of the old hamburger so every map nav button shares the
// exact 46×46 glass disc, OS-themed chrome and soft shadow — and a future one stays
// consistent for free. Press gives a light haptic tick. Like the rest of the chrome it
// follows the phone's light/dark theme (useColors), not the map's sun-driven night.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { hapticLight } from '../../lib/haptics';
import { shadow } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';
import { GlassSurface } from '../ui/GlassSurface';

interface Props {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}

export function GlassRoundButton({ onPress, accessibilityLabel, children }: Props) {
  const c = useColors();
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
        fallbackColor={c.cardGlass}
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
