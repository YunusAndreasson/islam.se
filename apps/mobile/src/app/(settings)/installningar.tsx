// Inställningar — the configuration sheet over the map. Information architecture,
// in priority order for a Swedish-Muslim user:
//   1. Plats             — GPS or one of ~2,100 Swedish towns.
//   2. Beräkning         — calculation method, madhab, high-lat rule, polar resolution,
//      shafaq, avrundning, per-prayer minute offsets (pushed page).
//   3. Förhandsvisning   — today's times for the resolved location, ALWAYS VISIBLE as a
//      compact strip, with the night-times switch in the same card so the toggle's
//      effect appears directly above the control that caused it.
//   4. Notiser           — local reminders per prayer.
//   5. Karta             — the two map layers (moskéer, qibla).
//   6. Utseende          — theme.
//   7. Hijri-kalender    — the day offset for local moon sighting.
//   8. Haptik            — app-wide haptic feedback.
//   9. Stöd (untitled)   — Vanliga frågor / Kontakt / Om appen (clustered into one
//      list-style card, visually demoted with extra top air).
//
// No accordions here. Sections 3 and 5–7 used to be two DisclosureGroups: a folded
// "Förhandsvisning" and an "Utseende" group that had quietly become a junk drawer —
// theme, mosque pins, the qibla line, night times, rounding and the Hijri offset under
// one word. The tell was its own summary line: calculationSummary can say what the
// Beräkning row is SET to, while that group could only list the topics it contained,
// because no single value described it. A group that cannot state its own state is the
// wrong group, so it was split by what the settings actually govern, and Avrundning
// followed the other adhan CalculationParameters to Beräkning.
//
// Folding the verifier was the more costly half. It meant a user could change every
// time-affecting setting in the app without ever seeing a time — the exact failure the
// introduction had already diagnosed and fixed for itself (components/intro/StepMethod:
// "a setting you can watch land is a setting you can judge"). The strip is cheap enough
// in height to simply stay open, and Beräkning now pins its own copy.
import { MaterialIcons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionGroup } from '@/components/settings/OptionGroup';
import { PreviewStrip } from '@/components/settings/PreviewStrip';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { type SettingsColors, useSettingsColors } from '@/components/settings/theme';
import { Toggle } from '@/components/settings/Toggle';
import { ModalBar } from '@/components/ui/ModalBar';
import { APP_VERSION, OTA_LABEL, emailSupport } from '@/lib/about';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { useIntro } from '@/lib/intro-context';
import { useLocation, useLocationStatus } from '@/lib/location/context';
import { useNotificationPermission } from '@/lib/notifications-permission';
import { useSettings } from '@/lib/settings/context';
import { usePrayerPreview } from '@/lib/settings/usePrayerPreview';
import {
  HIJRI_OFFSET_MAX,
  HIJRI_OFFSET_MIN,
  isDefaultSettings,
} from '@/lib/settings/types';
import {
  LOCATION_MODE_OPTIONS,
  calculationSummary,
  notificationSummary,
  THEME_OPTIONS,
} from '@/lib/settings/options';
import {
  openSystemSettings,
  openSystemSettingsA11yLabel,
  openSystemSettingsLabel,
  systemSettingsName,
} from '@/lib/system-settings';
import { radius, space, type } from '@/theme/tokens';

