// Kontakt — split out from Om so a user looking for how to reach us or rate the
// app can jump straight here. Three native actions: rate (in-place store sheet),
// mail (native composer with mailto: fallback), and the project website.
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMemo } from 'react';

import { ContactRow } from '../../components/about/ContactRow';
import { SettingSection } from '../../components/settings/SettingSection';
import { ModalBar } from '../../components/ui/ModalBar';
import { emailSupport, openUrl, rateApp, SITE_URL, SUPPORT_EMAIL } from '../../lib/about';
import { space, type } from '../../theme/tokens';
import { type Palette } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

export default function Kontakt() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="back" fallback="/installningar" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Kontakt</Text>
        <SettingSection title="Hör av dig">
          <ContactRow
            icon="star-outline"
            label="Betygsätt appen"
            detail="Lämna ett omdöme"
            onPress={rateApp}
          />
          <ContactRow
            icon="mail-outline"
            label="Mejla oss"
            detail={SUPPORT_EMAIL}
            onPress={emailSupport}
            divider
          />
          <ContactRow
            icon="open-in-new"
            label="Läs mer på islam.se"
            detail="islam.se"
            onPress={() => openUrl(SITE_URL)}
            divider
          />
        </SettingSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },
    header: { ...type.title, color: c.ink, marginBottom: space.xl, marginTop: space.xs },
  });
}
