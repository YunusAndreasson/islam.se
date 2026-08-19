import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PRAYER_ORDER } from '@/lib/prayer-times';
import type { PrayerPreview, PrayerPreviewRow } from '@/lib/settings/usePrayerPreview';
import { mono, space, type } from '@/theme/tokens';
import { type SettingsColors, useSettingsColors } from './theme';

// The verifier, compact enough to stay on screen WHILE the settings it answers to are
// being changed. The introduction's method step proved the principle with a one-line
// "I dag i Malmö: Fajr 03:12 · Maghrib 21:47" (components/intro/StepMethod, which notes
// that with the line below the fold "tapping a method changed numbers that were
// off-screen, so the lists answered nothing"). Beräkning needs the same thing widened to
// every slot, because it also moves ʿAṣr (madhab), Fajr/ʿIshāʾ (höga breddgrader,
// shafaq, polcirkel) and any single time (manuella justeringar).
//
// Deliberately dumb: it takes the computed PrayerPreview rather than calling
// usePrayerPreview itself, so each caller keeps owning its clock — the settings hub ticks
// once a minute while focused, Beräkning captures one timestamp on mount. See
// lib/settings/usePrayerPreview for why that ownership belongs to the caller.
//
// Layout: the six obligatory slots in a 3×2 grid (a third of the width each, so the
// longest name — "Maghrib" — never truncates on a 320 pt screen), then the night's
// voluntary landmarks as full-width rows underneath. They are NOT mixed into the grid:
// their names run several times longer than any prayer's, and more importantly the
// reader must be able to see where the obligations stop (the same rule
// usePrayerPreview follows when it appends rather than merges them).
export function PreviewStrip({ preview }: { preview: PrayerPreview }) {
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isPrayer = (r: PrayerPreviewRow): boolean =>
    (PRAYER_ORDER as readonly string[]).includes(r.key);
  const prayers = preview.times.filter(isPrayer);
  const nights = preview.times.filter((r) => !isPrayer(r));

  // One spoken sentence rather than 12–16 announced fragments: the strip is a single
  // read-only summary, so grouping it is what a screen-reader user actually wants here.
  const spoken = [
    preview.gregorian,
    ...preview.times.map((p) => `${p.label} ${p.time}`),
  ].join(', ');

  return (
    <View style={styles.wrap} accessible accessibilityLabel={spoken}>
      <Text style={styles.caption} numberOfLines={1}>
        {preview.gregorian}
      </Text>
      <View style={styles.grid}>
        {prayers.map((p) => (
          <View key={p.key} style={styles.cell}>
            <Text style={[styles.label, p.muted && styles.mutedText]} numberOfLines={1}>
              {p.label}
            </Text>
            <Text
              testID={`preview-time-${p.key}`}
              style={[styles.time, p.muted && styles.mutedText]}
            >
              {p.time}
            </Text>
          </View>
        ))}
      </View>
      {nights.map((p) => (
        <View key={p.key} style={styles.nightRow}>
          <Text style={[styles.nightLabel, styles.mutedText]} numberOfLines={1}>
            {p.label}
          </Text>
          <Text testID={`preview-time-${p.key}`} style={[styles.nightTime, styles.mutedText]}>
            {p.time}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
    caption: { ...type.caption, color: colors.textMuted, marginBottom: space.sm },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    // A third of the width, so six slots read as two chronological rows of three
    // (left-to-right, top-to-bottom is already the order of the day).
    cell: { width: '33.333%', paddingBottom: space.sm },
    label: { ...type.micro, color: colors.textMuted },
    // Tabular figures: the whole point of the strip is that a time MOVES when an option
    // is tapped, and proportional digits would slide the neighbouring columns with it.
    time: { ...type.callout, ...mono, color: colors.text },
    // Shurūq is a marker, not a prayer — quieter, exactly as in the map's list.
    mutedText: { color: colors.textMuted },
    nightRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space.md,
      paddingTop: space.xs,
    },
    nightLabel: { ...type.caption, flexShrink: 1 },
    nightTime: { ...type.caption, ...mono },
  });
}
