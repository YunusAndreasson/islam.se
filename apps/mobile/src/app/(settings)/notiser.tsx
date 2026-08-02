// Påminnelser — the per-alert configuration behind Inställningar → Notiser.
//
// Why a pushed screen rather than more rows on Inställningar: the Notiser section was
// already nine rows (master toggle, permission status, the system-settings recovery
// link, a lead stepper, five prayer toggles). Per-prayer lead + per-prayer sound + the
// Fajr-window alert would take it past twenty-five controls — it would dwarf Plats,
// Beräkning and Utseende combined and push every other configuration surface below the
// fold, which is exactly what installningar.tsx's own IA comment says not to do. The
// screen already establishes "one chevron row → one focused screen" for Beräkning and
// Byt plats; alerts are now in that weight class.
//
// Three sections, in the order a user actually thinks:
//   1. Gäller alla   — set every prayer at once. What most people want, done in one tap.
//   2. Varje bön     — the per-prayer detail, folded away until asked for.
//   3. Fajr-fönstret — the one NON-prayer alert (Shurūq closes Fajr's window), kept
//      visibly apart so it never reads as a sixth prayer.
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisclosureGroup } from '@/components/settings/DisclosureGroup';
import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { type SettingsColors, useSettingsColors } from '@/components/settings/theme';
import { Toggle } from '@/components/settings/Toggle';
import { ModalBar } from '@/components/ui/ModalBar';
import { NOTIFY_PRAYERS, type NotifyPrayerKey } from '@/lib/notifications';
import { PRAYER_LABELS, PRAYER_SWEDISH_NAMES } from '@/lib/prayer-times';
import { useSettings } from '@/lib/settings/context';
import {
  MIXED_LABEL,
  SOUND_OPTIONS,
  commonPrayerLead,
  commonSound,
  leadLabel,
  mixedPrayerLead,
  setAllPrayerLeads,
  setAllSounds,
  soundLabel,
  sunriseLeadLabel,
} from '@/lib/settings/options';
import {
  NOTIFICATION_LEAD_MAX,
  NOTIFICATION_LEAD_MIN,
  type NotificationSettings,
  type NotificationSoundKey,
} from '@/lib/settings/types';
import { space, type } from '@/theme/tokens';

const LEAD_STEP = 5;

export default function Notiser() {
  const { settings, update } = useSettings();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const n = settings.notifications;

  // Every control writes through this, so the nested records are never mutated in place
  // (they are shared with DEFAULT_SETTINGS until a reset clones them).
  const patch = (next: Partial<NotificationSettings>): void =>
    update({ notifications: { ...n, ...next } });

  const mixedLead = mixedPrayerLead(n);
  const sharedSound = commonSound(n);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="back" fallback="/installningar" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Påminnelser</Text>

        <SettingSection
          title="Gäller alla"
          footnote="Ändrar alla böner på en gång. Du kan finjustera varje bön nedan."
        >
          <Stepper
            label="Påminn i förväg"
            value={commonPrayerLead(n)}
            min={NOTIFICATION_LEAD_MIN}
            max={NOTIFICATION_LEAD_MAX}
            step={LEAD_STEP}
            // When the five disagree the stepper shows "Blandat" rather than picking one
            // prayer's value and quietly presenting it as everyone's. Stepping from there
            // writes the new value to all five, which is the point of a bulk control.
            format={(v) => (mixedLead ? MIXED_LABEL : leadLabel(v))}
            onChange={(minutes) => patch({ lead: setAllPrayerLeads(n.lead, minutes) })}
          />
          <SubGroup styles={styles} title="Ljud" divider>
            <OptionGroup
              options={SOUND_OPTIONS}
              // null when the slots disagree → no row is checked, which is honest.
              value={sharedSound}
              onChange={(sound) => patch({ sound: setAllSounds(sound) })}
            />
          </SubGroup>
        </SettingSection>

        <SettingSection title="Varje bön" footnote="Sätt egen tid och eget ljud för varje bön.">
          {NOTIFY_PRAYERS.map((key) => (
            <PrayerAlertGroup
              key={key}
              prayerKey={key}
              notifications={n}
              onPatch={patch}
              styles={styles}
            />
          ))}
        </SettingSection>

        {/* Kept in its own section so it never reads as a sixth prayer. Shurūq is a time
            marker: it is when Fajr's window CLOSES, which is why the warning is useful
            and why it is off by default. */}
        <SettingSection
          title="Fajr-fönstret"
          footnote="Shurūq är soluppgången – då tar tiden för Fajr slut. Det är ingen bön, utan en påminnelse om att hinna be."
        >
          <DisclosureGroup
            title="Fajr-fönstret slutar"
            summary={
              n.fajrWindowEnd
                ? `${sunriseLeadLabel(n.lead.sunrise)} · ${soundLabel(n.sound.sunrise)}`
                : 'Av'
            }
          >
            <Toggle
              label="Påminn vid Shurūq"
              description="Soluppgång – slutet på Fajr-tiden"
              value={n.fajrWindowEnd}
              onValueChange={(fajrWindowEnd) => patch({ fajrWindowEnd })}
            />
            {n.fajrWindowEnd ? (
              <>
                <Stepper
                  label="Påminn i förväg"
                  value={n.lead.sunrise}
                  divider
                  min={NOTIFICATION_LEAD_MIN}
                  max={NOTIFICATION_LEAD_MAX}
                  step={LEAD_STEP}
                  format={sunriseLeadLabel}
                  onChange={(minutes) => patch({ lead: { ...n.lead, sunrise: minutes } })}
                />
                <SubGroup styles={styles} title="Ljud" divider>
                  <OptionGroup
                    options={SOUND_OPTIONS}
                    value={n.sound.sunrise}
                    onChange={(sound) => patch({ sound: { ...n.sound, sunrise: sound } })}
                  />
                </SubGroup>
              </>
            ) : null}
          </DisclosureGroup>
        </SettingSection>
      </ScrollView>
    </SafeAreaView>
  );
}

