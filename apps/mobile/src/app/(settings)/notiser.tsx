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
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisclosureGroup } from '@/components/settings/DisclosureGroup';
import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { type SettingsColors, useSettingsColors } from '@/components/settings/theme';
import { Toggle } from '@/components/settings/Toggle';
import { ModalBar } from '@/components/ui/ModalBar';
import { useLocation } from '@/lib/location/context';
import { alertsPerDay, nextAlertAt, NOTIFY_PRAYERS, type NotifyPrayerKey } from '@/lib/notifications';
import { useNotificationPermission } from '@/lib/notifications-permission';
import { formatTime, PRAYER_LABELS, PRAYER_SWEDISH_NAMES } from '@/lib/prayer-times';
import { relativeDayLabel } from '@/lib/relative-day';
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
import { startOfStockholmDay } from '@/lib/stockholm-time';
import { systemSettingsName } from '@/lib/system-settings';
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

  // Every control on this screen configures something the reader cannot see happen: the
  // scheduling runs in a root-level effect, sounds cannot be previewed, and the summaries
  // only echo the settings back. So the screen says the one fact that closes the loop —
  // when the next reminder actually arrives. It moves the moment a lead or a toggle
  // moves, which is what makes those controls judgeable at all. Ticked by the minute
  // while focused (same reason as the Inställningar preview: a screen left open must not
  // go on naming a time that has passed), and paused off-focus.
  const { coords } = useLocation();
  const isFocused = useIsFocused();
  // The OS's answer, not just our own switch. Without it this line names a precise arrival
  // time in the one state where nothing is scheduled at all: the toggle is on, the reader
  // refused the system prompt, syncPrayerNotifications bails at its permission check — and
  // the status line would go on promising a reminder that can never come, which is the
  // exact lie it exists to remove.
  const { blocked } = useNotificationPermission(isFocused);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isFocused) return;
    const tick = (): void => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [isFocused]);
  const nextReminder = useMemo(() => {
    if (blocked) return `Notiser är blockerade – inget schemaläggs förrän du tillåter dem i ${systemSettingsName()}.`;
    // The master switch is a different kind of silence from either an empty selection or
    // an unresolvable polar-day time. nextAlertAt correctly returns null while it is off;
    // name that state before interpreting the null as a calculation failure.
    if (!settings.notifications.enabled) {
      return 'Påminnelser är avstängda – ingenting schemaläggs.';
    }
    // Two different silences, told apart before they are described. Every slot switched
    // off is a choice the reader made and can see in the toggles below; no COMPUTABLE
    // time (Kiruna in June with polarCircleResolution 'unresolved', where Fajr and ʿIshāʾ
    // have no solution) is the app failing to find one, and saying "inga påminnelser är
    // påslagna" to someone looking at switches that are visibly on would be nonsense.
    if (alertsPerDay(settings.notifications) === 0) {
      return 'Inga påminnelser är påslagna – ingenting schemaläggs.';
    }
    const next = nextAlertAt(coords, settings, now);
    if (!next) return 'Ingen tid går att räkna ut för det närmaste dygnet här.';
    const label =
      next.key === 'lastThird'
        ? 'Nattens sista tredjedel'
        : // NOT PRAYER_LABELS['sunrise'] — that is "Shurūq", a word this screen never uses:
          // the section controlling it is titled "Fajr-fönstret" and the alert the OS will
          // show reads "Fajr-tiden slutar". A status line naming something the reader
          // cannot map back to a control is not closing the loop.
          next.key === 'sunrise'
          ? 'Fajr-fönstret'
          : PRAYER_LABELS[next.key];
    const days = Math.round(
      (startOfStockholmDay(next.fireAt.getTime()) - startOfStockholmDay(now)) / 86_400_000,
    );
    return `Nästa påminnelse: ${label} ${formatTime(next.fireAt)} ${relativeDayLabel(days)}.`;
  }, [blocked, coords, settings, now]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="back" fallback="/installningar" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Påminnelser</Text>
        {/* Quiet status under the title, not a card: it is the consequence of everything
            below, so it belongs to the screen rather than to any one section. */}
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {nextReminder}
        </Text>

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

        {/* Its own section for the same reason Fajr-fönstret has one: it is not a prayer,
            and nothing here may read as a sixth or seventh obligation. Note the "Gäller
            alla" controls above deliberately do NOT reach this sound — their footnote says
            "alla böner", and this is not one. */}
        <SettingSection
          title="Nattens sista tredjedel"
          footnote="Nattens sista tredjedel räknas från Maghrib till nästa Fajr – den tid de lärda framhåller för den frivilliga nattbönen. Det är ingen bönetid, och påminnelsen fyller en plats i notisbudgeten."
        >
          <DisclosureGroup
            title="Påminn i nattens sista tredjedel"
            summary={n.lastThird ? soundLabel(n.lastThirdSound) : 'Av'}
          >
            <Toggle
              label="Påminn när sista tredjedelen börjar"
              description="Notisen kommer exakt när tiden går in."
              value={n.lastThird}
              onValueChange={(lastThird) => patch({ lastThird })}
            />
            {n.lastThird ? (
              <SubGroup styles={styles} title="Ljud" divider>
                <OptionGroup
                  options={SOUND_OPTIONS}
                  value={n.lastThirdSound}
                  onChange={(lastThirdSound) => patch({ lastThirdSound })}
                />
              </SubGroup>
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
    // The title gives up its bottom margin to the status line below it — the two read as
    // one block, and the section cards keep the same distance from the top as before.
    header: { ...type.title, color: colors.text, marginTop: space.xs },
    status: { ...type.callout, color: colors.textMuted, marginTop: space.xs, marginBottom: space.xl },
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
