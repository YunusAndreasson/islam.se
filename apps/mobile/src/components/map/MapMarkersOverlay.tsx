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
import { StyleSheet, Text, View } from 'react-native';

import { CITY_POINTS } from '../../lib/map/cities';
import { placeCityLabels } from '../../lib/map/cityLabels';
import { type Camera, project } from '../../lib/map/projection';
import {
  formatTime,
  type LatLng,
  PRAYER_LABELS,
  type PrayerKey,
} from '../../lib/prayer-times';
import type { PrayerLineLabel } from '../../lib/solar/field';
import { PRAYER_COLORS } from '../../lib/solar/palette';
import { nightChrome } from './nightChrome';

interface Props {
  /** React-state camera (settled after each region change) shared with the Skia canvas. */
  camera: Camera;
  userCoords: LatLng;
  /** Pill anchors from buildLines: where each active prayer line wants its label. */
  labels: PrayerLineLabel[];
  /** Displayed instant (ms) — the pill shows this time. */
  now: number;
  nextKey: PrayerKey | null;
  /** 0 day → 1 night; dims dots/labels/pills so they read on the dark map. */
  night: number;
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

// How far (px) to push a pill off its line — must clear the emphasised glow (≈17) plus
// the pill's half-height. Same intent as the old perpOffset's LABEL_OFFSET_PX.
const LABEL_OFFSET_PX = 44;

// Fixed centred box for a city label — wider than any name ("Helsingfors" ≈ 100 px at
// the largest size) so it never clips, and centred on the dot without a % transform.
const LABEL_BOX = 140;

/** Screen-space perpendicular offset for a pill, biased to sit above/aside its line. */
function perpOffset(
  lon: number,
  lat: number,
  tangent: [number, number],
  cam: Camera,
): { x: number; y: number } {
  // Direction of the line in SCREEN space: project a step along the tangent and diff.
  const a = project(lon, lat, cam);
  const b = project(lon + tangent[0] * 0.05, lat + tangent[1] * 0.05, cam);
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  // Rotate 90° → perpendicular.
  let px = -dy;
  let py = dx;
  if (py > 0) {
    // Prefer above the line (negative screen-y).
    px = -px;
    py = -py;
  }
  if (Math.abs(py) < 0.25 && px > 0) {
    // Near-vertical line → keep its pill to one consistent side.
    px = -px;
    py = -py;
  }
  return { x: a.x + px * LABEL_OFFSET_PX, y: a.y + py * LABEL_OFFSET_PX };
}

export function MapMarkersOverlay({ camera, userCoords, labels, now, nextKey, night }: Props) {
  const c = nightChrome(night);
  const rim = night > 0.5 ? 'rgba(237,240,245,0.9)' : '#ffffff';
  const timeLabel = formatTime(new Date(now));

  // Project city dots, then decide which labels clear collision (rank-sorted).
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
    },
  );

  const user = project(userCoords.longitude, userCoords.latitude, camera);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* City dots — Swedish cities take the accent, foreign capitals stay muted. */}
      {dots.map((d) => (
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
      ))}

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
              textShadowColor: c.halo,
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

      {/* Prayer pills — pushed perpendicular off their line, time shown at the instant. */}
      {labels.map((l) => {
        const isNext = l.prayer === nextKey;
        const hue = PRAYER_COLORS[l.prayer];
        const pos = perpOffset(l.lngLat[0], l.lngLat[1], l.tangent, camera);
        return (
          <View
            key={`pill-${l.prayer}`}
            style={[
              styles.pill,
              {
                left: pos.x,
                top: pos.y,
                backgroundColor: c.pillSurface,
                borderColor: isNext ? c.pillNextBorder : c.pillBorder,
              },
              isNext && styles.pillNext,
            ]}
          >
            <View style={[styles.dot, { backgroundColor: hue }]} />
            <Text style={[styles.pillLabel, { color: c.ink }]}>{PRAYER_LABELS[l.prayer]}</Text>
            <Text style={[styles.pillTime, { color: c.inkMuted }]}>{timeLabel}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    gap: 5,
    // Centre the pill on its computed point (RN supports % translate on 0.85/Fabric).
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
    shadowColor: '#0b1220',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pillNext: { borderWidth: 1.5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  pillTime: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