/** One prayer's alert: on/off, its own heads-up, its own sound. Collapsed to a single
 *  summary line until opened, so five of these read as one scannable list. */
function PrayerAlertGroup({
  prayerKey,
  notifications: n,
  onPatch,
  styles,
}: {
  prayerKey: NotifyPrayerKey;
  notifications: NotificationSettings;
  onPatch: (next: Partial<NotificationSettings>) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const on = n.prayers[prayerKey];
  return (
    <DisclosureGroup
      title={PRAYER_LABELS[prayerKey]}
      summary={on ? `${leadLabel(n.lead[prayerKey])} · ${soundLabel(n.sound[prayerKey])}` : 'Av'}
    >
      <Toggle
        label="Påminnelse"
        description={PRAYER_SWEDISH_NAMES[prayerKey]}
        value={on}
        onValueChange={(value) =>
          onPatch({ prayers: { ...n.prayers, [prayerKey]: value } })
        }
      />
      {on ? (
        <>
          <Stepper
            label="Påminn i förväg"
            value={n.lead[prayerKey]}
            divider
            min={NOTIFICATION_LEAD_MIN}
            max={NOTIFICATION_LEAD_MAX}
            step={LEAD_STEP}
            format={leadLabel}
            onChange={(minutes) => onPatch({ lead: { ...n.lead, [prayerKey]: minutes } })}
          />
          <SubGroup styles={styles} title="Ljud" divider>
            <OptionGroup
              options={SOUND_OPTIONS}
              value={n.sound[prayerKey]}
              onChange={(sound: NotificationSoundKey) =>
                onPatch({ sound: { ...n.sound, [prayerKey]: sound } })
              }
            />
          </SubGroup>
        </>
      ) : null}
    </DisclosureGroup>
  );
}

// A labelled sub-section inside a card — same shape as Inställningar's own SubGroup, so
// the two screens read as one family.
function SubGroup({
  styles,
  title,
  divider,
  children,
}: {
  styles: ReturnType<typeof makeStyles>;
  title: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Text style={[styles.subTitle, divider && styles.subDivider]}>{title}</Text>
      {children}
    </>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },
    header: { ...type.title, color: colors.text, marginBottom: space.xl, marginTop: space.xs },
    subTitle: {
      ...type.label,
      color: colors.textMuted,
      paddingHorizontal: space.lg,
      paddingTop: 14,
      paddingBottom: space.xs,
    },
    subDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
  });
}
