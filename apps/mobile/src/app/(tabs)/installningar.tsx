import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionGroup, type Option } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { colors } from '@/components/settings/theme';
import { Toggle } from '@/components/settings/Toggle';
import { formatHijri } from '@/lib/hijri';
import { useLocation } from '@/lib/location/context';
import { NOTIFY_PRAYERS } from '@/lib/notifications';
import {
  computePrayerTimes,
  formatTime,
  PRAYER_LABELS,
  PRAYER_ORDER,
  prayerToKey,
} from '@/lib/prayer-times';
import { useSettings } from '@/lib/settings/context';
import {
  type CalculationMethodKey,
  type HighLatitudeRuleKey,
  type Madhab,
  type PolarCircleResolutionKey,
  type Rounding,
  type Shafaq,
  SWEDISH_CITIES,
  type TimeFormat,
} from '@/lib/settings/types';

const METHOD_OPTIONS: readonly Option<CalculationMethodKey>[] = [
  { value: 'MuslimWorldLeague', label: 'Muslim World League', description: 'Fajr 18°, Isha 17°' },
  { value: 'Egyptian', label: 'Egyptiska myndigheten', description: 'Fajr 19,5°, Isha 17,5°' },
  { value: 'Karachi', label: 'Karachi', description: 'Fajr 18°, Isha 18°' },
  { value: 'UmmAlQura', label: 'Umm al-Qura (Mecka)', description: 'Fajr 18,5°, Isha efter 90 min' },
  { value: 'Dubai', label: 'Dubai', description: 'Fajr 18,2°, Isha 18,2°' },
  { value: 'Qatar', label: 'Qatar', description: 'Fajr 18°, Isha efter 90 min' },
  { value: 'Kuwait', label: 'Kuwait', description: 'Fajr 18°, Isha 17,5°' },
  { value: 'MoonsightingCommittee', label: 'Moonsighting Committee', description: 'Fajr 18°, Isha 18° (shafaq)' },
  { value: 'Singapore', label: 'Singapore', description: 'Fajr 20°, Isha 18°' },
  { value: 'Turkey', label: 'Turkiet (Diyanet)', description: 'Fajr 18°, Isha 17°' },
  { value: 'Tehran', label: 'Teheran', description: 'Fajr 17,7°, Isha 14°' },
  { value: 'NorthAmerica', label: 'Nordamerika (ISNA)', description: 'Fajr 15°, Isha 15°' },
  { value: 'Other', label: 'Annan', description: 'Anpassad – 0° (justera manuellt)' },
];

const MADHAB_OPTIONS: readonly Option<Madhab>[] = [
  { value: 'shafi', label: 'Standard', description: "Shafi'i, Maliki, Hanbali – tidigare Asr" },
  { value: 'hanafi', label: 'Hanafi', description: 'Senare Asr' },
];

const HIGHLAT_OPTIONS: readonly Option<HighLatitudeRuleKey>[] = [
  { value: 'auto', label: 'Automatisk (rekommenderad)', description: 'Väljs efter platsens latitud' },
  { value: 'middleOfTheNight', label: 'Nattens mitt' },
  { value: 'seventhOfTheNight', label: 'Sjundedel av natten' },
  { value: 'twilightAngle', label: 'Skymningsvinkel' },
];

const POLAR_OPTIONS: readonly Option<PolarCircleResolutionKey>[] = [
  { value: 'aqrabBalad', label: 'Närmaste lämpliga plats', description: 'Aqrab al-Balad' },
  { value: 'aqrabYaum', label: 'Närmaste lämpliga dag', description: 'Aqrab al-Yaum' },
  { value: 'unresolved', label: 'Oberäknad', description: 'Visa ingen tid när den ej kan beräknas' },
];

const SHAFAQ_OPTIONS: readonly Option<Shafaq>[] = [
  { value: 'general', label: 'Allmän', description: 'Röd och vit skymning' },
  { value: 'ahmer', label: 'Ahmer (röd)', description: 'Tidigare Isha' },
  { value: 'abyad', label: 'Abyad (vit)', description: 'Senare Isha' },
];

const ROUNDING_OPTIONS: readonly Option<Rounding>[] = [
  { value: 'nearest', label: 'Närmaste minut' },
  { value: 'up', label: 'Uppåt' },
  { value: 'none', label: 'Ingen' },
];

const TIMEFORMAT_OPTIONS: readonly Option<TimeFormat>[] = [
  { value: '24h', label: '24-timmars' },
  { value: '12h', label: '12-timmars' },
];

const CITY_OPTIONS: readonly Option<string>[] = SWEDISH_CITIES.map((c) => ({
  value: c.name,
  label: c.name,
}));

const signedMinutes = (v: number) => `${v > 0 ? '+' : ''}${v} min`;

