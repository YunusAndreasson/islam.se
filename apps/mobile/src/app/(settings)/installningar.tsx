import { router, useIsFocused } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { DisclosureGroup } from '@/components/settings/DisclosureGroup';
import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { type SettingsColors, useSettingsColors } from '@/components/settings/theme';
import { Toggle } from '@/components/settings/Toggle';
import { ModalBar } from '@/components/ui/ModalBar';
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
  HIGHLAT_OPTIONS,
  MADHAB_OPTIONS,
  METHOD_OPTIONS,
  methodLabel,
  POLAR_OPTIONS,
  ROUNDING_OPTIONS,
  SHAFAQ_OPTIONS,
  signedMinutes,
} from '@/lib/settings/options';
import { space, type } from '@/theme/tokens';

export default function Installningar() {
  const { settings, loaded, update } = useSettings();
  const { coords, label, source, permissionStatus, locating, refresh } = useLocation();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isFocused = useIsFocused();

  // The preview is a *live* clock, not a snapshot: its "nästa" highlight must advance as
  // prayers pass and its date must roll over at midnight, even if the user just leaves the
  // screen open. So `now` ticks every 30 s (matching the map's solar clock) rather than
  // being read once inside the memo below. The tick is paused while the screen is off-
  // screen so a backgrounded tab isn't recomputing prayer times; it snaps to the real time
  // again on refocus.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!isFocused) return;
    const tick = (): void => setNow(new Date());
    tick(); // snap to the real time on (re)focus, before the first interval fires
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [isFocused]);

  // Today's times for the resolved location. Recomputes whenever a setting, the location,
  // or the live clock changes — this is how the user sees a setting "land" and how the
  // next-prayer highlight keeps up with the wall clock.
  const preview = useMemo(() => {
    const pt = computePrayerTimes(coords, now, settings);
    const nextKey = prayerToKey(pt.nextPrayer(now));
    // Date · place — Gregorian + the current city, so the preview answers
    // both "what day" and "where" at a glance. Hijri lives in its own
    // adjuster section (so users who care still have it, one tap away).
    let dateLabel: string;
    try {
      const greg = new Intl.DateTimeFormat('sv-SE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Stockholm',
      }).format(now);
      dateLabel = `${greg.charAt(0).toUpperCase()}${greg.slice(1)} · ${label}`;
    } catch {
      dateLabel = label;
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
  }, [coords, settings, now, label]);

  // This screen is the Settings sheet over the map — a persistent ✕ dismisses it back.
  if (!loaded) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ModalBar variant="close" fallback="/bonetider" />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="close" fallback="/bonetider" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Inställningar</Text>

        {/* Live "today" preview — the welcoming anchor. It sits above everything so a
            change in any group below is immediately visible. The place is shown in
            the date row (Gregorian · City), so no footnote is needed here. */}
        <SettingSection title="Förhandsvisning">
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
          // Only surface a footnote when GPS mode has something to say (granted/denied);
          // the manual mode is self-explanatory from the row's state.
          footnote={
            settings.locationMode === 'gps'
              ? permissionStatus === 'denied'
                ? 'Platsåtkomst nekad – visar standardplats. Tillåt i systeminställningar.'
                : 'Använder enhetens position.'
              : undefined
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
          ) : (
            // Native iOS-Settings pattern: a row INSIDE the same card as the radio
            // (no second card), label left, current value muted right, chevron — pushes
            // the full 2,100-place picker. Only visible in manual mode.
            <Pressable
              onPress={() => router.push('/(settings)/byt-plats')}
              accessibilityRole="button"
              accessibilityLabel={`Stad: ${settings.manualLocation?.name ?? 'Stockholm'}. Tryck för att byta.`}
              style={({ pressed }) => [styles.refreshRow, pressed && styles.refreshPressed]}
            >
              <Text style={styles.refreshText}>Stad</Text>
              <View style={styles.cityValueWrap}>
                <Text style={styles.refreshStatus}>{settings.manualLocation?.name ?? 'Stockholm'}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
              </View>
            </Pressable>
          )}
        </SettingSection>

        {/* Beräkning sits second — after Plats — because it's what a user will tune
            once after choosing a city. Folded so the screen stays welcoming; the
            summary shows the current method so recognition replaces recall.
            Madhab/Asr is omitted from the summary to keep it on one line on narrow
            phones (it's the second-most-changed control inside, one tap away). */}
        <DisclosureGroup title="Beräkning" summary={methodLabel(settings)}>
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

        <SettingSection title="Notiser">
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
            footnote={`I dag: ${formatHijri(now, settings.hijriOffset)}. Justera för att matcha lokal månsiktning.`}
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

        {/* Om was a single page; it's now three peer cards (FAQ / Kontakt / Om
            appen) so a user looking for support or answers can jump straight to
            what they want without scrolling through everything else. Each row
            mirrors the DisclosureGroup collapsed-header rhythm — uppercase muted
            title left, accent chevron right — so the bottom of the screen reads
            as one consistent ladder. */}
        <Pressable
          onPress={() => router.push('/(settings)/vanliga-fragor')}
          accessibilityRole="button"
          accessibilityLabel="Vanliga frågor"
          style={({ pressed }) => [styles.aboutRow, pressed && styles.aboutPressed]}
        >
          <Text style={styles.aboutLabel}>VANLIGA FRÅGOR</Text>
          <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(settings)/kontakt')}
          accessibilityRole="button"
          accessibilityLabel="Kontakt"
          style={({ pressed }) => [styles.aboutRow, pressed && styles.aboutPressed]}
        >
          <Text style={styles.aboutLabel}>KONTAKT</Text>
          <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
        </Pressable>

        <Pressable
          onPress={() => router.push('/om')}
          accessibilityRole="button"
          accessibilityLabel="Om appen"
          style={({ pressed }) => [styles.aboutRow, pressed && styles.aboutPressed]}
        >
          <Text style={styles.aboutLabel}>OM APPEN</Text>
          <MaterialIcons name="chevron-right" size={24} color={colors.accent} />
        </Pressable>
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
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },
    // A single-row card linking a Settings sub-page — same chrome AND same
    // internal rhythm as a collapsed DisclosureGroup header: uppercase muted
    // title left, accent chevron right, identical padding and 24px bottom
    // gap (mirrors SettingSection's `wrap.marginBottom`) so a stack of these
    // peers (FAQ / Kontakt / Om) reads as discrete cards, not a glued group.
    aboutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      minHeight: 56,
      paddingVertical: 14,
      paddingHorizontal: space.lg,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 24,
    },
    aboutPressed: { backgroundColor: colors.accentSoft },
    // Same as DisclosureGroup's title style: 13/600 muted uppercase.
    aboutLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 },
    // For the Stad row inside the Plats card: the value + chevron group right.
    cityValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    // Editorial title — same token as Qibla's title so the sibling sheets share rhythm.
    header: { ...type.title, color: colors.text, marginBottom: space.xl, marginTop: space.xs },
    previewHead: {
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    previewDate: { fontSize: 14, fontWeight: '600', color: colors.text },
    previewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      minHeight: 44,
    },
    previewDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    // "nästa" = brass, consistent with the dock + map's next-prayer signal.
    previewNext: { backgroundColor: colors.highlightSoft },
    previewLabel: { ...type.body, color: colors.text },
    previewTime: { ...type.body, color: colors.text, fontVariant: ['tabular-nums'] },
    previewNextText: { color: colors.highlight, fontWeight: '600' },
    refreshRow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      minHeight: 48,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    refreshPressed: { backgroundColor: colors.accentSoft },
    refreshText: { ...type.body, color: colors.accent },
    refreshStatus: { fontSize: 14, color: colors.textMuted },
    // Sub-sections within a DisclosureGroup.
    sub: { paddingBottom: space.md },
    subDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    subTitle: {
      ...type.label,
      color: colors.textMuted,
      paddingHorizontal: space.lg,
      paddingTop: 14,
      paddingBottom: space.xs,
    },
    subFootnote: { fontSize: 12, color: colors.textMuted, paddingHorizontal: space.lg, paddingTop: space.sm, lineHeight: 16 },
  });
}
