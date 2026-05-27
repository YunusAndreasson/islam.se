import { type ReactNode, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisclosureGroup } from '@/components/settings/DisclosureGroup';
import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { type SettingsColors, useSettingsColors } from '@/components/settings/theme';
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
  adjustmentsSummary,
  CITY_OPTIONS,
  HIGHLAT_OPTIONS,
  madhabLabel,
  MADHAB_OPTIONS,
  METHOD_OPTIONS,
  methodLabel,
  POLAR_OPTIONS,
  ROUNDING_OPTIONS,
  SHAFAQ_OPTIONS,
  signedMinutes,
} from '@/lib/settings/options';
import { SWEDISH_CITIES } from '@/lib/settings/types';

export default function Installningar() {
  const { settings, loaded, update } = useSettings();
  const { coords, label, source, permissionStatus, locating, refresh } = useLocation();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Live preview: today's times for the resolved location. Recomputes whenever a
  // setting or the location changes — this is how the user sees a setting "land".
  const preview = useMemo(() => {
    const now = new Date();
    const pt = computePrayerTimes(coords, now, settings);
    const nextKey = prayerToKey(pt.nextPrayer(now));
    let dateLabel: string;
    try {
      const greg = new Intl.DateTimeFormat('sv-SE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Stockholm',
      }).format(now);
      dateLabel = `${greg.charAt(0).toUpperCase()}${greg.slice(1)} · ${formatHijri(now, settings.hijriOffset)}`;
    } catch {
      dateLabel = formatHijri(now, settings.hijriOffset);
    }
    return {
      nextKey,
      dateLabel,
      times: PRAYER_ORDER.map((key) => ({
        key,
        label: PRAYER_LABELS[key],
        time: formatTime(pt[key]),
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

        {/* Live "today" preview — the welcoming anchor. It sits above everything so a
            change in any group below is immediately visible. */}
        <SettingSection title="Förhandsvisning" footnote={`Plats: ${label}`}>
          <View style={styles.previewHead}>
            <Text style={styles.previewDate}>{preview.dateLabel}</Text>
          </View>
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
                <Text
                  testID={`preview-time-${p.key}`}
                  style={[styles.previewTime, isNext && styles.previewNextText]}
                >
                  {p.time}
                </Text>
              </View>
            );
          })}
        </SettingSection>

        {/* --- Essentials: location + notifications --- */}
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
          footnote="Lokala påminnelser för dagens böner – fungerar även utan internet. Ställ in en förvarning om du vill hinna till moskén."
        >
          <Toggle
            label="Påminn om bönetider"
            value={settings.notifications.enabled}
            onValueChange={(enabled) =>
              update({ notifications: { ...settings.notifications, enabled } })
            }
          />
          {settings.notifications.enabled ? (
            <Stepper
              label="Påminn i förväg"
              value={settings.notifications.leadMinutes}
              divider
              min={0}
              max={60}
              step={5}
              format={(v) => (v === 0 ? 'Vid bönetid' : `${v} min innan`)}
              onChange={(leadMinutes) =>
                update({ notifications: { ...settings.notifications, leadMinutes } })
              }
            />
          ) : null}
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

        {/* --- Advanced, folded away with good defaults; the header shows the current
            value so the user recognises the state without opening it. --- */}
        <DisclosureGroup
          title="Beräkning"
          summary={`${methodLabel(settings)} · ${madhabLabel(settings)} Asr`}
        >
          <SubGroup styles={styles} title="Beräkningsmetod">
            <OptionGroup
              options={METHOD_OPTIONS}
              value={settings.calculationMethod}
              onChange={(calculationMethod) => update({ calculationMethod })}
            />
          </SubGroup>

          <SubGroup styles={styles} title="Asr-metod (madhhab)" divider>
            <OptionGroup options={MADHAB_OPTIONS} value={settings.madhab} onChange={(madhab) => update({ madhab })} />
          </SubGroup>

          <SubGroup
            styles={styles}
            title="Höga breddgrader"
            footnote="Hur Fajr och Isha beräknas när solen inte sjunker tillräckligt långt under horisonten – viktigt i Sverige."
            divider
          >
            <OptionGroup
              options={HIGHLAT_OPTIONS}
              value={settings.highLatitudeRule}
              onChange={(highLatitudeRule) => update({ highLatitudeRule })}
            />
          </SubGroup>

          <SubGroup
            styles={styles}
            title="Polcirkeln"
            footnote="Vad som visas norr om polcirkeln (t.ex. Kiruna) under midnattssol, då Fajr/Isha annars saknar lösning."
            divider
          >
            <OptionGroup
              options={POLAR_OPTIONS}
              value={settings.polarCircleResolution}
              onChange={(polarCircleResolution) => update({ polarCircleResolution })}
            />
          </SubGroup>

          {settings.calculationMethod === 'MoonsightingCommittee' ? (
            <SubGroup styles={styles} title="Shafaq" footnote="Endast för Moonsighting Committee." divider>
              <OptionGroup options={SHAFAQ_OPTIONS} value={settings.shafaq} onChange={(shafaq) => update({ shafaq })} />
            </SubGroup>
          ) : null}
        </DisclosureGroup>

        <DisclosureGroup title="Visning & finjustering" summary={adjustmentsSummary(settings)}>
          <SubGroup styles={styles} title="Avrundning">
            <OptionGroup
              options={ROUNDING_OPTIONS}
              value={settings.rounding}
              onChange={(rounding) => update({ rounding })}
            />
          </SubGroup>

          <SubGroup styles={styles} title="Manuella justeringar" footnote="Förskjut varje tid i minuter." divider>
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
          </SubGroup>

          <SubGroup
            styles={styles}
            title="Hijri-justering"
            footnote={`I dag: ${formatHijri(new Date(), settings.hijriOffset)}. Justera för att matcha lokal månsiktning.`}
            divider
          >
            <Stepper
              label="Dagar"
              value={settings.hijriOffset}
              min={-2}
              max={2}
              format={(v) => `${v > 0 ? '+' : ''}${v} d`}
              onChange={(hijriOffset) => update({ hijriOffset })}
            />
          </SubGroup>
        </DisclosureGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

// One labelled sub-section inside a DisclosureGroup: a muted title, the control, and
// an optional footnote. `divider` draws the hairline that separates it from the
// sub-section above (the first one sits flush under the group header's own divider).
function SubGroup({
  styles,
  title,
  footnote,
  divider,
  children,
}: {
  styles: ReturnType<typeof makeStyles>;
  title: string;
  footnote?: string;
  divider?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={[styles.sub, divider && styles.subDivider]}>
      <Text style={styles.subTitle}>{title.toUpperCase()}</Text>
      {children}
      {footnote ? <Text style={styles.subFootnote}>{footnote}</Text> : null}
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 16, paddingBottom: 48 },
    header: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 20, marginTop: 4 },
    previewHead: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    previewDate: { fontSize: 14, fontWeight: '600', color: colors.text },
    previewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 44,
    },
    previewDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    // "nästa" = brass, consistent with the dock + map's next-prayer signal.
    previewNext: { backgroundColor: colors.highlightSoft },
    previewLabel: { fontSize: 16, color: colors.text },
    previewTime: { fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
    previewNextText: { color: colors.highlight, fontWeight: '600' },
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
    // Sub-sections within a DisclosureGroup.
    sub: { paddingBottom: 12 },
    subDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    subTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      letterSpacing: 0.5,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 4,
    },
    subFootnote: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 16, paddingTop: 8, lineHeight: 16 },
  });
}
