// The point/label layer that rides ABOVE the Skia field canvas: city dots + their
// (collision-managed) labels, the brass "you are here" dot, and the prayer pills. These
// were MapLibre GL layers + Markers (CityMarkers, UserLocationMarker, the pills in
// PrayerFieldOverlay); now that the wash is a Skia canvas above the basemap, these must
// sit above THAT canvas to stay legible (the night-veil-over-cities look was rejected),
// so they're plain RN views projected from the same camera. Native <Text> keeps the
// labels and pill times crisp and accessible. `pointerEvents="none"` lets gestures
// fall through to the map.
//
// Positions come from project() (src/lib/map/projection.ts), the same projection the
// Skia canvas and MapLibre basemap use, so dots/labels/pills land exactly on the map.
//
// Theming: OS-themed (useColors). Apple Maps-style — the basemap and chrome share an OS
// axis; the wash and prayer-line hues are still sun-driven (the live sky), but city
// markers / labels / pills follow the OS palette so the layer reads coherently against
// both basemaps. The label halo flips warm (light basemap) / dark (navy basemap) so the
// text stays readable on either ground.
import { StyleSheet, Text, View } from 'react-native';

import { CITY_POINTS } from '../../lib/map/cities';
import { type Box, placeCityLabels } from '../../lib/map/cityLabels';
import { type Camera, project } from '../../lib/map/projection';
import { type LatLng, PRAYER_LABELS, type PrayerKey } from '../../lib/prayer-times';
import type { PrayerLineLabel } from '../../lib/solar/field';
import { prayerColorFor } from '../../lib/solar/palette';
import { palette } from '../../theme/tokens';
import { useActiveScheme, useColors } from '../../theme/useColors';

