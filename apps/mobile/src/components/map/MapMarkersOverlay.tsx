// Prayer labels above the Skia field. The geographic user dot and qibla ray
// live in LocationLayer so MapLibre moves them with its own camera.
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, type SharedValue, useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';

import { driftedCamera, solarDrift } from '@/lib/map/line-geometry';
import { type Camera, mercX, mercY, project } from '@/lib/map/projection';
import { useSolarRenderNow } from '@/lib/map/useSolarRenderNow';
import { insideLabelBand, visibleLineLabel } from '@/lib/map/visible-line-label';
import { PRAYER_LABELS, type PrayerKey } from '@/lib/prayer-times';
import type { PrayerLineLabel } from '@/lib/solar/field';
import { polarBoundaryColorFor, prayerColorFor, prayerTextColorFor } from '@/lib/solar/palette';
import type { PolarBoundary } from '@/lib/solar/sun';
import { type Palette, radius, shadow, type } from '@/theme/tokens';
import { useActiveScheme, useColors } from '@/theme/useColors';
import type { PrayerLineData } from './skia/SolarSkiaOverlay';

interface Props {
  /** The LIVE camera shared value (same one the Skia canvas reads). Projecting against
   *  it on the UI thread keeps the pills glued to the basemap as it pans/zooms
   *  WITHOUT a per-frame React render — the screen only re-renders when the prayer
   *  labels or theme change, not on every camera tick. */
  camera: SharedValue<Camera>;
  /** The same clock inputs the Skia overlay draws the lines from, so each pill drifts with
   *  its line between live rebuilds instead of staying where the line was built. */
  dayStart: number;
  dayLength: number;
  nowFraction: SharedValue<number>;
  /** The instant `lines` and `labels` were built for. */
  geometryNow: number;
  /** Scrub preview: exact geometry, no drift, no fades — as the lines. */
  preview?: boolean;
  /** Pill anchors from buildLines: where each active prayer line wants its label. */
  labels: PrayerLineLabel[];
  lines: PrayerLineData[];
  topInset: number;
  bottomInset: number;
  nextKey: PrayerKey | null;
  /** The polar daylight boundary for this date (null off-season) — labels the dashed
   *  reference line the Skia overlay draws at the same latitude. */
  polarBoundary: PolarBoundary | null;
}

export function MapMarkersOverlay({
  camera,
  dayStart,
  dayLength,
  nowFraction,
  geometryNow,
  preview = false,
  labels,
  lines,
  topInset,
  bottomInset,
  nextKey,
  polarBoundary,
}: Props) {
  const c = useColors();
  const scheme = useActiveScheme();
  const renderNow = useSolarRenderNow(nowFraction, dayStart, dayLength, camera, preview);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Prayer pills — each sits ON its line (centred on the line's anchor point), so the
          line reads straight through it: no leader to trace, and each prayer's pill rides
          its own distinct line, so Maghrib and Isha separate instead of stacking where the
          lines converge. No time (the line is just "where it is this prayer right now", so a
          clock time read as an adhan time); the hue dot + border identify the line. */}
      {labels.map((l) => (
        <PrayerPill
          key={`pill-${l.prayer}`}
          label={l}
          polylines={lines.find((line) => line.prayer === l.prayer)?.polylines ?? []}
          topInset={topInset}
          bottomInset={bottomInset}
          camera={camera}
          renderNow={renderNow}
          geometryNow={geometryNow}
          preview={preview}
          colors={c}
          scheme={scheme}
          isNext={l.prayer === nextKey}
        />
      ))}

      {/* Names the dashed polar boundary the Skia layer draws — turns the "why do the
          lines stop here?" gap into a labelled phenomenon. */}
      {polarBoundary != null && (
        <PolarBoundaryLabel boundary={polarBoundary} camera={camera} scheme={scheme} />
      )}
    </View>
  );
}

/** A whisper-quiet annotation sitting just above the polar boundary line: a tiny name +
 *  one-line reason, no chip/background, so it reads as a faint caption on the map rather
 *  than a UI element. Tells the user WHY the prayer lines stop at this latitude. */
function PolarBoundaryLabel({
  boundary,
  camera,
  scheme,
}: {
  boundary: PolarBoundary;
  camera: SharedValue<Camera>;
  scheme: ReturnType<typeof useActiveScheme>;
}) {
  const midnight = boundary.kind === 'midnight-sun';
  // The line's own hue, from the one table the Skia overlay paints the dashes from.
  const tint = polarBoundaryColorFor(boundary.kind, scheme).text;
  const name = midnight ? 'Midnattssol' : 'Polarnatt';
  const why = midnight ? 'solen går inte ner' : 'solen går inte upp';
  // Anchored over central Sweden (lon ~16), away from the prayer pills that cluster on
  // the sweeping lines further south. Sits just above the line (small upward nudge).
  // A translate, not `left`/`top` — see `anchor` in the styles for why.
  const posStyle = useAnimatedStyle(() => {
    const p = project(16, boundary.lat, camera.get());
    return { transform: [{ translateX: p.x }, { translateY: p.y - 18 }] };
  });
  return (
    <Animated.View style={[styles.anchor, posStyle]}>
      <View style={styles.polarWrap}>
        <Text style={[styles.polarName, { color: tint }]}>{name}</Text>
        <Text style={[styles.polarWhy, { color: tint }]}>{why}</Text>
      </View>
    </Animated.View>
  );
}

/** One prayer-line label pill. Split into its own component so each can hold a
 *  useAnimatedStyle hook (the active label set varies, so the projection can't live in
 *  a .map() in the parent body). Positioned on the UI thread against the live camera. */
