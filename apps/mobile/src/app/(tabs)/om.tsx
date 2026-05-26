// Om — what the app is and where its numbers come from. Was a bare placeholder;
// now an on-brand page in the same Nordic language as the rest of the app: a quiet
// lead, three plainly-titled cards explaining the map / the calculation / the
// qibla, the data sources (honest attribution), and a link back to islam.se.
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, radius, shadow, space, type } from '../../theme/tokens';

const SITE_URL = 'https://islam.se';
const version = Constants.expoConfig?.version ?? '1.0.0';

function Card({
  icon,
  title,
  children,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <MaterialIcons name={icon} size={18} color={palette.accent} />
        </View>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

export default function Om() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>islam.se</Text>
        <Text style={styles.lead}>
          Bönetider för Sverige, ritade som en levande karta. Ljuset och bönernas stunder
          sveper över landet i takt med dygnet – dra i tidslinjen för att följa dem.
        </Text>

        <Card icon="map" title="Kartan">
          Skymningstoningen och bönelinjerna kommer rakt ur uträkningen för varje plats i
          landet. Linjen för en bön visar var i Sverige den infaller just nu och sveper
          västerut under dagen. Dra i tidslinjen för att följa dem genom hela dygnet.
        </Card>

        <Card icon="schedule" title="Beräkningen">
          Tiderna räknas ut med biblioteket adhan. Du väljer beräkningsmetod, madhhab och
          mer under Inställningar. Höga breddgrader och polcirkeln – där solen aldrig
          sjunker tillräckligt – hanteras särskilt, så tiderna stämmer från Malmö till
          Kiruna.
        </Card>

        <Card icon="explore" title="Qibla">
          Qibla-vyn pekar mot Kaba i Mecka från din plats och visar fågelvägen dit. Vrid
          enheten tills nålen pekar rakt upp.
        </Card>

        <Card icon="layers" title="Källor">
          Bönetider: adhan. Kartdata: © OpenFreeMap, OpenMapTiles och OpenStreetMaps
          bidragsgivare. Hijri-datumet följer den aritmetiska kalendern och kan justeras
          för lokal månsiktning.
        </Card>

        <Pressable
          onPress={() => void Linking.openURL(SITE_URL)}
          style={({ pressed }) => [styles.linkRow, pressed && styles.linkPressed]}
          accessibilityRole="link"
          accessibilityLabel="Öppna islam.se"
        >
          <MaterialIcons name="open-in-new" size={18} color={palette.accent} />
          <Text style={styles.linkText}>Läs mer på islam.se</Text>
        </Pressable>

        <Text style={styles.version}>Version {version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.paper },
  content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },

  brand: { ...type.title, color: palette.ink, marginTop: space.xs },
  lead: { ...type.body, color: palette.inkMuted, marginTop: space.sm, marginBottom: space.xl },

  card: {
    backgroundColor: palette.surface,
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
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { ...type.headline, fontSize: 17, color: palette.ink },
  body: { ...type.callout, color: palette.inkMuted, lineHeight: 21 },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    marginTop: space.sm,
    borderRadius: radius.md,
    backgroundColor: palette.accentSoft,
  },
  linkPressed: { opacity: 0.6 },
  linkText: { ...type.bodyStrong, color: palette.accent },

  version: { ...type.caption, color: palette.inkFaint, textAlign: 'center', marginTop: space.xl },
});
