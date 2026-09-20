// Inställningar — the configuration sheet over the map. Information architecture,
// in priority order for a Swedish-Muslim user:
//   1. Plats             — GPS or one of ~2,100 Swedish towns.
//   2. Beräkning         — calculation method, madhab, high-lat rule, polar resolution,
//      shafaq, avrundning, per-prayer minute offsets (pushed page).
//   3. Förhandsvisning   — today's times for the resolved location, ALWAYS VISIBLE as a
//      compact strip, with the night-times switch in the same card so the toggle's
//      effect appears directly above the control that caused it.
//   4. Notiser           — local reminders per prayer.
//   5. Karta             — the four map layers (moskéer, gravkvarter, qibla, månen).
//   6. Appen             — theme, haptics, the Hijri day offset: the preferences that are
//      about the app itself rather than about a place, a calculation, an alert or the map.
//   7. Stöd (untitled)   — Vanliga frågor / Kontakt / Om appen (clustered into one
//      list-style card, visually demoted with extra top air).
//
// Section 6 is a MERGE, and the opposite mistake to the one described below. Theme,
// haptics and the Hijri offset each used to carry a titled section of their own holding
// exactly one control ("Utseende", "Haptik", "Hijri-kalender"). A heading that names one
// control names it twice, and three in a row spent two full section gaps saying nothing.
// The test that tells this apart from the junk drawer is the same one: a group must be
// able to state its own state. "Följ system · haptik på · Hijri ±0" does; "Utseende" over
// six unrelated switches did not.
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
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavRow } from '@/components/settings/NavRow';
import { OptionGroup } from '@/components/settings/OptionGroup';
import { SegmentedChoice } from '@/components/settings/SegmentedChoice';
import { Icon } from '@/components/ui/Icon';
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
  openNotificationSettings,
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

  // ⚠️ A DOOR THAT DID NOT REACH ITS ROOM. Månen's almanac carries a note reading
  // "Justera Hijri-datum" (lib/moon/readout), and pressing it pushed this screen and
  // stopped there — dropping the reader at the top of a sheet with the control they were
  // sent for several sections below the fold. `?fokus=appen` scrolls it into view instead.
  // Deliberately a scroll and not a highlight: the reader asked to go somewhere, not to be
  // told where it is.
  const { fokus } = useLocalSearchParams<{ fokus?: string }>();
  const scroller = useRef<ScrollView>(null);
  const appSectionY = useRef(0);
  const focused = useRef(false);
  useEffect(() => {
    if (fokus !== 'appen' || focused.current || !loaded) return;
    focused.current = true;
    // One frame after layout, so appSectionY holds a measured offset rather than 0.
    const id = setTimeout(
      () => scroller.current?.scrollTo({ y: Math.max(0, appSectionY.current - space.lg), animated: true }),
      0,
    );
    return () => clearTimeout(id);
  }, [fokus, loaded]);

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
      <ScrollView ref={scroller} contentContainerStyle={styles.content}>
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
                  : source === 'gps'
                    ? undefined
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
              <NavRow
                variant="action"
                divider
                leadingIcon={justUpdated && !locating ? 'checkCircle' : undefined}
                label={
                  justUpdated && !locating
                    ? 'Uppdaterad'
                    : locating
                      ? 'Hämtar plats…'
                      : 'Uppdatera plats'
                }
                value={source === 'gps' ? label : '–'}
                onPress={() => void onRefreshTap()}
                accessibilityLabel={
                  locating ? 'Hämtar plats' : justUpdated ? 'Plats uppdaterad' : 'Uppdatera plats'
                }
              />
              {/* The footnote above names iOS-inställningar as the remedy; without this row
                  it named it and left the reader there. Meanwhile "Uppdatera plats" is a
                  button that CANNOT work once permission is denied — it re-asks, the OS
                  refuses silently, and the tap buys a warning buzz. This is the same row the
                  Notiser section below already uses for the same problem. */}
              {permissionStatus === 'denied' ? (
                <NavRow
                  variant="external"
                  divider
                  label={openSystemSettingsLabel()}
                  onPress={openSystemSettings}
                  accessibilityLabel={openSystemSettingsA11yLabel('plats')}
                />
              ) : null}
            </>
          ) : (
            // "Stad" is a label, not an action — ink, not accent. Value muted +
            // chevron on the right, like iOS's "Land · Sverige ›" pattern.
            <NavRow
              divider
              label="Stad"
              value={cityValue}
              onPress={() => router.push('/(settings)/byt-plats')}
              accessibilityLabel={`Stad: ${cityValue}. Tryck för att byta.`}
            />
          )}
        </SettingSection>

        {/* Beräkning sits second — after Plats — because it's what a user will
            tune once after choosing a city. A single-row card pushes the full
            Beräkning screen. It's a value-forward row (not a titled section):
            typography mirrors the Stad row inside Plats — label left, the current
            method body-weight right, chevron — because the *value* (which method
            is active) is what matters at a glance here, not a header. */}
        <SettingSection>
          <NavRow
            label="Beräkning"
            value={calcSummary}
            onPress={() => router.push('/(settings)/berakning')}
            accessibilityLabel={`Beräkning: ${calcSummary}. Tryck för att ändra.`}
          />
        </SettingSection>

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
          {/* The description names only the DERIVATION. It used to open with "Nattens mitt
              och sista tredjedel", which is exactly what the two rows appearing in the
              strip above are about to be called — the caption spent its first clause
              naming things the reader was one tap from reading for themselves. How they
              are reckoned is the part no row can show. */}
          <Toggle
            label="Visa nattens tider"
            description="Räknas från Maghrib till nästa Fajr."
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
            <NavRow
              variant="external"
              divider
              label={openSystemSettingsLabel()}
              onPress={openNotificationSettings}
              accessibilityLabel={openSystemSettingsA11yLabel('notiser')}
            />
          ) : null}
          {/* The per-alert detail — lead time and sound, per prayer, plus the
              Fajr-window marker — lives on its own screen. It is a Stad-style row:
              the VALUE (how many prayers, how early) is what matters at a glance, so
              it carries the summary and the chevron rather than a section header. */}
          {settings.notifications.enabled ? (
            <NavRow
              divider
              label="Påminnelser"
              value={notificationSummary(settings)}
              onPress={() => router.push('/(settings)/notiser')}
              accessibilityLabel={`Påminnelser: ${notificationSummary(settings)}. Tryck för att ändra.`}
            />
          ) : null}
        </SettingSection>

        {/* Karta — the two optional layers. Both toggles' own descriptions already say
            "på kartan", which is the clue that they never belonged under "Utseende":
            they are not how the app looks, they are what the map draws. */}
        {/* The two place layers used to carry a description each — "Moskéer visas på
            kartan när du zoomar in." and "Muslimska gravkvarter visas på kartan när du
            zoomar in." — which are the same sentence with one noun swapped, each saying
            back the name of the switch it sat under. The one fact they shared (these
            appear only once you are close enough) is worth keeping and is now said once,
            below the card, where it also covers the qibla and moon rows. */}
        <SettingSection
          title="Karta"
          footnote="Moskéer och gravkvarter ritas först när du zoomar in på en ort."
        >
          {/* Moskéer — Sweden's mosques as quiet POIs, revealed as you zoom into a
              city. On by default; off leaves a pure solar field. See MosqueLayer. */}
          <Toggle
            label="Visa moskéer"
            value={settings.showMosques}
            onValueChange={(showMosques) => update({ showMosques })}
          />
          {/* Gravkvarter — the Muslim sections of Swedish cemeteries, drawn the way the
              mosques are: a glyph as you zoom into a town, a card with directions on tap.
              On by default. See BurialGroundLayer. */}
          <Toggle
            label="Visa gravkvarter"
            value={settings.showBurialGrounds}
            onValueChange={(showBurialGrounds) => update({ showBurialGrounds })}
            divider
          />
          {/* Qibla — the great-circle direction to Mecca, drawn from your dot. On by
              default: it works where the compass doesn't (indoors, near metal) and is an
              independent check on the Qibla sheet. See map/LocationLayer. */}
          <Toggle
            label="Visa qibla-riktning"
            value={settings.showQibla}
            onValueChange={(showQibla) => update({ showQibla })}
            divider
          />
          {/* Månen — the disc beside the compass. It carries a DESCRIPTION where the qibla
              toggle above needs none, because the two hide different kinds of thing: the
              qibla arc is a decoration and its screen stays reachable from the compass,
              while this disc is the only door to Månen. A reader turning it off should know
              what leaves with it. */}
          <Toggle
            label="Visa månen"
            description="Knappen bredvid kompassen, som öppnar månfasen och månadens dagar."
            value={settings.showMoon}
            onValueChange={(showMoon) => update({ showMoon })}
            divider
          />
        </SettingSection>

        {/* APPEN — the three preferences that are about the app itself rather than about
            a place, a calculation, an alert or the map. Each used to carry its own titled
            section holding exactly one control: "Utseende" over a segmented picker,
            "Hijri-kalender" over a stepper, "Haptik" over a switch. A heading that names
            one control names it twice, and three of them in a row cost two full section
            gaps to say nothing.

            This is NOT the junk drawer the header comment above warns about. That group
            failed its own test — it could only list the topics it contained, because no
            value described it. This one states itself: "Följ system · haptik på · Hijri
            ±0". Three independent preferences with values, not a word thrown over
            unrelated machinery.

            Order matters: the Hijri stepper goes LAST so the live footnote below the card
            — the resulting date, which moves as the stepper moves — still sits directly
            under the control it answers to. */}
        <View onLayout={(e) => { appSectionY.current = e.nativeEvent.layout.y; }}>
          <SettingSection
            title="Appen"
            footnote={`I dag: ${preview.hijri}. Justera Hijri-dagar för att matcha lokal månsiktning.`}
          >
            {/* Tema — Apple Maps-style theme override; defaults to "Följ system" (the OS
                Display setting decides). The dock, basemap, wash and prayer-line colours
                all swap together the instant the user picks a row, via useActiveScheme().
                A segmented control everywhere else the reader has ever met it — three
                short, exclusive, familiar options. It is the one control here that cannot
                name itself, so it takes the `label` prop; the section title used to do
                that job. See SegmentedChoice. */}
            <SegmentedChoice
              label="Tema"
              options={THEME_OPTIONS}
              value={settings.theme}
              onChange={(theme) => update({ theme })}
            />
            {/* Haptik — a single app-wide on/off. The description names WHERE the app
                buzzes, which no switch can show. The Switch itself stays haptic-free: a
                native control carries its own affordance (the row press does not — see
                Toggle). */}
            <Toggle
              label="Haptisk återkoppling"
              description="Små vibrationer vid val, lås och dragning."
              value={settings.haptics}
              onValueChange={(haptics) => update({ haptics })}
              divider
            />
            {/* Hijri-kalender — a ±2-day nudge so the app's Hijri date matches the local
                moon sighting the reader follows. A calendar correction, never a
                calculation one: hijriOffset is read by the Hijri date, the moon screen and
                the day picker, and never by the prayer-time math. */}
            <Stepper
              label="Hijri-dagar"
              value={settings.hijriOffset}
              min={HIJRI_OFFSET_MIN}
              max={HIJRI_OFFSET_MAX}
              format={(v) => `${v > 0 ? '+' : ''}${v} d`}
              onChange={(hijriOffset) => update({ hijriOffset })}
              divider
            />
          </SettingSection>
        </View>

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
            <NavRow
              label="Visa introduktionen igen"
              onPress={() => {
                replay();
                if (router.canDismiss()) router.dismissAll();
                router.navigate('/valkommen');
              }}
            />
            <NavRow
              label="Vanliga frågor"
              onPress={() => router.push('/(settings)/vanliga-fragor')}
              divider
            />
            {/* Kontakt = mail. No intermediate screen — tapping the row opens
                the native mail composer directly (falls back to mailto: if no
                composer is available). Opening a screen with a single mail row
                was friction without payoff. */}
            <NavRow label="Kontakt" onPress={emailSupport} divider />
            <NavRow label="Om appen" onPress={() => router.push('/om')} divider />
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
            <Icon name="settingsRestore" size={18} color={colors.textMuted} />
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

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },

    // Editorial screen title — same token as Qibla's title so the sibling sheets share rhythm.
    header: { ...type.title, color: colors.text, marginBottom: space.xl, marginTop: space.xs },

    rowPressed: { backgroundColor: colors.accentSoft },

    // --- Stöd cluster (FAQ / Kontakt / Om appen) --------------------------
    // Extra top air signals the IA gear-shift: above = configuration, below =
    // secondary support. SettingSection already wraps its own xxl bottom gap.
    supportTop: { marginTop: space.sm },

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
