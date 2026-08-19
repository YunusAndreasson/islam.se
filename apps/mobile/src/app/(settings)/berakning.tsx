// Beräkning — the technical knobs for prayer-time math (method, madhab, high
// latitudes, polar circle, shafaq, avrundning, per-prayer minute offsets). Lifted out of
// the Inställningar disclosure group into its own pushed screen so it mirrors the
// Byt plats pattern: one chevron row on Inställningar, one focused screen
// behind it. Less in-place expansion, more room here for the rule-of-thumb
// captions each option carries.
//
// A PINNED PreviewStrip sits above the scroll, and it is the point of the screen.
// Every control below moves a number in it: the method and the high-latitude rule move
// Fajr and ʿIshāʾ, the madhab moves ʿAṣr, shafaq moves ʿIshāʾ, and the steppers at the
// bottom move whichever time they name. Without it this screen answered nothing — a tap
// slid a checkmark and that was the entire feedback. The introduction had already
// learned this (components/intro/StepMethod: "a setting you can watch land is a setting
// you can judge") and the lesson simply never crossed over. It sits OUTSIDE the
// ScrollView so it stays on screen while the user scrolls down to the offsets — the one
// place the numbers move one at a time.
//
// "Avrundning" lives here rather than under Utseende: it is an adhan
// CalculationParameter like every other control on this screen, and it changes the time
// a reader breaks their fast by. "Manuella justeringar" sits last because it's the most
// local of the calculation rattar: the global presets above pick the math, the
// per-prayer offsets at the bottom nudge each result to match the user's mosque.
//
// All settings update through useSettings() — same wiring as before — so
// changing the method here recomputes everything that depends on it (the dock
// countdown, the wash, the notifications schedule) without leaving the screen.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionGroup } from '@/components/settings/OptionGroup';
import { PreviewStrip } from '@/components/settings/PreviewStrip';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { useSettingsColors, type SettingsColors } from '@/components/settings/theme';
import { ModalBar } from '@/components/ui/ModalBar';
import { hapticLight } from '@/lib/haptics';
import { useLocation } from '@/lib/location/context';
import { PRAYER_LABELS, PRAYER_ORDER } from '@/lib/prayer-times';
import { useSettings } from '@/lib/settings/context';
import {
  HIGHLAT_OPTIONS,
  MADHAB_OPTIONS,
  METHOD_OPTIONS,
  POLAR_OPTIONS,
  ROUNDING_OPTIONS,
  SHAFAQ_OPTIONS,
  signedMinutes,
} from '@/lib/settings/options';
import { PRAYER_ADJUSTMENT_MAX, PRAYER_ADJUSTMENT_MIN } from '@/lib/settings/types';
import { usePrayerPreview } from '@/lib/settings/usePrayerPreview';
import { space, type } from '@/theme/tokens';

const ZERO_ADJUSTMENTS = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 } as const;

export default function Berakning() {
  const { settings, update } = useSettings();
  const { coords, label } = useLocation();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // One timestamp, captured on mount — no tick. This is a pushed page the user leaves
  // within a minute or two, and the date line only has to say "i dag". (The hub owns a
  // ticking clock because it can be left open across midnight; see usePrayerPreview.)
  const [now] = useState(() => new Date());
  const preview = usePrayerPreview(coords, label, settings, now);
  // "Återställ alla" only appears when something is actually set — keeps the panel
  // quiet on first visit, surfaces an escape hatch once the user has fiddled.
  const hasAdjustments = PRAYER_ORDER.some((k) => settings.adjustments[k] !== 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="back" fallback="/installningar" />
      <View style={styles.pinned}>
        <PreviewStrip preview={preview} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Beräkning</Text>

        <SettingSection
          title="Beräkningsmetod"
          footnote="Diyanet är appens standard. Välj den metod som din moské eller församling följer."
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

        {/* Avrundning shapes the displayed time string, so it belongs with the math that
            produced it rather than under "Utseende", where it used to sit among theme and
            map toggles. It is an adhan CalculationParameter exactly like the offsets
            below — and rounding Maghrib the wrong way changes when a fast ends. */}
        <SettingSection
          title="Avrundning"
          footnote="Hur en beräknad tid rundas till hela minuter innan den visas."
        >
          <OptionGroup
            options={ROUNDING_OPTIONS}
            value={settings.rounding}
            onChange={(rounding) => update({ rounding })}
          />
        </SettingSection>

        <SettingSection
          title="Manuella justeringar"
          footnote="Förskjut varje tid i minuter för att matcha din lokala moské, till exempel vid Ramadan-justeringar."
        >
          {PRAYER_ORDER.map((key, i) => (
            <Stepper
              key={key}
              label={PRAYER_LABELS[key]}
              value={settings.adjustments[key]}
              divider={i > 0}
              min={PRAYER_ADJUSTMENT_MIN}
              max={PRAYER_ADJUSTMENT_MAX}
              format={signedMinutes}
              onChange={(v) => update({ adjustments: { ...settings.adjustments, [key]: v } })}
            />
          ))}
          {hasAdjustments ? (
            <Pressable
              onPress={() => {
                hapticLight();
                update({ adjustments: { ...ZERO_ADJUSTMENTS } });
              }}
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
    // The pinned verifier reads as chrome, not as the first card of the list: it sits on
    // the screen ground (no card fill) and a hairline draws the line under it that the
    // scrolling content passes beneath.
    pinned: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
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
