// The six line colours, named — a quiet reference strip, not a lesson. One row, no card:
// the teaching happens in MapLessonCard's three examples, so this is only the key, for
// whoever wants to look a colour up while reading a caption. Full Swedish names still
// live here for a screen reader, they are just not printed — the map's own pills carry
// them for sighted users.
//
// The two-table rule from lib/solar/palette is load-bearing here: prayerColorFor() is for
// GRAPHICS (the dash), prayerTextColorFor() is for TEXT (the label). They are not the same
// value, and using the line colour as text would leave five of six labels below the
// contrast floor in light mode.
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PRAYER_LABELS, PRAYER_ORDER, PRAYER_SWEDISH_NAMES } from '@/lib/prayer-times';
import { prayerColorFor, prayerTextColorFor } from '@/lib/solar/palette';
import { type Palette, radius, space, type } from '@/theme/tokens';
import { useActiveScheme, useColors } from '@/theme/useColors';

export function PrayerLegend() {
  const c = useColors();
  const scheme = useActiveScheme();
  const styles = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={styles.wrap}>
      {PRAYER_ORDER.map((key) => (
        <View
          key={key}
          style={styles.item}
          accessible
          accessibilityLabel={`${PRAYER_LABELS[key]}, ${PRAYER_SWEDISH_NAMES[key]}`}
        >
          <View style={[styles.dash, { backgroundColor: prayerColorFor(key, scheme) }]} />
          <Text style={[styles.label, { color: prayerTextColorFor(key, scheme) }]}>
            {PRAYER_LABELS[key]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      columnGap: space.lg,
      rowGap: space.sm,
    },
    item: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    // A short bar rather than a dot: it is a LINE on the map, and the swatch should say
    // so.
    dash: { width: 14, height: 3, borderRadius: radius.round },
    label: { ...type.caption },
  });
}
