// Om — what the app is and where its numbers come from. Was a bare placeholder;
// now an on-brand page in the same Nordic language as the rest of the app: a quiet
// lead, three plainly-titled cards explaining the map / the calculation / the
// qibla, the data sources (honest attribution), and a link back to islam.se.
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { type ReactNode, useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type Palette, radius, shadow, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

const SITE_URL = 'https://islam.se';
const version = Constants.expoConfig?.version ?? '1.0.0';

type OmStyles = ReturnType<typeof makeStyles>;

function Card({
  icon,
  title,
  children,
  styles,
  accent,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  children: ReactNode;
  styles: OmStyles;
  accent: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <MaterialIcons name={icon} size={18} color={accent} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

export default function Om() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>islam.se</Text>
        <Text style={styles.lead}>
          Bönetider för Sverige, ritade som en levande karta. Ljuset och bönernas stunder
          sveper över landet i takt med dygnet – dra i tidslinjen för att följa dem.
        </Text>

        <Card icon="map" title="Kartan" styles={styles} accent={c.accent}>
          Skymningstoningen och bönelinjerna kommer rakt ur uträkningen för varje plats i
          landet. Linjen för en bön visar var i Sverige den infaller just nu och sveper
          västerut under dagen. Dra i tidslinjen för att följa dem genom hela dygnet.
        </Card>

        <Card icon="schedule" title="Beräkningen" styles={styles} accent={c.accent}>
          Tiderna räknas ut med biblioteket adhan. Du väljer beräkningsmetod, madhhab och
          mer under Inställningar. Höga breddgrader och polcirkeln – där solen aldrig
          sjunker tillräckligt – hanteras särskilt, så tiderna stämmer från Malmö till
          Kiruna.
        </Card>

        <Card icon="explore" title="Qibla" styles={styles} accent={c.accent}>
          Qibla-vyn pekar mot Kaba i Mecka från din plats och visar fågelvägen dit. Vrid
          enheten tills nålen pekar rakt upp.
        </Card>

        <Card icon="layers" title="Källor" styles={styles} accent={c.accent}>
          Bönetider: adhan. Kartan renderas med MapLibre, med kartdata © OpenFreeMap,
          OpenMapTiles och OpenStreetMaps bidragsgivare. Hijri-datumet följer den
          aritmetiska kalendern och kan justeras för lokal månsiktning.
        </Card>

        <Pressable
          onPress={() => void Linking.openURL(SITE_URL)}
          style={({ pressed }) => [styles.linkRow, pressed && styles.linkPressed]}
          accessibilityRole="link"
          accessibilityLabel="Öppna islam.se"
        >
          <MaterialIcons name="open-in-new" size={18} color={c.accent} />
          <Text style={styles.linkText}>Läs mer på islam.se</Text>
        </Pressable>

        <Text style={styles.version}>Version {version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },

    brand: { ...type.title, color: c.ink, marginTop: space.xs },
    lead: { ...type.body, color: c.inkMuted, marginTop: space.sm, marginBottom: space.xl },

    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: space.lg,
      marginBottom: space.md,
      ...shadow.button,
      shadowOpacity: 0.06,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
    cardIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      backgroundColor: c.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { ...type.headline, fontSize: 17, color: c.ink },
    body: { ...type.callout, color: c.inkMuted, lineHeight: 21 },

    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      paddingVertical: space.md,
      marginTop: space.sm,
      borderRadius: radius.md,
      backgroundColor: c.accentSoft,
    },
    linkPressed: { opacity: 0.6 },
    linkText: { ...type.bodyStrong, color: c.accent },

    version: { ...type.caption, color: c.inkFaint, textAlign: 'center', marginTop: space.xl },
  });
}
