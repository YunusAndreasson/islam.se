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
import { Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisclosureGroup } from '@/components/settings/DisclosureGroup';
import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { Toggle } from '@/components/settings/Toggle';
import { type SettingsColors, useSettingsColors } from '@/components/settings/theme';
import { Icon } from '@/components/ui/Icon';
import { ModalBar } from '@/components/ui/ModalBar';
import { HAS_ADHAN_AUDIO, useAdhanPreview } from '@/lib/adhan-audio';
import { useLocation } from '@/lib/location/context';
import { alertsPerDay, nextAlertAt, NOTIFY_PRAYERS, type NotifyPrayerKey } from '@/lib/notifications';
import { useExactAlarmPermission, useNotificationPermission } from '@/lib/notifications-permission';
import { formatTime, PRAYER_LABELS, PRAYER_SWEDISH_NAMES } from '@/lib/prayer-times';
import { relativeDayLabel } from '@/lib/relative-day';
import { useSettings } from '@/lib/settings/context';
import {
  SOUND_OPTIONS,
  commonPrayerLead,
  commonSound,
  leadLabel,
  leadOptions as LEAD_OPTIONS,
  mixedPrayerLead,
  setAllPrayerLeads,
  setAllSounds,
  soundLabel,
  sunriseLeadLabel,
  sunriseLeadOptions as SUNRISE_LEAD_OPTIONS,
} from '@/lib/settings/options';
import type { NotificationSettings, NotificationSoundKey } from '@/lib/settings/types';
import { startOfZoneDay } from '@/lib/zone-time';
import {
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  openNotificationSettings,
  systemSettingsName,
} from '@/lib/system-settings';
import { space, type } from '@/theme/tokens';

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
    // The master switch is a different kind of silence from either an empty selection or
    // an unresolvable polar-day time. nextAlertAt correctly returns null while it is off;
    // name that state before interpreting the null as a calculation failure.
    if (!settings.notifications.enabled) {
      return 'Påminnelser är avstängda – ingenting schemaläggs.';
    }
    if (blocked) return `Notiser är blockerade – inget schemaläggs förrän du tillåter dem i ${systemSettingsName()}.`;
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
      (startOfZoneDay(next.fireAt.getTime()) - startOfZoneDay(now)) / 86_400_000,
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

        <SettingSection title="Gäller alla fem böner">
          <SubGroup styles={styles} title="Påminn i förväg">
            {mixedLead ? (
              <Text style={styles.mixed}>Olika tider per bön. Välj här för att ändra alla fem.</Text>
            ) : null}
            <OptionGroup
              options={LEAD_OPTIONS(commonPrayerLead(n))}
              value={mixedLead ? null : String(commonPrayerLead(n))}
              onChange={(minutes) =>
                patch({ lead: setAllPrayerLeads(n.lead, Number(minutes)) })
              }
            />
          </SubGroup>
          <SubGroup styles={styles} title="Ljud" divider>
            {sharedSound === null ? (
              <Text style={styles.mixed}>Olika ljud per bön. Välj här för att ändra alla fem.</Text>
            ) : null}
            <OptionGroup
              options={SOUND_OPTIONS}
              value={sharedSound}
              onChange={(sound) => patch({ sound: setAllSounds(n.sound, sound) })}
            />
            {/* Gated on the module constant, not inside the row: mounting the row runs
                useAdhanPreview, which allocates a native player and subscribes to its
                status. A build with no adhan should pay nothing for a control it cannot
                draw. Constant, so this is not a conditional hook. */}
            {HAS_ADHAN_AUDIO ? <AdhanPreviewRow styles={styles} colors={colors} /> : null}
          </SubGroup>
        </SettingSection>

        <SettingSection title="Varje bön">
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

        {/* ONE section for the two alerts that are not prayers, where there used to be
            two — and between them TEN strings for two booleans: a section title, a
            footnote, a disclosure title, a toggle label and a toggle description each.
            Three of the five on Fajr-fönstret said the same thing, that sunrise ends
            Fajr's time.
            
            Four survive. The title says these are not prayers, the two rows name
            themselves, and the footnote carries the only two facts no control can show:
            what Shurūq closes, and that the last third is the voluntary night prayer's
            hour rather than an obligation — with the one practical consequence of
            switching it on, since the OS will only hold so many scheduled alerts.
            
            Kept visibly apart from the five above so neither can read as a sixth prayer.
            Note the "Gäller alla" controls deliberately do NOT reach these: they say
            "alla böner", and neither of these is one. */}
        <SettingSection
          title="Inte bönetider"
          footnote="Shurūq är soluppgången, då tiden för Fajr tar slut. Nattens sista tredjedel räknas från Maghrib till nästa Fajr – den tid de lärda framhåller för den frivilliga nattbönen. Varje påminnelse här tar en plats i notisbudgeten."
        >
          <DisclosureGroup
            title="Fajr-fönstret slutar"
            summary={
              n.fajrWindowEnd
                ? `${sunriseLeadLabel(n.lead.sunrise)} · ${soundLabel(n.sound.sunrise)}`
                : ''
            }
            toggle={{
              value: n.fajrWindowEnd,
              label: 'Påminnelse när Fajr-fönstret slutar. Vid soluppgången',
              onValueChange: (fajrWindowEnd) => patch({ fajrWindowEnd }),
            }}
          >
            <SubGroup styles={styles} title="Påminn i förväg">
              <OptionGroup
                options={SUNRISE_LEAD_OPTIONS(n.lead.sunrise)}
                value={String(n.lead.sunrise)}
                onChange={(minutes) =>
                  patch({ lead: { ...n.lead, sunrise: Number(minutes) } })
                }
              />
            </SubGroup>
            <SubGroup styles={styles} title="Ljud" divider>
              <OptionGroup
                options={SOUND_OPTIONS}
                value={n.sound.sunrise}
                onChange={(sound) => patch({ sound: { ...n.sound, sunrise: sound } })}
              />
            </SubGroup>
          </DisclosureGroup>
          <DisclosureGroup
            title="Nattens sista tredjedel"
            // No lead list: this one fires exactly when the time comes in. See types.ts.
            summary={n.lastThird ? soundLabel(n.lastThirdSound) : ''}
            toggle={{
              value: n.lastThird,
              label: 'Påminnelse när nattens sista tredjedel börjar',
              onValueChange: (lastThird) => patch({ lastThird }),
            }}
          >
            <SubGroup styles={styles} title="Ljud">
              <OptionGroup
                options={SOUND_OPTIONS}
                value={n.lastThirdSound}
                onChange={(lastThirdSound) => patch({ lastThirdSound })}
              />
            </SubGroup>
          </DisclosureGroup>
        </SettingSection>

        <DeliveryTroubleshooting
          styles={styles}
          colors={colors}
          active={isFocused}
          alarmClock={n.alarmClock}
          onAlarmClockChange={(alarmClock) => patch({ alarmClock })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Hear the adhan before committing to it.
 *
 * Every other control on this screen can be judged on the spot — a lead time moves the
 * "Nästa påminnelse" line above, a toggle changes what a summary says. The sound picker
 * could not: the reader chose a NAME and found out what it meant days later, at Fajr, in
 * the dark. Auditioning it is the smallest thing that closes that loop.
 *
 * Placed once, under the "Gäller alla" sound list rather than beside each of the four
 * pickers: there is one adhan file in the build, so four buttons would offer the same
 * thirty seconds four times.
 *
 * Renders NOTHING when the build carries no adhan — which is every build until an audio
 * file ships. A disabled play button would be a promise of a feature that is not there.
 */
function AdhanPreviewRow({
  styles,
  colors,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: SettingsColors;
}) {
  const { available, playing, toggle } = useAdhanPreview();
  // Belt and braces: the call site already gates on HAS_ADHAN_AUDIO, so this only fires if
  // someone renders the row directly.
  if (!available) return null;
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Stoppa uppspelningen av adhan' : 'Lyssna på adhan'}
      style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowAction}>{playing ? 'Stoppa' : 'Lyssna på adhan'}</Text>
      <Icon name={playing ? 'stop' : 'play'} size={18} color={colors.accent} />
    </Pressable>
  );
}

