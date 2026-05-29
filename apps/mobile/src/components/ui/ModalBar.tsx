// The bar at the top of every modal/sheet screen — Qibla, Inställningar, Om.
// Lifted out of the three call-sites where each had drifted its own padding and
// icon size, so the three sibling sheets read as one family.
//
// The close / back control is a SMALL Liquid Glass disc, the same family as the
// map's nav discs (compass + cog) — same material on iOS 26+ (native Liquid Glass),
// real native blur on every other device (expo-blur). The disc is OS-themed
// (cardGlass + hairline from useColors), not sun-driven, because it lives over the
// sheet's content surface (not the map). 38 dp diameter — slightly smaller than the
// 46 dp map discs so it reads as a chrome control inside a 44 dp bar.
//
// Variants:
//   • 'close' (✕ on the right) — top-level sheets that dismiss back to the map.
//   • 'back'  (← on the left)  — pushed pages inside a sheet (e.g. Om inside Settings).
//
// router.back() fails silently when there is no entry to pop (cold-start / deep link
// straight into a sheet); `fallback` is the route to fall back to so the control
// never dead-ends.
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { space } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

import { GlassRoundButton } from '../nav/GlassRoundButton';

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
      <GlassRoundButton
        size={38}
        tint={c.cardGlass}
        rim={c.hairline}
        accessibilityLabel={isClose ? 'Stäng' : 'Tillbaka'}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
      >
        <MaterialIcons name={isClose ? 'close' : 'arrow-back'} size={20} color={c.inkMuted} />
      </GlassRoundButton>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  barClose: { justifyContent: 'flex-end' },
  barBack: { justifyContent: 'flex-start' },
});
