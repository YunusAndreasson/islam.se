import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { radius, space, type } from '@/theme/tokens';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';

export function MapLineToast({ message, top, onDismiss }: { message: string; top: number; onDismiss: () => void }) {
  const c = useColors();
  // Glass over the live map takes the sky's colour, like every other card floating on it
  // (theme/skyChrome) — the palette's own `cardGlass` is the noon value, and this toast
  // is read at every hour.
  const sky = useSkyGlass();
  const reduced = useReducedMotion();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(onDismiss, 6500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  return <Animated.View pointerEvents="none" entering={reduced ? undefined : FadeIn.duration(180)}
    exiting={reduced ? undefined : FadeOut.duration(180)} style={[styles.wrap, { top }]}>
    <GlassSurface tint={sky.cardGlass} borderRadius={radius.lg} style={styles.card}>
      <Text accessibilityRole="text" style={[type.callout, { color: c.ink }]}>{message}</Text>
    </GlassSurface>
  </Animated.View>;
}
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md },
  card: { padding: space.md, borderRadius: radius.lg },
});
