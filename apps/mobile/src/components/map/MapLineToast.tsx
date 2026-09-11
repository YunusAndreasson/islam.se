import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

export function MapLineToast({ message, top, onDismiss }: { message: string; top: number; onDismiss: () => void }) {
  const c = useColors();
  const reduced = useReducedMotion();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(onDismiss, 6500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  return <Animated.View pointerEvents="none" entering={reduced ? undefined : FadeIn.duration(180)}
    exiting={reduced ? undefined : FadeOut.duration(180)} style={[styles.wrap, { top }]}>
    <GlassSurface tint={c.cardGlass} borderRadius={radius.lg} style={styles.card}>
      <Text accessibilityRole="text" style={[type.callout, { color: c.ink }]}>{message}</Text>
    </GlassSurface>
  </Animated.View>;
}
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md },
  card: { padding: space.md, borderRadius: radius.lg },
});
