// The point/label layer that rides ABOVE the Skia field canvas: the brass "you are
// here" dot + label, and the prayer pills that name each active prayer line.
//
// History: this layer USED to also draw a curated set of Swedish city dots + labels
// (Stockholm, Göteborg, Malmö, …). That curated overlay was retired 2026-05-29 —
// the MapTiler basemap now ships rich place labels straight from the OpenMapTiles
// `place` source-layer (see label_town in nordicStyle.ts), and a parallel overlay
// just duplicated those names against the basemap labels. Now this layer carries
// only what the basemap *can't* know: where the user is, and where the prayer
// lines are sweeping right now.
//
// Positions come from project() (src/lib/map/projection.ts), the same projection the
// Skia canvas and MapLibre basemap use, so the dot/label/pills land exactly on the
// map. `pointerEvents="none"` so gestures fall straight through to the basemap.
//
// Theming: OS-themed (useColors). Apple Maps-style — the basemap and chrome share an
// OS axis; the prayer-line hues are still sun-driven (the live sky), but the user
// marker / label / pills follow the OS palette so the layer reads coherently against
// both basemaps. The label halo flips warm (light basemap) / dark (navy basemap) so
// the text stays readable on either ground.
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
  /** The user's place name (GPS or manual) — always labelled at the marker. */
  userLabel: string;
  /** Pill anchors from buildLines: where each active prayer line wants its label. */
  labels: PrayerLineLabel[];
  nextKey: PrayerKey | null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// User label font grows with zoom — generous at country view, comfortable at city view.
function userLabelFont(zoom: number): number {
  const t = clamp01((zoom - 4) / 5);
  return lerp(13, 17, t);
}

// Fixed centred box for the user label — wider than any place name, with
// `numberOfLines={2}` in render so long ones wrap rather than clip.
const LABEL_BOX = 140;

// Gap (px) from the user marker's centre to the top of its name label —
// enough to clear the brass glow (radius 13).
const USER_LABEL_GAP = 15;

export function MapMarkersOverlay({ camera, userCoords, userLabel, labels, nextKey }: Props) {
  const c = useColors();
  const scheme = useActiveScheme();
  // Marker rim + label halo flip warm/dark by basemap so the dot + text always read.
  const rim = scheme === 'dark' ? 'rgba(225,232,255,0.9)' : '#ffffff';
  const halo = scheme === 'dark' ? 'rgba(18,22,36,0.92)' : 'rgba(250,247,240,0.92)';

  const user = project(userCoords.longitude, userCoords.latitude, camera);
  const userName = userLabel.trim();
  const userFont = userLabelFont(camera.zoom);

  // Pill placements computed once — reused for projection of every active prayer
  // line's label anchor.
  const pills = labels.map((l) => {
    const p = project(l.lngLat[0], l.lngLat[1], camera);
    return { l, x: p.x, y: p.y };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* "You are here" — brass glow + dot, sized a touch larger than any basemap
          place marker so it stays the unmistakable hero of the layer. */}
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
      {/* The user's place name — sits just below the marker, halo'd so it reads on any
          ground. Wrapped to two lines so long names (Helsingborg, Helsingfors) don't
          clip. */}
      {userName ? (
        <Text
          numberOfLines={2}
          style={{
            position: 'absolute',
            left: user.x - LABEL_BOX / 2,
            top: user.y + USER_LABEL_GAP,
            width: LABEL_BOX,
            textAlign: 'center',
            fontSize: userFont,
            fontWeight: '600',
            color: c.ink,
            textShadowColor: halo,
            textShadowRadius: 2.5,
            textShadowOffset: { width: 0, height: 0 },
          }}
        >
          {userName}
        </Text>
      ) : null}

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