/**
 * The Android settings that silently stop a correctly scheduled alert, and the one way the
 * app can push back.
 *
 * Everything else on this screen configures what the app does. This configures what the OS
 * is allowed to do with it, and it is here because on Android the app can be blameless and
 * still fail: a channel muted from the notification shade leaves the permission granted and
 * every switch above on, and an OEM battery manager drops exact alarms for an app the
 * reader — by design, this being a notification they rely on — rarely opens.
 *
 * Neither is fixable from inside the app; both are one tap away in the OS, and until now
 * there was nothing in the app that pointed at either. Android-only because iOS has neither
 * mechanism, and an iOS reader shown a "battery optimisation" link would be sent looking for
 * a setting that does not exist.
 */
function DeliveryTroubleshooting({
  styles,
  colors,
  active,
  alarmClock,
  onAlarmClockChange,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: SettingsColors;
  active: boolean;
  alarmClock: boolean;
  onAlarmClockChange: (alarmClock: boolean) => void;
}) {
  const exact = useExactAlarmPermission(active && Platform.OS === 'android');
  if (Platform.OS !== 'android') return null;
  // Without the exact-alarm permission no alert is exact, alarm clock or not — so the switch
  // would promise something it cannot do. Offer the way to the permission instead. In
  // practice this is Android 12/12L after a revoke: 13+ grants it for good to this app.
  const denied = exact === 'denied';
  return (
    <SettingSection
      title="Om påminnelser inte kommer fram"
      footnote={
        denied
          ? 'Appen får inte ställa exakta alarm, så påminnelser kan komma flera minuter sent. Android kan också tysta enskilda ljudkanaler och försätta appar i djup vila.'
          : 'Android kan tysta enskilda ljudkanaler och försätta appar i djup vila.'
      }
    >
      <Pressable
        onPress={openNotificationSettings}
        accessibilityRole="button"
        accessibilityLabel="Öppna Androids notisinställningar för appen"
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <Text style={styles.rowAction}>Notiskanaler</Text>
        <Icon name="externalLink" size={18} color={colors.accent} />
      </Pressable>
      <Pressable
        onPress={openBatteryOptimizationSettings}
        accessibilityRole="button"
        accessibilityLabel="Öppna Androids batterioptimering"
        style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
      >
        <Text style={styles.rowAction}>Batterioptimering</Text>
        <Icon name="externalLink" size={18} color={colors.accent} />
      </Pressable>
      {denied ? (
        <Pressable
          onPress={openExactAlarmSettings}
          accessibilityRole="button"
          accessibilityLabel="Öppna Androids inställning för alarm och påminnelser"
          style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
        >
          <Text style={styles.rowAction}>Alarm och påminnelser</Text>
          <Icon name="externalLink" size={18} color={colors.accent} />
        </Pressable>
      ) : (
        // Opt-in because its price lands outside this app: see NotificationSettings.alarmClock.
        <Toggle
          label="Schemalägg som alarm"
          description="Kommer fram på minuten även i djup vila. Telefonen visar då påminnelsen som nästa alarm, och Stör ej kan sluta vid den."
          value={alarmClock}
          onValueChange={onAlarmClockChange}
          divider
        />
      )}
    </SettingSection>
  );
}

