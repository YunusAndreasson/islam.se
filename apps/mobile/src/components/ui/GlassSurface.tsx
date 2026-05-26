// The one glass primitive. On iOS 26+ it renders a native Liquid Glass surface
// (expo-glass-effect's GlassView, a UIVisualEffectView); everywhere else — Android,
// iOS < 26, web — GlassView is a plain transparent View, so we render our own
// translucent fallback chrome instead. Keeping that branch here means every glass
// surface in the app (the menu button, the popover, the prayer dock) looks
// consistent and the fallback lives in exactly one place.
import { GlassView, isLiquidGlassAvailable, type GlassStyle } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

import { mapTheme } from '../map/theme';

// Native capability is fixed for the process lifetime — resolve it once.
const LIQUID_GLASS = isLiquidGlassAvailable();

interface Props {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Glass material on iOS 26+. 'regular' is the frosted default; 'clear' is lighter. */
  glassEffectStyle?: GlassStyle;
  /** iOS 26+: lets the glass react to touches/scrolls beneath it. */
  interactive?: boolean;
  /** Optional tint for the native glass (iOS 26+ only). */
  tintColor?: string;
  /** Fill colour for the non-glass fallback (Android / iOS < 26). */
  fallbackColor?: string;
  /** Rim colour for the non-glass fallback. Themed callers pass their chrome's
      hairline so the rim follows the surface (light/dark, day/night) rather than a
      fixed bright white that glares on a dark surface. */
  fallbackBorderColor?: string;
}

export function GlassSurface({
  children,
  style,
  glassEffectStyle = 'regular',
  interactive = false,
  tintColor,
  fallbackColor = mapTheme.glassFallback,
  fallbackBorderColor = mapTheme.glassBorder,
}: Props) {
  if (LIQUID_GLASS) {
    return (
      <GlassView
        style={style}
        glassEffectStyle={glassEffectStyle}
        isInteractive={interactive}
        tintColor={tintColor}
      >
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[styles.fallback, { backgroundColor: fallbackColor, borderColor: fallbackBorderColor }, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