function PrayerPill({
  label,
  polylines,
  topInset,
  bottomInset,
  camera,
  renderNow,
  geometryNow,
  preview,
  colors,
  scheme,
  isNext,
}: {
  label: PrayerLineLabel;
  polylines: PrayerLineData['polylines'];
  topInset: number;
  bottomInset: number;
  camera: SharedValue<Camera>;
  renderNow: SharedValue<number>;
  geometryNow: number;
  preview: boolean;
  colors: Palette;
  scheme: ReturnType<typeof useActiveScheme>;
  isNext: boolean;
}) {
  // The pill wears its line's colour, and nothing else does the identifying: the border
  // takes the LINE hue and the label takes that same hue darkened just enough to be
  // legible as text (see prayerTextColorFor — the raw line colours fail contrast as small
  // text in light mode). There is no longer a coloured dot: the border and the word were
  // already saying "this line is Maghrib", so the dot was a third voice repeating them,
  // inside a chip deliberately kept as small as a map annotation can be.
  //
  // "Next" is weight and ring thickness ONLY. It used to also repaint the label brass,
  // which put a yellow word on Isha's indigo line — the same mismatch that had already
  // been fixed on the border. Emphasis should not cost a pill its identity.
  const hue = prayerColorFor(label.prayer, scheme);
  const textHue = prayerTextColorFor(label.prayer, scheme);
  // Camera-independent projection; the compiler retains this until geometry changes.
  // Per-frame clipping below then uses only scale/translate on the UI thread.
  const mercLines = polylines.map((line) => {
    const points = new Float64Array(line.length * 2);
    line.forEach(([lon, lat], i) => {
      points[i * 2] = mercX(lon);
      points[i * 2 + 1] = mercY(lat);
    });
    return points;
  });
  // A translate, not `left`/`top` — see `anchor` in the styles for why.
  // Projected through the drifted camera, so the pill sits on the line where Skia draws it
  // (see driftedCamera) rather than where the line was 0–45 s ago — ~550 px at z11.
  //
  // No dependency arrays on these worklets: Reanimated ignores them on native (and warns),
  // and its Babel plugin already re-creates a worklet when what it captures changes.
  const placement = useDerivedValue(() => {
    const cam = driftedCamera(camera.get(), solarDrift(renderNow.get(), geometryNow, preview));
    const anchor = project(label.lngLat[0], label.lngLat[1], cam);
    const p = visibleLineLabel(anchor, mercLines, cam, topInset, bottomInset);
    return { x: p.x, y: p.y, shown: insideLabelBand(p, cam, topInset, bottomInset) };
  });
  const posStyle = useAnimatedStyle(() => {
    const p = placement.get();
    return { transform: [{ translateX: p.x }, { translateY: p.y }] };
  });
  // Hidden while no stretch of the line crosses the label band — otherwise the pill stood on
  // its raw anchor, which can be under the status bar or the dock. Its own opacity, on the
  // chip, so it never fights the arrival/leaving fade on the anchor view.
  const chipStyle = useAnimatedStyle(() => ({ opacity: placement.get().shown ? 1 : 0 }));
  return (
    // Arrives and leaves with its line's 300 ms fade (PrayerLine), not as a cut. A scrub
    // shows exact frames, as the lines do; Reduce Motion skips layout animations itself.
    <Animated.View
      style={[styles.anchor, posStyle]}
      entering={preview ? undefined : PILL_FADE_IN}
      exiting={preview ? undefined : PILL_FADE_OUT}
    >
      <Animated.View
        style={[
          styles.pill,
          { backgroundColor: colors.pillSurface, borderColor: hue },
          isNext && styles.pillNext,
          chipStyle,
        ]}
      >
        <Text style={[styles.pillLabel, { color: textHue }, isNext && styles.pillLabelNext]}>
          {PRAYER_LABELS[label.prayer]}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const PILL_FADE_IN = FadeIn.duration(300);
const PILL_FADE_OUT = FadeOut.duration(300);

const styles = StyleSheet.create({
  // Every annotation is placed by moving THIS, a zero-size point at the map's origin, with
  // a transform — never by animating `left`/`top` on the annotation itself. The camera
  // shared value changes on every frame of every pan, pinch and fling, and a layout
  // property changed on the UI thread costs a layout pass per frame per view (Reanimated's
  // performance guide: prefer transform/opacity over top/left, which "require an additional
  // step of layout recalculation on each animation frame"), while a transform goes through
  // the fast path with no layout at all. The annotation inside centres itself on the point
  // with a static percent translate, so its own size never has to be measured.
  anchor: { position: 'absolute', left: 0, top: 0 },
  // A quiet map annotation, not a floating UI chip: compact, medium-weight, with only
  // a whisper of shadow. The prayer field is the hero — the pill just names a line.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.round,
    // Deliberately tight annotation geometry (a map label chip, not a UI button) —
    // off-scale on purpose so the pill stays compact against the prayer line.
    paddingVertical: 3,
    paddingHorizontal: 7,
    // Centre the pill on its computed point (RN supports % translate on 0.85/Fabric).
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    // The token's whisper-light annotation shadow (warm-palette shadow colour baked in).
    ...shadow.dot,
  },
  pillNext: { borderWidth: 1.5 },
  pillLabel: { ...type.micro },
  // Bold only — the colour stays the prayer's, so emphasis never costs identity.
  pillLabelNext: { fontWeight: '700' },
  // Faint map caption (no chip): centred on its anchor, sitting just above the boundary.
  polarWrap: {
    alignItems: 'center',
    transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
  },
  // Tiny, letter-spaced, all-quiet — a caption, not a label chip.
  polarName: { ...type.micro, fontSize: 9, fontWeight: '600', letterSpacing: 0.6 },
  polarWhy: { ...type.micro, fontSize: 8, letterSpacing: 0.2, opacity: 0.85 },
});