export default function Installningar() {
  const { settings, loaded, update } = useSettings();
  const { coords, label, source, permissionStatus, locating, refresh } = useLocation();

  // Live preview: today's times for the resolved location. Recomputes whenever a
  // setting or the location changes — this is how the user sees a setting "land".
  const preview = useMemo(() => {
    const now = new Date();
    const pt = computePrayerTimes(coords, now, settings);
    const nextKey = prayerToKey(pt.nextPrayer(now));
    return {
      nextKey,
      times: PRAYER_ORDER.map((key) => ({
        key,
        label: PRAYER_LABELS[key],
        time: formatTime(pt[key], settings),
      })),
    };
  }, [coords, settings]);

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Inställningar</Text>

        {/* Live preview at the top so changes below are immediately visible. */}
        <SettingSection title="Förhandsvisning" footnote={`Plats: ${label}`}>
          {preview.times.map((p, i) => {
            const isNext = p.key === preview.nextKey;
            return (
              <View
                key={p.key}
                style={[styles.previewRow, i > 0 && styles.previewDivider, isNext && styles.previewNext]}
              >
                <Text style={[styles.previewLabel, isNext && styles.previewNextText]}>
                  {p.label}
                  {isNext ? '  ·  nästa' : ''}
                </Text>
                <Text style={[styles.previewTime, isNext && styles.previewNextText]}>{p.time}</Text>
              </View>
            );
          })}
        </SettingSection>

        <SettingSection
          title="Plats"
          footnote={
            settings.locationMode === 'gps'
              ? permissionStatus === 'denied'
                ? 'Platsåtkomst nekad – visar standardplats. Tillåt i systeminställningar.'
                : 'Använder enhetens position.'
              : 'Välj en stad för beräkningen.'
          }
        >
          <OptionGroup
            options={[
              { value: 'gps', label: 'GPS (min plats)' },
              { value: 'manual', label: 'Välj stad' },
            ]}
            value={settings.locationMode}
            onChange={(locationMode) => update({ locationMode })}
          />
          {settings.locationMode === 'gps' ? (
            <Pressable
              onPress={() => void refresh()}
              style={({ pressed }) => [styles.refreshRow, pressed && styles.refreshPressed]}
            >
              <Text style={styles.refreshText}>{locating ? 'Hämtar position…' : 'Uppdatera position'}</Text>
              <Text style={styles.refreshStatus}>{source === 'gps' ? label : '—'}</Text>
            </Pressable>
          ) : null}
        </SettingSection>

        {settings.locationMode === 'manual' ? (
          <SettingSection title="Stad">
            <OptionGroup
              options={CITY_OPTIONS}
              value={settings.manualLocation?.name ?? 'Stockholm'}
              onChange={(name) => {
                const city = SWEDISH_CITIES.find((c) => c.name === name);
                if (city) update({ manualLocation: { ...city } });
              }}
            />
          </SettingSection>
        ) : null}

        <SettingSection
          title="Notiser"
          footnote="Lokala påminnelser för dagens böner – fungerar även utan internet."
        >
          <Toggle
            label="Påminn om bönetider"
            value={settings.notifications.enabled}
            onValueChange={(enabled) =>
              update({ notifications: { ...settings.notifications, enabled } })
            }
          />
          {settings.notifications.enabled
            ? NOTIFY_PRAYERS.map((key) => (
                <Toggle
                  key={key}
                  label={PRAYER_LABELS[key]}
                  value={settings.notifications.prayers[key]}
                  divider
                  onValueChange={(v) =>
                    update({
                      notifications: {
                        ...settings.notifications,
                        prayers: { ...settings.notifications.prayers, [key]: v },
                      },
                    })
                  }
                />
              ))
            : null}
        </SettingSection>

        <SettingSection title="Beräkningsmetod">
          <OptionGroup
            options={METHOD_OPTIONS}
            value={settings.calculationMethod}
            onChange={(calculationMethod) => update({ calculationMethod })}
          />
        </SettingSection>

        <SettingSection title="Asr-metod (madhhab)">
          <OptionGroup options={MADHAB_OPTIONS} value={settings.madhab} onChange={(madhab) => update({ madhab })} />
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
            <OptionGroup options={SHAFAQ_OPTIONS} value={settings.shafaq} onChange={(shafaq) => update({ shafaq })} />
          </SettingSection>
        ) : null}

        <SettingSection title="Avrundning">
          <OptionGroup
            options={ROUNDING_OPTIONS}
            value={settings.rounding}
            onChange={(rounding) => update({ rounding })}
          />
        </SettingSection>

        <SettingSection title="Manuella justeringar" footnote="Förskjut varje tid i minuter.">
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
        </SettingSection>

        <SettingSection title="Tidsformat">
          <OptionGroup
            options={TIMEFORMAT_OPTIONS}
            value={settings.timeFormat}
            onChange={(timeFormat) => update({ timeFormat })}
          />
        </SettingSection>

        <SettingSection
          title="Hijri-justering"
          footnote={`Idag: ${formatHijri(new Date(), settings.hijriOffset)}. Justera för att matcha lokal månsiktning.`}
        >
          <Stepper
            label="Dagar"
            value={settings.hijriOffset}
            min={-2}
            max={2}
            format={(v) => `${v > 0 ? '+' : ''}${v} d`}
            onChange={(hijriOffset) => update({ hijriOffset })}
          />
        </SettingSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  header: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 20, marginTop: 4 },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  previewDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  previewNext: { backgroundColor: colors.accentSoft },
  previewLabel: { fontSize: 16, color: colors.text },
  previewTime: { fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  previewNextText: { color: colors.accent, fontWeight: '600' },
  refreshRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshPressed: { backgroundColor: colors.accentSoft },
  refreshText: { fontSize: 16, color: colors.accent },
  refreshStatus: { fontSize: 14, color: colors.textMuted },
});
