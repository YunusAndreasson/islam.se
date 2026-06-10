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
//    the blur so the surface's colour is decided by the chrome (the active OS
//    palette's `cardGlass`), not by whatever pixel the OS sampled. The blur
//    texture survives as the underlying material; the colour is locked. Without
//    a tint the surface follows whatever's behind it (fine for halos / city
//    pills, not for the chrome surfaces — dock / nav discs).
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
import { BlurView, BlurTargetView } from 'expo-blur';
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';

// Native capability is fixed for the process lifetime — resolve it once. We require BOTH:
// the runtime API actually exists (isGlassEffectAPIAvailable) AND the Liquid Glass design
// is active (isLiquidGlassAvailable). The API check matters because some iOS 26 beta builds
// ship without the underlying API and *crash* if a GlassView is mounted anyway (expo/expo
// #40911); Expo documents checking it before using GlassView.
const LIQUID_GLASS = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

// Android blur needs to know WHAT to blur: expo-blur's Dimezis path samples a
// BlurTargetView's render node rather than "whatever is behind the view" (the
// behind-content capture iOS gets for free). The two pieces below wire that up
// without coupling call-sites to expo-blur:
//
//   <GlassBackdropProvider>            ← screen root (context carries one ref)
//     <GlassBackdropTarget>…map…</GlassBackdropTarget>   ← what glass should blur
//     …GlassSurfaces (dock, nav discs)…                  ← read the ref via context
//   </GlassBackdropProvider>
//
// Screens without a provider (settings/qibla sheets sit on opaque paper, where a
// behind-blur is invisible anyway) get `blurMethod="none"` — the same flat-tint
// fallback expo-blur used to silently apply, now stated explicitly instead of
// warning on every mount.
const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

/** Provides one blur-target ref to a whole screen. Must wrap BOTH the
 *  GlassBackdropTarget and every GlassSurface that should sample it. */
export function GlassBackdropProvider({ children }: { children: ReactNode }) {
  const ref = useRef<View>(null);
  return <BlurTargetContext.Provider value={ref}>{children}</BlurTargetContext.Provider>;
}

/** Marks the content that glass surfaces blur (the map + its overlays). Renders a
 *  native blur target on Android, a plain View elsewhere. Glass surfaces must live
 *  OUTSIDE this subtree — a glass inside the target would sample itself. */
export function GlassBackdropTarget({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useContext(BlurTargetContext);
  return (
    <BlurTargetView ref={ref ?? undefined} style={style}>
      {children}
    </BlurTargetView>
  );
}

// Per-mount because the user can toggle Reduce Transparency at runtime (iOS Settings →
// Accessibility → Display). When on, a translucent blur is exactly what the setting asks
// us to drop, so we render a solid surface instead. The initial read works cross-platform
// (Android resolves false); the `reduceTransparencyChanged` event is iOS-only and simply
// never fires elsewhere. Everything is optional-chained so a thin RN mock can't throw.
function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    // Guard on the function reference (not the returned Promise) so the boolean
    // conditional stays Promise-free; the .catch keeps it a handled, non-floating promise.
    if (AccessibilityInfo.isReduceTransparencyEnabled) {
      AccessibilityInfo.isReduceTransparencyEnabled()
        .then((v) => {
          if (mounted) setReduce(v);
        })
        .catch(() => {});
    }
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduce);
    return () => {
      mounted = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}

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
   * Chrome tint painted ON TOP of the native blur (absoluteFill). Pass the active OS
   * palette's `cardGlass` so the surface's visible colour is decided by the chrome,
   * not by what the OS sampled under the glass — the only way to keep cog and compass
   * identical when the wash beneath them differs.
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
  const reduce = useReduceTransparency();
  const blurTarget = useContext(BlurTargetContext);
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
    // without going opaque. On Android true behind-content blur requires a
    // GlassBackdropTarget (see above); without one the explicit "none" renders the
    // flat translucent fallback. blurMethod is Android-only — iOS < 26 blurs natively.
    <BlurView
      style={[StyleSheet.absoluteFill, radius]}
      tint="default"
      intensity={40}
      blurMethod={blurTarget ? 'dimezisBlurViewSdk31Plus' : 'none'}
      blurTarget={blurTarget ?? undefined}
    />
  );

  // Reduce Transparency on: skip the blur/glass material entirely and show a solid
  // fill from the chrome `tint` (no separate tint overlay — it would double up). The
  // chrome passes `cardGlass` (~0.90 alpha), so the solid is near-opaque, far more
  // legible than a blurred surface; a future refinement could thread a fully-opaque
  // tint. Decorative surfaces with no `tint` (halos / pills) simply drop the material.
  if (reduce) {
    return (
      <View style={[style, radius, { overflow: 'hidden' }]}>
        {tint ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, radius, { backgroundColor: tint }]} />
        ) : null}
        {children}
      </View>
    );
  }

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
