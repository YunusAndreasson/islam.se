// Beräkning — the technical knobs for prayer-time math (method, madhab, high
// latitudes, polar circle, shafaq). Lifted out of the Inställningar disclosure
// group into its own pushed screen so it mirrors the Byt plats pattern: one
// chevron row on Inställningar, one focused screen behind it. Less in-place
// expansion, more room here for the rule-of-thumb captions each option carries.
//
// All settings update through useSettings() — same wiring as before — so
// changing the method here recomputes everything that depends on it (the dock
// countdown, the wash, the notifications schedule) without leaving the screen.
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { useSettingsColors, type SettingsColors } from '@/components/settings/theme';
import { ModalBar } from '@/components/ui/ModalBar';
import { useSettings } from '@/lib/settings/context';
import {
  HIGHLAT_OPTIONS,
  MADHAB_OPTIONS,
  METHOD_OPTIONS,
  POLAR_OPTIONS,
  SHAFAQ_OPTIONS,
} from '@/lib/settings/options';
import { space, type } from '@/theme/tokens';

export default function Berakning() {
  const { settings, update } = useSettings();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="back" fallback="/installningar" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Beräkning</Text>

        <SettingSection
          title="Beräkningsmetod"
          footnote="Muslim World League är standard i Sverige. Diyanet är vanlig i den svensk-turkiska församlingen."
        >
          <OptionGroup
            options={METHOD_OPTIONS}
            value={settings.calculationMethod}
            onChange={(calculationMethod) => update({ calculationMethod })}
          />
        </SettingSection>

        <SettingSection
          title="Asr-metod (madhhab)"
          footnote="Hanafi ger en senare Asr (skuggans dubbla längd). Alla andra rättsskolor ger samma, tidigare tid."
        >
          <OptionGroup
            options={MADHAB_OPTIONS}
            value={settings.madhab}
            onChange={(madhab) => update({ madhab })}
          />
        </SettingSection>

        <SettingSection
          title="Höga breddgrader"
          footnote="Hur Fajr och Isha beräknas när solen inte sjunker tillräckligt långt under horisonten – viktigt i Sverige."
        >
          <OptionGroup
            options={HIGHLAT_OPTIONS}
            value={settings.highLatitudeRule}
            onChange={(highLatitudeRule) => update({ highLatitudeRule })}
          />
        </SettingSection>

        <SettingSection
          title="Polcirkeln"
          footnote="Vad som visas norr om polcirkeln (t.ex. Kiruna) under midnattssol, då Fajr/Isha annars saknar lösning."
        >
          <OptionGroup
            options={POLAR_OPTIONS}
            value={settings.polarCircleResolution}
            onChange={(polarCircleResolution) => update({ polarCircleResolution })}
          />
        </SettingSection>

        {settings.calculationMethod === 'MoonsightingCommittee' ? (
          <SettingSection title="Shafaq" footnote="Endast för Moonsighting Committee.">
            <OptionGroup
              options={SHAFAQ_OPTIONS}
              value={settings.shafaq}
              onChange={(shafaq) => update({ shafaq })}
            />
          </SettingSection>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },
    header: { ...type.title, color: colors.text, marginBottom: space.xl, marginTop: space.xs },
  });
}