export default function Installningar() {
  const { settings, loaded, update, reset } = useSettings();
  const { coords, label, source, permissionStatus } = useLocation();
  const { locating, refresh } = useLocationStatus();
  const { replay } = useIntro();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isFocused = useIsFocused();

  // Förhandsvisning's job is to show *how the current settings render* — not to be
  // a live next-prayer card (the dock + map already are). So no "nästa" highlight
  // here. The one reason `now` ticks at all is the calendar date underneath: a
  // user who opens the screen at 23:59 and stays past midnight should see today's
  // date roll over and tomorrow's times appear. A minute is plenty for that and
  // the tick is paused off-focus so a backgrounded tab isn't recomputing.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!isFocused) return;
    const tick = (): void => setNow(new Date());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [isFocused]);

  // The permission read, the status wording and the "asks the OS under the finger"
  // toggle all live in the shared hook — the introduction's notification step drives the
  // identical flow, and iOS's single lifetime prompt is not something to have two
  // implementations of. See lib/notifications-permission.
  const notifications = useNotificationPermission(isFocused);
  const onNotificationsToggle = (enabled: boolean): void => {
    void notifications.setEnabled(enabled);
  };

  // "Uppdatera plats" confirmation — a brief "Uppdaterad ✓" flash after a TAP-initiated
  // refresh resolves, so the user knows the action did something. Auto-acquires (mount /
  // permission flip) do NOT trigger this — we'd be lying about user intent and firing a
  // haptic on a fix the user never asked for. The flash window is short so it never
  // lingers after a second tap.
  // `ok` flashes "Uppdaterad ✓" in the verb slot; `fail` swaps the section footnote for a
  // reason. A haptic alone was the ONLY feedback on failure — invisible to anyone with
  // haptics off (or on a device that doesn't buzz), so a refresh that couldn't get a fix
  // looked identical to one that changed nothing. The footnote carries it rather than the
  // row, because it has the full card width and the row's verb slot does not.
  const [flash, setFlash] = useState<'ok' | 'fail' | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);
  const onRefreshTap = async (): Promise<void> => {
    const outcome = await refresh();
    // A fix was already in flight (double-tap) — don't double-signal.
    if (outcome === 'busy') return;
    const kind = outcome === 'ok' ? 'ok' : 'fail';
    // denied / error: the fix the user asked for didn't land. Warn instead of lying with a
    // success buzz + "Uppdaterad ✓" flash (the pre-branch code fired success unconditionally).
    if (kind === 'ok') hapticSuccess();
    else hapticWarning();
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(kind);
    // The failure line is prose the user has to read, so it lingers longer than the tick.
    flashTimer.current = setTimeout(() => setFlash(null), kind === 'ok' ? 1800 : 4000);
  };
  const justUpdated = flash === 'ok';

  // "Återställ till standard" — wipes every preference back to DEFAULT_SETTINGS
  // (method, madhab, location, theme, notifications, haptics, the lot). It's a
  // destructive, hard-to-undo action, so it's gated behind a native confirm; the
  // success haptic fires on the confirmed reset (outcome → Success per the buzz policy),
  // never on the mere tap that opens the dialog.
  const confirmReset = (): void => {
    Alert.alert(
      'Återställ inställningar?',
      'Alla inställningar återgår till appens standardvärden.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Återställ',
          style: 'destructive',
          onPress: () => {
            reset();
            hapticSuccess();
          },
        },
      ],
    );
  };

  // Today's times for the resolved location. Recomputes whenever a setting, the
  // location, or the date rolls over — this is how the user sees a setting "land".
  // Shared with the introduction's calculation step (lib/settings/usePrayerPreview).
  const preview = usePrayerPreview(coords, label, settings, now);

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

  const cityValue = settings.manualLocation?.name ?? 'Stockholm';
  const notificationsBlocked = notifications.blocked;
  const calcSummary = calculationSummary(settings);
  const settingsName = systemSettingsName();
  const notificationFootnote = notifications.footnote;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="close" fallback="/bonetider" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Inställningar</Text>

        <SettingSection
          title="Plats"
          // Only surface a footnote when GPS mode has something to say (granted/denied);
          // the manual mode is self-explanatory from the row's state.
          footnote={
            settings.locationMode === 'gps'
              ? flash === 'fail'
                ? 'Kunde inte hämta din plats. Kontrollera att platstjänster är på.'
                : permissionStatus === 'denied'
                  ? `Platsåtkomst nekad – visar standardplats. Tillåt i ${settingsName}.`
                  : // "Använder enhetens plats." was printed here in every non-denied state —
                    // including the one where no fix has landed and the row's value reads "—".
                    // The card then claimed to be using a location while showing none. Say
                    // which of the two is actually true.
                    source === 'gps'
                    ? 'Använder enhetens plats.'
                    : 'Ingen plats hämtad ännu – visar standardplats.'
              : undefined
          }
        >
          <OptionGroup
            options={LOCATION_MODE_OPTIONS}
            value={settings.locationMode}
            onChange={(locationMode) => update({ locationMode })}
          />
          {settings.locationMode === 'gps' ? (
            <>
              {/* "Uppdatera plats" is an action — accent reads as a tappable verb
                  (matches the iOS-Settings "Tap to share" pattern), with the resolved
                  place name muted on the right. After the GPS fix resolves we flash
                  "Uppdaterad ✓" briefly so the user knows the tap landed: a fresh fix
                  often returns the SAME tätort and the muted value on the right would
                  look unchanged otherwise. Paired with a hapticSuccess in onRefreshTap. */}
              <Pressable
                onPress={() => void onRefreshTap()}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={
                  locating
                    ? 'Hämtar plats'
                    : justUpdated
                      ? 'Plats uppdaterad'
                      : 'Uppdatera plats'
                }
              >
                {justUpdated && !locating ? (
                  <View style={styles.rowActionConfirm}>
                    <MaterialIcons name="check-circle" size={18} color={colors.accent} />
                    <Text style={styles.rowAction}>Uppdaterad</Text>
                  </View>
                ) : (
                  <Text style={styles.rowAction}>
                    {locating ? 'Hämtar plats…' : 'Uppdatera plats'}
                  </Text>
                )}
                <Text style={styles.rowValue} numberOfLines={1}>
                  {source === 'gps' ? label : '—'}
                </Text>
              </Pressable>
              {/* The footnote above names iOS-inställningar as the remedy; without this row
                  it named it and left the reader there. Meanwhile "Uppdatera plats" is a
                  button that CANNOT work once permission is denied — it re-asks, the OS
                  refuses silently, and the tap buys a warning buzz. This is the same row the
                  Notiser section below already uses for the same problem. */}
              {permissionStatus === 'denied' ? (
                <Pressable
                  onPress={openSystemSettings}
                  accessibilityRole="button"
                  accessibilityLabel={openSystemSettingsA11yLabel('plats')}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <Text style={styles.rowAction}>{openSystemSettingsLabel()}</Text>
                  <MaterialIcons name="open-in-new" size={18} color={colors.accent} />
                </Pressable>
              ) : null}
            </>
          ) : (
            // "Stad" is a label, not an action — ink, not accent. Value muted +
            // chevron on the right, like iOS's "Land · Sverige ›" pattern.
            <Pressable
              onPress={() => router.push('/(settings)/byt-plats')}
              accessibilityRole="button"
              accessibilityLabel={`Stad: ${cityValue}. Tryck för att byta.`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowLabel}>Stad</Text>
              <View style={styles.rowTrailing}>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {cityValue}
                </Text>
                <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
              </View>
            </Pressable>
          )}
        </SettingSection>

        {/* Beräkning sits second — after Plats — because it's what a user will
            tune once after choosing a city. A single-row card pushes the full
            Beräkning screen. It's a value-forward row (not a titled section):
            typography mirrors the Stad row inside Plats — label left, the current
            method body-weight right, chevron — because the *value* (which method
            is active) is what matters at a glance here, not a header. */}
        <Pressable
          onPress={() => router.push('/(settings)/berakning')}
          accessibilityRole="button"
          accessibilityLabel={`Beräkning: ${calcSummary}. Tryck för att ändra.`}
          style={({ pressed }) => [styles.card, styles.cardRow, pressed && styles.rowPressed]}
        >
          <Text style={styles.rowLabel}>Beräkning</Text>
          <View style={styles.rowTrailing}>
            <Text style={styles.rowValue}>{calcSummary}</Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
          </View>
        </Pressable>

        {/* Förhandsvisning — the verifier, open. It answers the two sections above it:
            "given this place and this method, here is today." The night-times switch
            shares the card on purpose — flipping it adds the two landmarks to the strip
            immediately above the switch, which is as short as the distance between a
            control and its effect can get. */}
        <SettingSection title="Förhandsvisning">
          <PreviewStrip preview={preview} />
          {/* Nattens tider — nattens mitt och sista tredjedel, räknade från Maghrib till
              nästa Fajr. Av som standard: det är frivilliga hållpunkter, inte bönetider,
              och en läsare som inte bett om dem ska inte få dem i en lista över
              förpliktelser. Visas som egna rader under de sex, aldrig blandade in bland
              dem. Se lib/night-times.ts. */}
          <Toggle
            label="Visa nattens tider"
            description="Nattens mitt och sista tredjedel, räknat från Maghrib till Fajr."
            value={settings.showNightTimes}
            onValueChange={(showNightTimes) => update({ showNightTimes })}
            divider
          />
        </SettingSection>

        <SettingSection
          title="Notiser"
          // Quiet privacy reassurance — 2026 expectation, especially for a faith
          // app. Only shown when notifications are on (where the user has just
          // granted OS permission and is most likely to wonder where the data goes).
          // When they are BLOCKED it carries the reason instead, which is why there is
          // no separate "Status" row any more: the footnote said it, a status row said
          // it again, and the action row below said it a third time.
          footnote={notificationFootnote}
        >
          <Toggle
            label="Påminn om bönetider"
            value={settings.notifications.enabled}
            onValueChange={onNotificationsToggle}
          />
          {notificationsBlocked ? (
            <Pressable
              onPress={openSystemSettings}
              accessibilityRole="button"
              accessibilityLabel={openSystemSettingsA11yLabel('notiser')}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowAction}>{openSystemSettingsLabel()}</Text>
              <MaterialIcons name="open-in-new" size={18} color={colors.accent} />
            </Pressable>
          ) : null}
          {/* The per-alert detail — lead time and sound, per prayer, plus the
              Fajr-window marker — lives on its own screen. It is a Stad-style row:
              the VALUE (how many prayers, how early) is what matters at a glance, so
              it carries the summary and the chevron rather than a section header. */}
          {settings.notifications.enabled ? (
            <Pressable
              onPress={() => router.push('/(settings)/notiser')}
              accessibilityRole="button"
              accessibilityLabel={`Påminnelser: ${notificationSummary(settings)}. Tryck för att ändra.`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowLabel}>Påminnelser</Text>
              <View style={styles.rowTrailing}>
                <Text style={styles.rowValue}>{notificationSummary(settings)}</Text>
                <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
              </View>
            </Pressable>
          ) : null}
        </SettingSection>

        {/* Karta — the two optional layers. Both toggles' own descriptions already say
            "på kartan", which is the clue that they never belonged under "Utseende":
            they are not how the app looks, they are what the map draws. */}
        <SettingSection title="Karta">
          {/* Moskéer — Sweden's mosques as quiet POIs, revealed as you zoom into a
              city. On by default; off leaves a pure solar field. See MosqueLayer. */}
          <Toggle
            label="Visa moskéer"
            description="Moskéer visas på kartan när du zoomar in."
            value={settings.showMosques}
            onValueChange={(showMosques) => update({ showMosques })}
          />
          {/* Qibla — the great-circle direction to Mecca, drawn from your dot. On by
              default: it works where the compass doesn't (indoors, near metal) and is an
              independent check on the Qibla sheet. See skia/QiblaArc. */}
          <Toggle
            label="Visa qibla-riktning"
            description="En linje på kartan mot Mecka från din plats."
            value={settings.showQibla}
            onValueChange={(showQibla) => update({ showQibla })}
            divider
          />
        </SettingSection>

        {/* Tema — Apple Maps-style theme override; defaults to "Följ system" (the OS
            Display setting decides). The dock, basemap, wash and prayer-line colours
            all swap together the instant the user picks a row, via useActiveScheme().
            Alone in its section now: with the map layers and the calendar offset moved
            out, "Utseende" finally means only what it says. */}
        <SettingSection title="Utseende" footnote="Påverkar kartan och hela appen.">
          <OptionGroup
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(theme) => update({ theme })}
          />
        </SettingSection>

        {/* Hijri-kalender — a ±2-day nudge so the app's Hijri date matches the local
            moon sighting the reader follows. A calendar correction, never an appearance
            one; the footnote shows the resulting date so the stepper has the same
            watch-it-land feedback the strip gives the times. */}
        <SettingSection
          title="Hijri-kalender"
          footnote={`I dag: ${preview.hijri}. Justera för att matcha lokal månsiktning.`}
        >
          <Stepper
            label="Dagar"
            value={settings.hijriOffset}
            min={HIJRI_OFFSET_MIN}
            max={HIJRI_OFFSET_MAX}
            format={(v) => `${v > 0 ? '+' : ''}${v} d`}
            onChange={(hijriOffset) => update({ hijriOffset })}
          />
        </SettingSection>

        {/* Haptik — a single app-wide on/off for haptic feedback. Its own titled
            section because it governs *feel*, not appearance, and is a set-once
            preference worth surfacing. The Switch itself stays haptic-free: a native
            control carries its own affordance. */}
        <SettingSection title="Haptik">
          <Toggle
            label="Haptisk återkoppling"
            description="Små vibrationer vid val, lås och dragning."
            value={settings.haptics}
            onValueChange={(haptics) => update({ haptics })}
          />
        </SettingSection>

        {/* --- Stöd: secondary cluster. Visually demoted with extra top air and
            an untitled card of plain single-line rows. No subtitles on purpose:
            keyword-chain subtitles ("Mejl, betyg, islam.se") read as forced
            sorting — when the labels are already honest, the row title carries
            the meaning. Version sits in the colophon below, where imprint
            belongs. --- */}
        <View style={styles.supportTop}>
          <SettingSection>
            {/* The introduction is the only place that explains what the map's lines
                mean, and it runs once. This is the door back to it — for the user who
                skipped it, and for every install that predates it (lib/intro treats an
                existing settings blob as "already seen", so those users never got it
                automatically). Dismiss the whole settings modal stack first, then open
                it over the map: the flow is a root-level screen, not a settings page. */}
            <LinkRow
              styles={styles}
              colors={colors}
              label="Visa introduktionen igen"
              onPress={() => {
                replay();
                if (router.canDismiss()) router.dismissAll();
                router.navigate('/valkommen');
              }}
            />
            <LinkRow
              styles={styles}
              colors={colors}
              label="Vanliga frågor"
              onPress={() => router.push('/(settings)/vanliga-fragor')}
              divider
            />
            {/* Kontakt = mail. No intermediate screen — tapping the row opens
                the native mail composer directly (falls back to mailto: if no
                composer is available). Opening a screen with a single mail row
                was friction without payoff. */}
            <LinkRow
              styles={styles}
              colors={colors}
              label="Kontakt"
              onPress={emailSupport}
              divider
            />
            <LinkRow
              styles={styles}
              colors={colors}
              label="Om appen"
              onPress={() => router.push('/om')}
              divider
            />
          </SettingSection>
        </View>

        {/* Återställ till standard — a global reset at the foot of the screen (the
            conventional terminal-action slot, below the support shelf, above the
            colophon).
            
            Two guards, in order of strength. It is ABSENT while every preference is
            still at its default: the wipe cannot change anything then, and a user who
            has never touched a setting never meets the one destructive control on the
            screen. And it is drawn in muted ink rather than the accent the screen uses
            for its safe verbs ("Uppdatera plats", "Öppna inställningar") — wearing the
            same colour as those made it read as an equally harmless tap. The native
            confirm in confirmReset stays the real guard against an accidental wipe. */}
        {isDefaultSettings(settings) ? null : (
          <Pressable
            onPress={confirmReset}
            accessibilityRole="button"
            accessibilityLabel="Återställ alla inställningar till appens standard"
            style={({ pressed }) => [styles.resetButton, pressed && styles.rowPressed]}
          >
            <MaterialIcons name="settings-backup-restore" size={18} color={colors.textMuted} />
            <Text style={styles.resetLabel}>Återställ appens standard</Text>
          </Pressable>
        )}

        {/* A quiet sign-off at the end of the screen — project line + version +
            © in the faintest ink tier, the natural imprint position. The OTA line
            sits underneath so a user (or I, debugging "did the update arrive?")
            can see at a glance which JS bundle is actually running: an applied
            OTA (id prefix + publish date) or the binary's embedded bundle. */}
        <Text style={styles.colophon}>islam.se · Version {APP_VERSION} · © 2026</Text>
        <Text style={styles.colophonSub}>{OTA_LABEL}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// A list-style navigation row: single-line label + trailing chevron. Used in
