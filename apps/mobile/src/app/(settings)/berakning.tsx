// Beräkning — the technical knobs for prayer-time math (method, madhab, high
// latitudes, polar circle, shafaq, per-prayer minute offsets). Lifted out of the
// Inställningar disclosure group into its own pushed screen so it mirrors the
// Byt plats pattern: one chevron row on Inställningar, one focused screen
// behind it. Less in-place expansion, more room here for the rule-of-thumb
// captions each option carries.
//
// "Manuella justeringar" sits last because it's the most local of the calculation
// rattar: the global presets above pick the math, the per-prayer offsets at the
// bottom nudge each result to match the user's mosque. Conceptually they belong
// with adhan's CalculationParameters.adjustments — same place adhan keeps them.
//
// All settings update through useSettings() — same wiring as before — so
// changing the method here recomputes everything that depends on it (the dock
// countdown, the wash, the notifications schedule) without leaving the screen.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { useSettingsColors, type SettingsColors } from '@/components/settings/theme';
import { ModalBar } from '@/components/ui/ModalBar';
import { PRAYER_LABELS, PRAYER_ORDER } from '@/lib/prayer-times';
import { useSettings } from '@/lib/settings/context';
import {
  HIGHLAT_OPTIONS,
  MADHAB_OPTIONS,
  METHOD_OPTIONS,
  POLAR_OPTIONS,
  SHAFAQ_OPTIONS,
  signedMinutes,
} from '@/lib/settings/options';
import { space, type } from '@/theme/tokens';

const ZERO_ADJUSTMENTS = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 } as const;

export default function Berakning() {
  const { settings, update } = useSettings();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // "Återställ alla" only appears when something is actually set — keeps the panel
  // quiet on first visit, surfaces an escape hatch once the user has fiddled.
  const hasAdjustments = PRAYER_ORDER.some((k) => settings.adjustments[k] !== 0);

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
          <SettingSection title="Shafaq" footnote="Gäller endast Moonsighting Committee.">
            <OptionGroup
              options={SHAFAQ_OPTIONS}
              value={settings.shafaq}
              onChange={(shafaq) => update({ shafaq })}
            />
          </SettingSection>
        ) : null}

        <SettingSection
          title="Manuella justeringar"
          footnote="Förskjut varje tid i minuter för att matcha din lokala moské."
        >
          {PRAYER_ORDER.map((key, i) => (
            <Stepper
              key={key}
              label={PRAYER_LABELS[key]}
              value={settings.adjustments[key]}
              divider={i > 0}
              min={-60}
              max={60}
              format={signedMinutes}
              onChange={(v) => update({ adjustments: { ...settings.adjustments, [key]: v } })}
            />
          ))}
          {hasAdjustments ? (
            <Pressable
              onPress={() => update({ adjustments: { ...ZERO_ADJUSTMENTS } })}
              accessibilityRole="button"
              accessibilityLabel="Återställ alla justeringar"
              style={({ pressed }) => [styles.resetRow, pressed && styles.resetPressed]}
            >
              <Text style={styles.resetText}>Återställ alla</Text>
            </Pressable>
          ) : null}
        </SettingSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },
    header: { ...type.title, color: colors.text, marginBottom: space.xl, marginTop: space.xs },
    // Foot-of-section "Återställ alla" — accent verb on the card's separator
    // hairline, centered so it reads as a row affordance, not a left-anchored
    // setting label.
    resetRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
    },
    resetPressed: { backgroundColor: colors.accentSoft },
    resetText: { ...type.body, color: colors.accent },
  });
}
