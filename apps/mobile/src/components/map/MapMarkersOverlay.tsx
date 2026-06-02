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

import { type Camera, project } from '../../lib/map/projection';
import { type LatLng, PRAYER_LABELS, type PrayerKey } from '../../lib/prayer-times';
import type { PrayerLineLabel } from '../../lib/solar/field';
import { prayerColorFor } from '../../lib/solar/palette';
import { radius, shadow, space, type } from '../../theme/tokens';
import { useActiveScheme, useColors } from '../../theme/useColors';

interface Props {
  /** React-state camera (settled after each region change) shared with the Skia canvas. */
  camera: Camera;
  userCoords: LatLng;
  /** Pill anchors from buildLines: where each active prayer line wants its label. */
  labels: PrayerLineLabel[];
  nextKey: PrayerKey | null;
}

export function MapMarkersOverlay({ camera, userCoords, labels, nextKey }: Props) {
  const c = useColors();
  const scheme = useActiveScheme();
  // Marker rim flips warm/dark by basemap so the dot always reads against the ground.
  const rim = scheme === 'dark' ? 'rgba(225,232,255,0.9)' : '#ffffff';

  const user = project(userCoords.longitude, userCoords.latitude, camera);

  // Pill placements computed once — reused for projection of every active prayer
  // line's label anchor.
  const pills = labels.map((l) => {
    const p = project(l.lngLat[0], l.lngLat[1], camera);
    return { l, x: p.x, y: p.y };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* "You are here" — brass glow + dot, sized a touch larger than any basemap
          place marker so it stays the unmistakable hero of the layer. No text label:
          the place name lives in the dock + Settings, so the marker never duplicates
          the basemap's own town label (see the file header). */}
      <View
        style={{
          position: 'absolute',
          left: user.x - 13,
          top: user.y - 13,
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: c.highlight,
          opacity: 0.16,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: user.x - 6,
          top: user.y - 6,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: c.highlight,
          borderColor: rim,
          borderWidth: 2,
        }}
      />

      {/* Prayer pills — each sits ON its line (centred on the line's anchor point), so the
          line reads straight through it: no leader to trace, and each prayer's pill rides
          its own distinct line, so Maghrib and Isha separate instead of stacking where the
          lines converge. No time (the line is just "where it is this prayer right now", so a
          clock time read as an adhan time); the hue dot + border identify the line. */}
      {pills.map(({ l, x, y }) => {
        const isNext = l.prayer === nextKey;
        const hue = prayerColorFor(l.prayer, scheme);
        return (
          <View
            key={`pill-${l.prayer}`}
            style={[
              styles.pill,
              {
                left: x,
                top: y,
                backgroundColor: c.pillSurface,
                // Border carries the prayer hue (same colour as the line it sits on), so the
                // pill reads as part of its line; the label text stays ink-legible. "Next"
                // is distinguished by a thicker ring, not a different colour.
                borderColor: hue,
              },
              isNext && styles.pillNext,
            ]}
          >
            <View style={[styles.dot, { backgroundColor: hue }]} />
            <Text style={[styles.pillLabel, { color: c.ink }]}>{PRAYER_LABELS[l.prayer]}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
