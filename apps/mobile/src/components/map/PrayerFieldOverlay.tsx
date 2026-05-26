// The on-map layers: a twilight wash (fill) + the sweeping prayer lines (a blurred
// glow under a crisp stroke) + a label pill on each active line. All driven by the
// cached SolarGrid and the current instant; everything else is native MapLibre.
// The user's NEXT prayer's line is drawn brighter/thicker and its pill accented, so
// the map answers "what's coming" at a glance — tied to the dock. Pills dim with the
// night factor so they read on the dark map.
import { GeoJSONSource, Layer, ViewAnnotation } from '@maplibre/maplibre-react-native';
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

export function PrayerFieldOverlay({ grid, now, settings, nextKey, night }: Props) {
  const cells = useMemo(() => buildCells(grid, now, 1), [grid, now]);
  const { lines, labels } = useMemo(() => buildLines(grid, now), [grid, now]);
  const timeLabel = formatTime(new Date(now), settings);
  const c = nightChrome(night);

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
        // A callout: the pill floats above the line with a short stem touching it,
        // so the sweeping line never cuts through the text. anchor="bottom" pins the
        // stem's foot to the line point; the pill sits clear above the line's glow.
        return (
          <ViewAnnotation key={l.prayer} lngLat={l.lngLat} anchor="bottom">
            <View style={styles.callout}>
              <View
                style={[
                  styles.pill,
                  { backgroundColor: c.surface, borderColor: isNext ? c.accent : c.hairline },
                  isNext && styles.pillNext,
                ]}
              >
                <View style={[styles.dot, { backgroundColor: hue }]} />
                <Text style={[styles.pillLabel, { color: c.ink }]}>{PRAYER_LABELS[l.prayer]}</Text>
                <Text style={[styles.pillTime, { color: c.inkMuted }]}>{timeLabel}</Text>
              </View>
              <View style={[styles.stem, { backgroundColor: hue }]} />
              <View style={[styles.foot, { backgroundColor: hue }]} />
            </View>
          </ViewAnnotation>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  callout: { alignItems: 'center' },
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
  // Connector from the pill down to the line, ending in a dot on the line itself,
  // so the label floats clear of the sweeping line but still clearly belongs to it.
  stem: { width: 2, height: 15, borderRadius: 1 },
  foot: { width: 6, height: 6, borderRadius: 3, marginTop: -1 },
});
