// The bar at the top of every modal/sheet screen — Qibla, Inställningar, Om.
// Lifted out of the three call-sites where each had drifted its own padding (12 vs
// 16) and icon size (24 vs 26), so the three sibling sheets read as one family:
// same height, same gutter, same 24px glyph in the same muted ink.
//
// Variants:
//   • 'close' (✕ on the right) — top-level sheets that dismiss back to the map.
//   • 'back'  (← on the left)  — pushed pages inside a sheet (e.g. Om inside Settings).
//
// router.back() fails silently when there is no entry to pop (cold-start / deep link
// straight into a sheet); `fallback` is the route to fall back to so the control
// never dead-ends. The accessibility label flips with the variant.
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

interface Props {
  variant: 'close' | 'back';
  /** Route to navigate to when there is no history to pop. */
  fallback: Href;
}

export function ModalBar({ variant, fallback }: Props) {
  const c = useColors();
  const isClose = variant === 'close';
  return (
    <View style={[styles.bar, isClose ? styles.barClose : styles.barBack]}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
        accessibilityRole="button"
        accessibilityLabel={isClose ? 'Stäng' : 'Tillbaka'}
        hitSlop={10}
        style={styles.btn}
      >
        <MaterialIcons name={isClose ? 'close' : 'arrow-back'} size={24} color={c.inkMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  barClose: { justifyContent: 'flex-end' },
  barBack: { justifyContent: 'flex-start' },
  btn: { padding: 4 },
});
