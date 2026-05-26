// The on-map layers: a twilight wash (fill) + the sweeping prayer lines (a blurred
// glow under a crisp stroke) + a label pill on each active line. All driven by the
// cached SolarGrid and the current instant; everything else is native MapLibre.
// The user's NEXT prayer's line is drawn brighter/thicker and its pill accented, so
// the map answers "what's coming" at a glance — tied to the dock. Pills dim with the
// night factor so they read on the dark map.
//
// Label placement: the pills are `Marker`s — on Android a real native View placed on
// the map projection, so they render ABOVE every GL layer (the prayer lines AND the
// city dots/labels), none of which can paint over the text. (A ViewAnnotation, by
// contrast, is drawn to a bitmap *inside* the layer stack and gets overdrawn.) On top
// of that we push each pill a fixed distance *perpendicular* to its line's local
// direction (see `perpOffset`) so it sits tidily beside the line — sideways for a
// near-vertical line, upward for a horizontal one — rather than covering it.
import { GeoJSONSource, Layer, Marker } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatTime, PRAYER_LABELS, PRAYER_ORDER, type PrayerKey } from '../../lib/prayer-times';
import type { PrayerSettings } from '../../lib/settings/types';
import { buildCells, buildLines, type SolarGrid } from '../../lib/solar/field';
import { PRAYER_COLORS } from '../../lib/solar/palette';
import { nightChrome } from './nightChrome';

// Data-driven line colour: pick the prayer's hue from its `prayer` property.
const LINE_COLOR: (string | string[])[] = [
  'match',
  ['get', 'prayer'],
  ...PRAYER_ORDER.flatMap((k) => [k, PRAYER_COLORS[k]]),
  '#888888',
];

interface Props {
  grid: SolarGrid;
  now: number;
  settings: PrayerSettings;
  /** The user's next prayer — its line/pill are emphasised. Null if it's tomorrow's. */
  nextKey: PrayerKey | null;
  /** 0 day → 1 night; dims the label pills so they read on the dark map. */
  night: number;
}

// Emphasise the next prayer's line: thicker + more opaque where prayer === nextKey.
function emphasis(nextKey: PrayerKey | null, base: number, hi: number): number | unknown {
  if (!nextKey) return base;
  return ['case', ['==', ['get', 'prayer'], nextKey], hi, base];
}

// How far (px) to push a pill off its line. Must exceed the line glow's reach
// (≈17px for the emphasised line) plus the pill's half-height so the text never
// touches the line.
const LABEL_OFFSET_PX = 44;

/**
 * The pixel offset that moves a pill clear of its line, perpendicular to the line's
 * local direction. We map the line tangent from [lon, lat] into screen space (the
 * map is north-up: +lon → right, +lat → up, lon compressed by cos(lat)), rotate it
 * 90° to get the perpendicular, then bias toward placing the pill *above* the line
 * — and for a near-vertical line (whose perpendicular is horizontal) toward a
 * consistent side. Offset convention matches MapLibre: negative x = left, y = up.
 */
function perpOffset(lngLat: [number, number], tangent: [number, number]): [number, number] {
  const latRad = (lngLat[1] * Math.PI) / 180;
  let sx = tangent[0] * Math.cos(latRad);
  let sy = -tangent[1];
  const sl = Math.hypot(sx, sy) || 1;
  sx /= sl;
  sy /= sl;
  // Rotate the screen-space tangent 90° → unit perpendicular.
  let px = -sy;
  let py = sx;
  if (py > 0) {
    // Point it upward (negative screen-y) so pills prefer to sit above the line.
    px = -px;
    py = -py;
  }
  if (Math.abs(py) < 0.25 && px > 0) {
    // Near-vertical line → horizontal perpendicular; keep all such pills to the left.
    px = -px;
    py = -py;
  }
  return [px * LABEL_OFFSET_PX, py * LABEL_OFFSET_PX];
}

export function PrayerFieldOverlay({ grid, now, settings, nextKey, night }: Props) {
  const cells = useMemo(() => buildCells(grid, now, 1), [grid, now]);
  const { lines, labels } = useMemo(() => buildLines(grid, now), [grid, now]);
  const timeLabel = formatTime(new Date(now), settings);
  const c = nightChrome(night);

  return (
    <>
      {/* The wash FeatureCollection is rebuilt + re-tiled on every scrubbed instant.
          buffer 0 drops MapLibre's default 128-unit tile edge-buffer on each of those
          re-tilings (docs: larger buffer = slower); it stays seam-free because the fill
          is `fill-antialias: false`, so adjacent tiles meet exactly at the boundary with
          no AA gap — verified on device, day and deep-night full-coverage wash. */}
      <GeoJSONSource id="solar-wash" data={cells} buffer={0}>
        {/* fill-antialias off → adjacent translucent cells blend into a seamless wash */}
        <Layer
          id="solar-wash-fill"
          type="fill"
          paint={{ 'fill-color': ['get', 'color'], 'fill-antialias': false }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="solar-lines" data={lines}>
        <Layer
          id="solar-line-glow"
          type="line"
          // biome-ignore lint/suspicious/noExplicitAny: MapLibre paint expression typing
          paint={{
            'line-color': LINE_COLOR as any,
            'line-width': emphasis(nextKey, 11, 17) as any,
            'line-blur': 9,
            'line-opacity': emphasis(nextKey, 0.4, 0.6) as any,
          }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
        <Layer
          id="solar-line-core"
          type="line"
          // biome-ignore lint/suspicious/noExplicitAny: MapLibre paint expression typing
          paint={{
            'line-color': LINE_COLOR as any,
            'line-width': emphasis(nextKey, 2, 3.4) as any,
            'line-opacity': emphasis(nextKey, 0.95, 1) as any,
          }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
      </GeoJSONSource>

      {labels.map((l) => {
        const isNext = l.prayer === nextKey;
        const hue = PRAYER_COLORS[l.prayer];
        // Marker (not ViewAnnotation): on Android it's a real native View placed on
        // the map projection, so it sits ABOVE every GL layer — the city dots/labels
        // and the prayer lines no longer paint over the pill. The perpendicular
        // offset still keeps the pill tidily beside its line rather than on top of it.
        return (
          <Marker
            key={l.prayer}
            lngLat={l.lngLat}
            anchor="center"
            offset={perpOffset(l.lngLat, l.tangent)}
          >
            <View
              style={[
                styles.pill,
                {
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
          </Marker>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    gap: 5,
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
