// The one round glass control — used on the map nav (Qibla compass, settings cog)
// and on the modal sheets (close X, back arrow). Every disc on every surface in the
// app reads as one family: same shape, same shadow, same native Liquid Glass on
// iOS 26+, same real native blur (expo-blur) everywhere else.
//
// Callers pick the colours: `tint` paints the chrome on top of the native blur so
// the surface's colour is decided here, not by what the OS sampled under the glass
// (which is how left and right discs ended up disagreeing at dawn on the map). For
// the map discs, callers pass `nightChrome(night).surface / .hairline`; for OS-themed
// modal sheets they pass the active palette's `cardGlass / hairline`.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { hapticLight } from '../../lib/haptics';
import { shadow } from '../../theme/tokens';
import { GlassSurface } from '../ui/GlassSurface';

interface Props {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  /** Chrome tint painted over the native blur. Locks the colour against backdrop drift. */
  tint: string;
  /** Hairline rim colour around the disc. */
  rim: string;
  /** Disc diameter in dp. Defaults to 46 (map discs); 38 reads better on a 44-pt modal bar. */
  size?: number;
}

export function GlassRoundButton({ onPress, accessibilityLabel, children, tint, rim, size = 46 }: Props) {
  const radius = size / 2;
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
        style={[
          styles.button,
          { width: size, height: size, borderRadius: radius, borderColor: rim },
        ]}
        borderRadius={radius}
        interactive
        tint={tint}
      >
        {children}
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    ...shadow.button,
  },
});
