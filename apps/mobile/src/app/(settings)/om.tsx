// Om — what the app is, who built it, what it doesn't do. Split focus: FAQ
// lives in (settings)/vanliga-fragor.tsx and the contact actions live in
// (settings)/kontakt.tsx, each linked as its own peer from Inställningar so a
// reader can jump straight to what they want. This page is the editorial
// "what is this" — a clean masthead, a one-line overview, the privacy promise,
// open-source credits, and the version. Honest about the sources: islam.se
// computes nothing of its own, it uses the established `adhan` methods and an
// arithmetic Hijri calendar, and points to official institutions for the start
// of ramadan and the great feasts (covered in the FAQ).
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ModalBar } from '../../components/ui/ModalBar';
import { ADHAN_URL, APP_VERSION, MAPLIBRE_URL, openUrl, OSM_URL } from '../../lib/about';
import { space, type } from '../../theme/tokens';
import { type Palette } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

export default function Om() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Pushed in from Settings — a back arrow returns to the Settings sheet. */}
      <ModalBar variant="back" fallback="/installningar" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.masthead}>
          <Text style={styles.brand}>islam.se</Text>
          <Text style={styles.tagline}>Bönetider för hela Sverige, ritade som en levande karta.</Text>
        </View>

        <Text style={styles.lead}>
          Ljuset och bönernas stunder sveper över Sverige i takt med dygnet. Dra i tidslinjen för
          att följa dem timme för timme, vänd dig mot qibla och låt appen påminna dig när det är
          dags för bön.
        </Text>

        <Text style={styles.privacy}>Inga konton, ingen spårning. Din plats lämnar aldrig enheten.</Text>
        <Text style={styles.credits}>
          Öppen källkod:{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openUrl(ADHAN_URL)}>
            adhan
          </Text>{' '}
          beräknar bönetiderna,{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openUrl(MAPLIBRE_URL)}>
            MapLibre
          </Text>{' '}
          ritar kartan, och kartdatan kommer från OpenFreeMap, OpenMapTiles och{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => openUrl(OSM_URL)}>
            OpenStreetMap
          </Text>
          -bidragsgivare.
        </Text>
        <Text style={styles.version}>Version {APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    content: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxxl + space.lg },

    // Editorial masthead — wordmark on the paper, no card, left-aligned.
    masthead: { paddingTop: space.lg, paddingBottom: space.lg },
    brand: { ...type.display, color: c.ink },
    tagline: { ...type.body, color: c.inkMuted, marginTop: space.sm },

    lead: { ...type.body, color: c.inkMuted, marginBottom: space.xl },

    privacy: { ...type.caption, color: c.inkMuted, textAlign: 'center', marginTop: space.xl },
    credits: {
      ...type.caption,
      color: c.inkFaint,
      textAlign: 'center',
      lineHeight: 18,
      marginTop: space.lg,
      paddingHorizontal: space.sm,
    },
    // Linked project names pop out of the faint credits so each reads as a real,
    // tappable project rather than a stray word.
    link: { color: c.accent, textDecorationLine: 'underline' },
    version: { ...type.caption, color: c.inkFaint, textAlign: 'center', marginTop: space.lg },
  });
}
