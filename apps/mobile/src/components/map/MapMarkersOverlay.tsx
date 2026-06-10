// The point/label layer that rides ABOVE the Skia field canvas: the brass "you are
// here" dot, and the prayer pills that name each active prayer line.
//
// History: this layer USED to also draw a curated set of Swedish city dots + labels
// (Stockholm, Göteborg, Malmö, …). That curated overlay was retired 2026-05-29 —
// the MapTiler basemap now ships rich place labels straight from the OpenMapTiles
// `place` source-layer (see label_town in nordicStyle.ts), and a parallel overlay
// just duplicated those names against the basemap labels. Now this layer carries
// only what the basemap *can't* know: where the user is, and where the prayer
// lines are sweeping right now.
//
// The user marker is a DOT, not a named label (Apple/Google Maps convention): when the
// chosen location is a town the basemap already labels (e.g. Stockholm), a text label
// here would print the name a second time right on top of the basemap's own — so the
// place name lives in the dock hero + Settings instead, and the map just marks the spot.
//
// Positions come from project() (src/lib/map/projection.ts), the same projection the
// Skia canvas and MapLibre basemap use, so the dot/pills land exactly on the map.
// `pointerEvents="none"` so gestures fall straight through to the basemap.
//
// Theming: OS-themed (useColors). Apple Maps-style — the basemap and chrome share an
// OS axis; the prayer-line hues are still sun-driven (the live sky), but the user
// marker / pills follow the OS palette so the layer reads coherently against both
// basemaps.
import { StyleSheet, Text, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { type Camera, project } from '../../lib/map/projection';
import { type LatLng, PRAYER_LABELS, type PrayerKey } from '../../lib/prayer-times';
import type { PrayerLineLabel } from '../../lib/solar/field';
import { prayerColorFor } from '../../lib/solar/palette';
import type { PolarBoundary } from '../../lib/solar/sun';
import { type Palette, radius, shadow, space, type } from '../../theme/tokens';
import { useActiveScheme, useColors } from '../../theme/useColors';

interface Props {
  /** The LIVE camera shared value (same one the Skia canvas reads). Projecting against
   *  it on the UI thread keeps the dot/pills glued to the basemap as it pans/zooms
   *  WITHOUT a per-frame React render — the screen only re-renders when the prayer
   *  labels or theme change, not on every camera tick. */
  camera: SharedValue<Camera>;
  userCoords: LatLng;
  /** Pill anchors from buildLines: where each active prayer line wants its label. */
  labels: PrayerLineLabel[];
  nextKey: PrayerKey | null;
  /** The polar daylight boundary for this date (null off-season) — labels the dashed
   *  reference line the Skia overlay draws at the same latitude. */
  polarBoundary: PolarBoundary | null;
}

export function MapMarkersOverlay({
  camera,
  userCoords,
  labels,
  nextKey,
  polarBoundary,
}: Props) {
  const c = useColors();
  const scheme = useActiveScheme();
  // Marker rim flips warm/dark by basemap so the dot always reads against the ground.
  const rim = scheme === 'dark' ? 'rgba(225,232,255,0.9)' : '#ffffff';

  // "You are here" — projected on the UI thread so it tracks the map live. Two layers
  // (glow + dot) share one projection; each centres itself with its own offset.
  const glowStyle = useAnimatedStyle(() => {
    const p = project(userCoords.longitude, userCoords.latitude, camera.value);
    return { left: p.x - 13, top: p.y - 13 };
  }, [userCoords.longitude, userCoords.latitude]);
  const dotStyle = useAnimatedStyle(() => {
    const p = project(userCoords.longitude, userCoords.latitude, camera.value);
    return { left: p.x - 6, top: p.y - 6 };
  }, [userCoords.longitude, userCoords.latitude]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* "You are here" — brass glow + dot, sized a touch larger than any basemap
          place marker so it stays the unmistakable hero of the layer. No text label:
          the place name lives in the dock + Settings, so the marker never duplicates
          the basemap's own town label (see the file header). */}
      <Animated.View style={[styles.userGlow, { backgroundColor: c.highlight }, glowStyle]} />
      <Animated.View
        style={[styles.userDot, { backgroundColor: c.highlight, borderColor: rim }, dotStyle]}
      />

      {/* Prayer pills — each sits ON its line (centred on the line's anchor point), so the
          line reads straight through it: no leader to trace, and each prayer's pill rides
          its own distinct line, so Maghrib and Isha separate instead of stacking where the
          lines converge. No time (the line is just "where it is this prayer right now", so a
          clock time read as an adhan time); the hue dot + border identify the line. */}
      {labels.map((l) => (
        <PrayerPill
          key={`pill-${l.prayer}`}
          label={l}
          camera={camera}
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
  const tint = midnight
    ? scheme === 'dark'
      ? 'rgba(255,224,168,0.62)'
      : 'rgba(120,86,24,0.78)'
    : scheme === 'dark'
      ? 'rgba(170,206,255,0.66)'
      : 'rgba(48,80,134,0.82)';
  const name = midnight ? 'Midnattssol' : 'Polarnatt';
  const why = midnight ? 'solen går inte ner' : 'solen går inte upp';
  // Anchored over central Sweden (lon ~16), away from the prayer pills that cluster on
  // the sweeping lines further south. Sits just above the line (small upward nudge).
  const posStyle = useAnimatedStyle(() => {
    const p = project(16, boundary.lat, camera.value);
    return { left: p.x, top: p.y - 18 };
  }, [boundary.lat]);
  return (
    <Animated.View style={[styles.polarWrap, posStyle]}>
      <Text style={[styles.polarName, { color: tint }]}>{name}</Text>
      <Text style={[styles.polarWhy, { color: tint }]}>{why}</Text>
    </Animated.View>
  );
}

/** One prayer-line label pill. Split into its own component so each can hold a
 *  useAnimatedStyle hook (the active label set varies, so the projection can't live in
 *  a .map() in the parent body). Positioned on the UI thread against the live camera. */
function PrayerPill({
  label,
  camera,
  colors,
  scheme,
  isNext,
}: {
  label: PrayerLineLabel;
  camera: SharedValue<Camera>;
  colors: Palette;
  scheme: ReturnType<typeof useActiveScheme>;
  isNext: boolean;
}) {
  // Border + dot carry the prayer hue (same colour as the line the pill sits on), so
  // the pill always reads as part of its line — for EVERY prayer, next included. The
  // "next" emphasis is a thicker ring and brass BOLD label text, mirroring the dock's
  // nextEmphasis rows: brass layers ON TOP of the hue, never replaces it. (A brass
  // border here used to override the hue — Isha's indigo line wore a yellow ring while
  // Maghrib's matched, which read as a bug, not a signal.)
  const hue = prayerColorFor(label.prayer, scheme);
  const posStyle = useAnimatedStyle(() => {
    const p = project(label.lngLat[0], label.lngLat[1], camera.value);
    return { left: p.x, top: p.y };
  }, [label.lngLat[0], label.lngLat[1]]);
  return (
    <Animated.View
      style={[
        styles.pill,
        { backgroundColor: colors.pillSurface, borderColor: hue },
        isNext && styles.pillNext,
        posStyle,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: hue }]} />
      <Text
        style={[
          styles.pillLabel,
          { color: colors.ink },
          isNext && [styles.pillLabelNext, { color: colors.highlightText }],
        ]}
      >
        {PRAYER_LABELS[label.prayer]}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // "You are here" glow + dot. Static geometry lives here; the animated style supplies
  // only the live-projected left/top, so these objects stay referentially stable.
  userGlow: { position: 'absolute', width: 26, height: 26, borderRadius: 13, opacity: 0.16 },
  userDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  // A quiet map annotation, not a floating UI chip: compact, medium-weight, with only
  // a whisper of shadow. The prayer field is the hero — the pill just names a line.
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.round,
    // Deliberately tight annotation geometry (a map label chip, not a UI button) —
    // off-scale on purpose so the pill stays compact against the prayer line.
    paddingVertical: 3,
    paddingHorizontal: 7,
    gap: space.xs,
    // Centre the pill on its computed point (RN supports % translate on 0.85/Fabric).
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    // The token's whisper-light annotation shadow (warm-palette shadow colour baked in).
    ...shadow.dot,
  },
  pillNext: { borderWidth: 1.5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillLabel: { ...type.micro },
  // Brass bold for the next prayer's label — the dock's nextEmphasis, on the map.
  pillLabelNext: { fontWeight: '700' },
  // Faint map caption (no chip): centred on its anchor, sitting just above the boundary.
  polarWrap: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: '-50%' }, { translateY: '-100%' }],
  },
  // Tiny, letter-spaced, all-quiet — a caption, not a label chip.
  polarName: { ...type.micro, fontSize: 9, fontWeight: '600', letterSpacing: 0.6 },
  polarWhy: { ...type.micro, fontSize: 8, letterSpacing: 0.2, opacity: 0.85 },
});
