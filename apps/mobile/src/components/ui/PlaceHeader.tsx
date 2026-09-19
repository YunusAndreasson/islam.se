// The two instrument sheets open the same way: a title, and under it the place every number
// below is computed for — or, when there is no place of the reader's own, the offer to pick
// one instead of a confident reading for a city they may be nowhere near.
//
// That refusal is the part worth sharing. A resolved place carries its own qualifier
// ("Stockholm (standard)") when it is the fallback rather than a real fix, and a screen that
// quietly stripped the qualifier would print a precise bearing, or a moonrise, under a city
// name it has no right to. The dock already refuses to tell that lie (PrayerDock's "Välj
// plats"); this is the same refusal, in the same words, with the same route out.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { useLocation } from '@/lib/location/context';
import { type Palette, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

interface Props {
  title: string;
  /** What the fallback would be lying about, in the reader's terms — "riktningen",
   *  "tiderna". Reaches the screen reader as "…gäller standardplatsen"; nothing else in the
   *  sentence changes between screens, so nothing else is a prop. */
  what: string;
}

export function PlaceHeader({ title, what }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { label, source } = useLocation();
  const isFallback = source === 'default';
  const placeLabel = label.replace(/\s*\([^)]*\)\s*$/, '');

  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {isFallback ? (
        <Pressable
          // Navigation to byt-plats — no haptic (lib/haptics policy).
          onPress={() => router.push('/(settings)/byt-plats')}
          // 12 rather than 10 top/bottom: with the ~20 dp row that is exactly the 44 dp
          // target the sibling settings link reserves with minHeight — bought here through
          // hit area instead, so the header doesn't grow a gap in the state where this
          // control is absent.
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          style={({ pressed }) => [styles.placePick, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`Ingen plats vald – ${what} gäller standardplatsen. Tryck för att välja stad`}
        >
          <Icon name="place" size={14} color={c.accent} />
          <Text style={styles.placePickText} numberOfLines={1}>
            Välj plats
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.subtitle} numberOfLines={1}>
          {placeLabel}
        </Text>
      )}
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    header: { paddingHorizontal: space.lg, paddingTop: space.xs },
    title: { ...type.title, color: c.ink },
    subtitle: { ...type.callout, color: c.inkMuted, marginTop: 2 },
    placePick: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    placePickText: { ...type.callout, color: c.accent, fontWeight: '600', flexShrink: 1 },
    pressed: { opacity: 0.6 },
  });
}
