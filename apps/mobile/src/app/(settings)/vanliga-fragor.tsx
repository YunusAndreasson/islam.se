// Vanliga frågor (FAQ) — split out from Om so it gets a peer link in Inställningar
// and the user can jump straight here without scrolling past the masthead.
// The FAQ copy lives in `lib/about` so the Om page can (later) cross-reference it
// without duplication.
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMemo } from 'react';

import { FaqItem } from '../../components/about/FaqItem';
import { SettingSection } from '../../components/settings/SettingSection';
import { ModalBar } from '../../components/ui/ModalBar';
import { FAQ } from '../../lib/about';
import { space, type } from '../../theme/tokens';
import { type Palette } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';

export default function VanligaFragor() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="back" fallback="/installningar" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Vanliga frågor</Text>
        <SettingSection title="Frågor & svar">
          {FAQ.map((item, i) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} divider={i > 0} />
          ))}
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
