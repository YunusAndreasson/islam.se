// The one glass primitive. On iOS 26+ it renders a native Liquid Glass surface
// (expo-glass-effect's GlassView, a UIVisualEffectView); everywhere else — iOS < 26
// and Android — it renders expo-blur's BlurView, which is a real native blur
// (Android 12+ uses RenderEffect for true behind-content blur). No flat-fill
// fallback: every device gets a real native glass material.
//
// Two design decisions worth knowing about:
//
// 1. `tint`. Native glass on both platforms samples the pixels behind the surface,
//    so an untinted glass over the map wash drifts in colour as the wash shifts —
//    which made the left compass disc and the right cog disc disagree at dawn
//    (different parts of Sweden under each, so the OS sampled different darkness
//    for each disc). Passing `tint` paints an absoluteFill chrome layer ON TOP of
//    the blur so the surface's colour is decided by the chrome (nightChrome's
//    c.surface), not by whatever pixel the OS sampled. The blur texture survives
//    as the underlying material; the colour is locked. Without a tint the surface
//    follows whatever's behind it (fine for halos / city pills, not for the chrome
//    surfaces — dock / nav discs).
//
// 2. `borderRadius`. iOS Liquid Glass (UIVisualEffectView) does NOT clip to an
//    ancestor's `overflow: hidden` reliably — the effect paints into its own layer
//    and the corners come out square or jagged. The fix is to put cornerRadius on
//    the glass layer itself; we apply `borderRadius` here on every layer (glass,
//    tint, outer wrapper) so the surface clips smoothly on both platforms.
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassStyle,
} from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

// Native capability is fixed for the process lifetime — resolve it once. We require BOTH:
// the runtime API actually exists (isGlassEffectAPIAvailable) AND the Liquid Glass design
// is active (isLiquidGlassAvailable). The API check matters because some iOS 26 beta builds
// ship without the underlying API and *crash* if a GlassView is mounted anyway (expo/expo
// #40911); Expo documents checking it before using GlassView.
const LIQUID_GLASS = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

interface Props {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius applied to the native glass layer itself, the tint layer, and the
   * wrapper — so iOS Liquid Glass clips its own layer (it doesn't honour ancestor
   * `overflow: hidden`). Defaults to 0 (square). */
  borderRadius?: number;
  /** Glass material on iOS 26+. 'regular' is the frosted default; 'clear' is lighter. */
  glassEffectStyle?: GlassStyle;
  /** iOS 26+: lets the glass react to touches/scrolls beneath it. */
  interactive?: boolean;
  /**
   * Chrome tint painted ON TOP of the native blur (absoluteFill). Pass nightChrome's
   * `c.surface` so the surface's visible colour is decided by the chrome, not by what
   * the OS sampled under the glass — the only way to keep cog and compass identical
   * when the wash beneath them differs.
   */
  tint?: string;
}

export function GlassSurface({
  children,
  style,
  borderRadius = 0,
  glassEffectStyle = 'regular',
  interactive = false,
  tint,
}: Props) {
  const radius = { borderRadius };
  const Glass = LIQUID_GLASS ? (
    <GlassView
      style={[StyleSheet.absoluteFill, radius]}
      glassEffectStyle={glassEffectStyle}
      isInteractive={interactive}
    />
  ) : (
    // BlurView with a `default` tint so the blur itself is colour-neutral — the chrome
    // tint above provides the warmth/coolness. Intensity 40 is a real blurred backdrop
    // without going opaque. `experimentalBlurMethod="dimezisBlurView"` enables true
    // behind-content blur on Android (no-op on iOS).
    <BlurView
      style={[StyleSheet.absoluteFill, radius]}
      tint="default"
      intensity={40}
      experimentalBlurMethod="dimezisBlurView"
    />
  );

  return (
    <View style={[style, radius, { overflow: 'hidden' }]}>
      {Glass}
      {tint ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, radius, { backgroundColor: tint }]} />
      ) : null}
      {children}
    </View>
  );
}
