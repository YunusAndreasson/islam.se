// The on-map layers: a twilight wash (fill) + the sweeping prayer lines (a blurred
// glow under a crisp stroke) + a label pill on each active line. All driven by the
// cached SolarGrid and the current instant; everything else is native MapLibre.
import { GeoJSONSource, Layer, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatTime, PRAYER_LABELS, PRAYER_ORDER } from '../../lib/prayer-times';
import type { PrayerSettings } from '../../lib/settings/types';
import { buildCells, buildLines, type SolarGrid } from '../../lib/solar/field';
import { PRAYER_COLORS } from '../../lib/solar/palette';
import { mapTheme } from './theme';

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
  /** While the day is playing we coarsen the wash (motion hides it) to keep the
   * native bridge light; paused/live shows the full-resolution gradient. */
  playing: boolean;
}

export function PrayerFieldOverlay({ grid, now, settings, playing }: Props) {
  const cells = useMemo(() => buildCells(grid, now, playing ? 2 : 1), [grid, now, playing]);
  const { lines, labels } = useMemo(() => buildLines(grid, now), [grid, now]);
  const timeLabel = formatTime(new Date(now), settings);

  return (
    <>
      <GeoJSONSource id="solar-wash" data={cells}>
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
            'line-width': 11,
            'line-blur': 9,
            'line-opacity': 0.4,
          }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
        <Layer
          id="solar-line-core"
          type="line"
          // biome-ignore lint/suspicious/noExplicitAny: MapLibre paint expression typing
          paint={{ 'line-color': LINE_COLOR as any, 'line-width': 2, 'line-opacity': 0.95 }}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        />
      </GeoJSONSource>

      {labels.map((l) => (
        <ViewAnnotation key={l.prayer} lngLat={l.lngLat} anchor="bottom">
          <View style={styles.pill}>
            <View style={[styles.dot, { backgroundColor: PRAYER_COLORS[l.prayer] }]} />
            <Text style={styles.pillLabel}>{PRAYER_LABELS[l.prayer]}</Text>
            <Text style={styles.pillTime}>{timeLabel}</Text>
          </View>
        </ViewAnnotation>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: mapTheme.cardBg,
    borderColor: mapTheme.cardBorder,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
    gap: 5,
    shadowColor: mapTheme.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillLabel: { fontSize: 12, fontWeight: '600', color: mapTheme.text },
  pillTime: { fontSize: 12, color: mapTheme.textMuted, fontVariant: ['tabular-nums'] },
});