// the Stöd cluster at the bottom of Inställningar where the trio reads as one
// quiet shelf. Sparse on purpose — honest labels don't need subtitles.
function LinkRow({
  styles,
  colors,
  label,
  onPress,
  divider = false,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: SettingsColors;
  label: string;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.linkRow,
        divider && styles.linkRowDivider,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={styles.linkLabel}>{label}</Text>
      <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },

    // Editorial screen title — same token as Qibla's title so the sibling sheets share rhythm.
    header: { ...type.title, color: colors.text, marginBottom: space.xl, marginTop: space.xs },

    // --- Generic in-card row (used inside Plats, and as the Beräkning card) -
    // 48pt min — comfortable touch target without feeling cramped.
    row: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      minHeight: 48,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: space.md,
    },
    rowPressed: { backgroundColor: colors.accentSoft },
    rowLabel: { ...type.body, color: colors.text, flexShrink: 0 }, // labels: ink (not accent)
    rowAction: { ...type.body, color: colors.accent, flexShrink: 0 }, // verbs: accent
    // The momentary "Uppdaterad ✓" confirmation slot — icon + accent text in the same
    // optical position as the verb, so the swap reads as the verb's success state.
    rowActionConfirm: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    // Trailing values yield before the leading label/action. Together with `row.gap`,
    // this prevents joined text such as "Uppdatera platsDin plats" on compact screens.
    rowValue: { ...type.body, color: colors.textMuted, flexShrink: 1, textAlign: 'right' },
    rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },

    // Single-row card variant for the Beräkning push.
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: space.xxl,
    },
    cardRow: {
      borderTopWidth: 0, // no separator: this is a standalone card, not a row inside one
      paddingVertical: 14,
      minHeight: 56,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: space.lg,
    },

    // --- Stöd cluster (FAQ / Kontakt / Om appen) --------------------------
    // Extra top air signals the IA gear-shift: above = configuration, below =
    // secondary support. SettingSection already wraps its own xxl bottom gap.
    supportTop: { marginTop: space.sm },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      minHeight: 48,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    },
    linkRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    linkLabel: { ...type.body, color: colors.text, flex: 1 },

    // Reset action: centred icon + MUTED label — the one control on the screen that
    // must not invite a tap, so it deliberately sits outside the "verbs are accent"
    // rule the rest of the screen follows. Self-sizing so the tap target hugs the text
    // rather than spanning the width like a primary CTA.
    resetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      gap: space.sm,
      marginTop: space.xl,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      borderRadius: radius.md,
    },
    resetLabel: { ...type.body, color: colors.textMuted },

    // Centered, faintest ink, no card chrome — a paper-edge colophon. The palette's
    // faint tier (not an opacity over muted) so secondary text steps down the same
    // ladder here as everywhere else: ink → inkMuted → inkFaint.
    colophon: {
      ...type.micro,
      color: colors.textFaint,
      textAlign: 'center',
      marginTop: space.sm,
    },
    // OTA line — quieter still than the colophon (one opacity step below the faint
    // tier, no bottom air until the screen end), so it reads as a subsidiary
    // debug-y imprint, not as a second sign-off.
    colophonSub: {
      ...type.micro,
      color: colors.textFaint,
      textAlign: 'center',
      opacity: 0.65,
      marginBottom: space.lg,
    },
  });
}