interface Props {
  /** React-state camera (settled after each region change) shared with the Skia canvas. */
  camera: Camera;
  userCoords: LatLng;
  /** The user's place name (GPS or manual) — always labelled at the marker, top priority. */
  userLabel: string;
  /** Pill anchors from buildLines: where each active prayer line wants its label. */
  labels: PrayerLineLabel[];
  nextKey: PrayerKey | null;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// Dot radius / label size grow with zoom and shrink with rank — mirrors the old
// MapLibre zoom-interpolated `DOT_RADIUS` / `LABEL_SIZE` expressions (zoom 4 → 9).
function dotRadius(rank: number, zoom: number): number {
  const t = clamp01((zoom - 4) / 5);
  const lo = rank === 1 ? 4.5 : rank === 2 ? 3.4 : 2.8;
  const hi = rank === 1 ? 7 : rank === 2 ? 5.5 : 4.5;
  return lerp(lo, hi, t);
}
function labelFont(rank: number, zoom: number): number {
  const t = clamp01((zoom - 4) / 5);
  const lo = rank === 1 ? 13 : rank === 2 ? 11.5 : 10.5;
  const hi = rank === 1 ? 17 : rank === 2 ? 15 : 13.5;
  return lerp(lo, hi, t);
}

// Fixed centred box for a city label — wider than any name ("Helsingfors" ≈ 100 px at
// the largest size) so it never clips, and centred on the dot without a % transform.
const LABEL_BOX = 140;

// Gap (px) from the user marker's centre to the top of its (always-shown) name label —
// enough to clear the brass glow (radius 13).
const USER_LABEL_GAP = 15;

export function MapMarkersOverlay({ camera, userCoords, userLabel, labels, nextKey }: Props) {
  const c = useColors();
  const scheme = useActiveScheme();
  // Marker rim + label halo flip warm/dark by basemap so dots + text always read.
  const rim = scheme === 'dark' ? 'rgba(225,232,255,0.9)' : '#ffffff';
  const halo = scheme === 'dark' ? 'rgba(18,22,36,0.92)' : 'rgba(250,247,240,0.92)';

  const user = project(userCoords.longitude, userCoords.latitude, camera);
  const userName = userLabel.trim();
  const userFont = labelFont(1, camera.zoom);

  // Pill placements computed once — reused for both the collision reservation and the
  // render below. Each pill sits ON its line (at the line's anchor point): no leader to
  // trace back, and because each prayer's anchor is on its own distinct line, the pills
  // separate naturally instead of two perpendicular offsets stacking on the same spot
  // (which made Isha land on top of Maghrib where the lines converge up north).
  const pills = labels.map((l) => {
    const p = project(l.lngLat[0], l.lngLat[1], camera);
    return { l, x: p.x, y: p.y };
  });

  // Boxes the city labels must route around: the user marker (its dot + its forced name
  // slot — the user's city ALWAYS shows, top priority) and every prayer pill.
  const reserved: Box[] = [];
  if (userName) {
    const userHalf = Math.max(16, (userName.length * userFont * 0.55) / 2);
    reserved.push({
      left: user.x - userHalf,
      top: user.y - 16,
      right: user.x + userHalf,
      bottom: user.y + USER_LABEL_GAP + userFont * 1.2,
    });
  } else {
    reserved.push({ left: user.x - 16, top: user.y - 16, right: user.x + 16, bottom: user.y + 16 });
  }
  for (const { l, x, y } of pills) {
    const pw = PRAYER_LABELS[l.prayer].length * 11 * 0.55 + 30;
    reserved.push({ left: x - pw / 2, top: y - 13, right: x + pw / 2, bottom: y + 13 });
  }

  // Project city dots; place labels rank-sorted, padded so dense clusters thin out, and
  // routed around the reserved boxes. A city's DOT only renders if its LABEL survived, so
  // there are no orphan dots (a dot with no name reads as a mystery point).
  const dots = CITY_POINTS.map((city) => {
    const p = project(city.lon, city.lat, camera);
    return { ...city, x: p.x, y: p.y, r: dotRadius(city.rank, camera.zoom) };
  });
  const placedLabels = placeCityLabels(
    dots.map((d) => ({ name: d.name, rank: d.rank, x: d.x, y: d.y })),
    {
      width: camera.width,
      height: camera.height,
      fontSizeForRank: (rank) => labelFont(rank, camera.zoom),
      reserved,
      padding: 6,
    },
  );
  const placedNames = new Set(placedLabels.map((l) => l.name));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* City dots — Swedish cities take the accent, foreign capitals stay muted. Coupled
          to the label: a dot draws only if its name survived collision, so there are no
          orphan dots (and the city the user is on yields to the brass marker + its label). */}
      {dots.map((d) => {
        if (!placedNames.has(d.name)) return null;
        return (
          <View
            key={`dot-${d.name}`}
            style={{
              position: 'absolute',
              left: d.x - d.r,
              top: d.y - d.r,
              width: d.r * 2,
              height: d.r * 2,
              borderRadius: d.r,
              backgroundColor: d.foreign ? c.inkMuted : c.accent,
              opacity: d.foreign ? 0.8 : 1,
              borderColor: rim,
              borderWidth: 1.5,
            }}
          />
        );
      })}

      {/* City labels — only the collision survivors, halo'd to read over any terrain. */}
      {placedLabels.map((l) => {
        const foreign = CITY_POINTS.find((p) => p.name === l.name)?.foreign;
        return (
          <Text
            key={`label-${l.name}`}
            numberOfLines={1}
            style={{
              position: 'absolute',
              // Centre on the dot via a generous fixed-width box so names like "Umeå"
              // aren't clipped to "Um…" (the old tight width truncated them) — and no
              // percentage transform, which the RN test renderer mishandles. The
              // collision estimate keeps using the tighter per-name width.
              left: l.x - LABEL_BOX / 2,
              top: l.top,
              width: LABEL_BOX,
              textAlign: 'center',
              fontSize: l.fontSize,
              color: foreign ? c.inkMuted : c.ink,
              textShadowColor: halo,
              textShadowRadius: 2,
              textShadowOffset: { width: 0, height: 0 },
            }}
          >
            {l.name}
          </Text>
        );
      })}

      {/* "You are here" — brass glow + dot, a touch larger than the biggest city dot. */}
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
      {/* The user's place name — ALWAYS shown (its box was reserved so no city label can
          cover it), lightly emphasised so "where you are" is unmistakable. */}
      {userName ? (
        <Text
          numberOfLines={1}
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
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 7,
    gap: 4,
    // Centre the pill on its computed point (RN supports % translate on 0.85/Fabric).
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    // Warm shadow from the design tokens — was a stale cool `#0b1220` predating the
    // warm-shadow switch, the one cold tint left over the warm palette.
    shadowColor: palette.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  pillNext: { borderWidth: 1.5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillLabel: { fontSize: 11, fontWeight: '500' },
});
