// The explainer the (i) button opens. Recognition over recall (Nielsen #6) + a
// clear conceptual model (Norman): names the colours, says what the wash and the
// lines mean, and reassures that the times come from the user's own settings.
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRAYER_LABELS, PRAYER_ORDER } from '../../lib/prayer-times';
import { PRAYER_COLORS } from '../../lib/solar/palette';
import { mapTheme } from './theme';

export function Legend({ onClose }: { onClose: () => void }) {
  return (
    <Pressable style={styles.scrim} onPress={onClose}>
      {/* Stop taps inside the card from dismissing it. */}
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={styles.header}>
          <Text style={styles.title}>Bönelinjer över Sverige</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Stäng">
            <MaterialIcons name="close" size={22} color={mapTheme.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.body}>
          Kartan visar himlen just nu. Det mörka draget är natten, de varma tonerna är
          skymning och gryning. Varje linje är platsen där en bön inträffar exakt nu — den
          sveper över landet allteftersom tiden går.
        </Text>

        <View style={styles.legendGrid}>
          {PRAYER_ORDER.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: PRAYER_COLORS[k] }]} />
              <Text style={styles.legendLabel}>{PRAYER_LABELS[k]}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          Tiderna beräknas med dina inställningar (metod, madhab och höglatitudsregel) för varje
          punkt på kartan.
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,18,32,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: mapTheme.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: mapTheme.text },
  body: { fontSize: 14, lineHeight: 21, color: mapTheme.textMuted, marginTop: 10 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7, width: '50%' },
  swatch: { width: 14, height: 4, borderRadius: 2 },
  legendLabel: { fontSize: 14, color: mapTheme.text },
  footnote: { fontSize: 12, lineHeight: 17, color: mapTheme.textMuted, marginTop: 16 },
});