/** One prayer's alert: the switch on the row, its heads-up and sound behind the chevron.
 *
 *  The switch used to live INSIDE the fold, labelled "Påminnelse" — so a collapsed row
 *  said "Av" and gave you no way to change it without expanding first. The Swedish name
 *  ("Gryningsbönen") was that inner toggle's description; it now rides on the switch's own
 *  spoken label, which is the only place it was ever doing work. */
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
      // Nothing to say when it is off: the switch beside it already says so, and "Av"
      // under a visibly-off switch is the same word twice.
      summary={on ? `${leadLabel(n.lead[prayerKey])} · ${soundLabel(n.sound[prayerKey])}` : ''}
      toggle={{
        value: on,
        label: `Påminnelse för ${PRAYER_LABELS[prayerKey]}. ${PRAYER_SWEDISH_NAMES[prayerKey]}`,
        onValueChange: (value) => onPatch({ prayers: { ...n.prayers, [prayerKey]: value } }),
      }}
    >
      <SubGroup styles={styles} title="Påminn i förväg">
        <OptionGroup
          options={LEAD_OPTIONS(n.lead[prayerKey])}
          value={String(n.lead[prayerKey])}
          onChange={(minutes) =>
            onPatch({ lead: { ...n.lead, [prayerKey]: Number(minutes) } })
          }
        />
      </SubGroup>
      <SubGroup styles={styles} title="Ljud" divider>
        <OptionGroup
          options={SOUND_OPTIONS}
          value={n.sound[prayerKey]}
          onChange={(sound: NotificationSoundKey) =>
            onPatch({ sound: { ...n.sound, [prayerKey]: sound } })
          }
        />
      </SubGroup>
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
    mixed: { ...type.callout, color: colors.textMuted, paddingHorizontal: space.lg, paddingBottom: space.sm },
    subTitle: {
      ...type.label,
      color: colors.textMuted,
      paddingHorizontal: space.lg,
      paddingTop: 14,
      paddingBottom: space.xs,
    },
    subDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    // Same metrics as the action rows on Inställningar — these lead out of the app in
    // exactly the same way, and should not look like a different kind of control.
    row: {
      minHeight: 48,
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.md,
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    rowPressed: { opacity: 0.6 },
    rowAction: { ...type.body, color: colors.accent, flexShrink: 0 },
  });
}
