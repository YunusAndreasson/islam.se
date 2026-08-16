// Inställningar — the configuration sheet over the map. Information architecture,
// in priority order for a Swedish-Muslim user:
//   1. Plats             — GPS or one of ~2,100 Swedish towns.
//   2. Beräkning         — calculation method, madhab, high-lat rule, polar resolution,
//      shafaq, per-prayer minute offsets (pushed page).
//   3. Förhandsvisning   — today's times for the resolved location, COLLAPSED by default
//      (a DisclosureGroup that folds out inside this screen). This is a *verifier*,
//      not the screen's purpose: the dock already shows the next prayer, and the
//      settings screen is for setting up the app. Folding it keeps the configuration
//      surfaces (Plats, Beräkning, Notiser) above the fold.
//   4. Notiser           — local reminders per prayer.
//   5. Visning           — rounding + Hijri-day offset + theme (collapsed by default).
//   6. Stöd (untitled)   — Vanliga frågor / Kontakt / Om appen (clustered into one
//      list-style card, visually demoted with extra top air).
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisclosureGroup } from '@/components/settings/DisclosureGroup';
import { OptionGroup } from '@/components/settings/OptionGroup';
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
} from '@/lib/settings/types';
import {
  LOCATION_MODE_OPTIONS,
  calculationSummary,
  notificationSummary,
  ROUNDING_OPTIONS,
  THEME_OPTIONS,
  VISNING_SUMMARY,
} from '@/lib/settings/options';
import { systemSettingsName } from '@/lib/system-settings';
import { mono, radius, space, type } from '@/theme/tokens';

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
  const notificationStatus = notifications.statusLabel;
  const calcSummary = calculationSummary(settings);
  const settingsName = systemSettingsName();
  const notificationFootnote = notifications.footnote;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="close" fallback="/bonetider" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Inställningar</Text>

        {/* --- Core IA: Plats / Beräkning / Förhandsvisning / Notiser / Utseende --- */}

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
                  : 'Använder enhetens plats.'
              : undefined
          }
        >
          <OptionGroup
            options={LOCATION_MODE_OPTIONS}
            value={settings.locationMode}
            onChange={(locationMode) => update({ locationMode })}
          />
          {settings.locationMode === 'gps' ? (
            // "Uppdatera plats" is an action — accent reads as a tappable verb
            // (matches the iOS-Settings "Tap to share" pattern), with the resolved
            // place name muted on the right. After the GPS fix resolves we flash
            // "Uppdaterad ✓" briefly so the user knows the tap landed: a fresh fix
            // often returns the SAME tätort and the muted value on the right would
            // look unchanged otherwise. Paired with a hapticSuccess in onRefreshTap.
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

        {/* Förhandsvisning — collapsed by default. A verifier folded inside the
            settings screen (NOT a separate route) so the user can confirm that
            their picks produce sensible times for today, without the prayer
            list occupying the prime above-the-fold real estate of a screen
            whose job is configuration. Summary line carries today's date +
            place so the collapsed header alone still says "what this would
            show". */}
        <DisclosureGroup title="Förhandsvisning" summary={preview.gregorian}>
          <View>
            <View style={styles.previewHead}>
              <Text style={styles.previewDate}>{preview.gregorian}</Text>
              <Text style={styles.previewHijri}>{preview.hijri}</Text>
            </View>
            {preview.times.map((p, i) => (
              <View key={p.key} style={[styles.previewRow, i > 0 && styles.previewDivider]}>
                {/* Decorative: the row's text already names the prayer. Icon fonts render
                    their glyph as a private-use codepoint, so left in the tree a screen
                    reader announces "󰼱" as an unknown symbol before every prayer. */}
                <MaterialCommunityIcons
                  name={p.icon}
                  size={22}
                  color={colors.textMuted}
                  style={styles.previewIcon}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <View style={styles.previewLabelWrap}>
                  <Text style={[styles.previewLabel, p.muted && styles.previewMarkerText]}>
                    {p.label}
                  </Text>
                  <Text style={[styles.previewSwedish, p.muted && styles.previewMarkerSub]}>
                    {p.swedishName}
                  </Text>
                </View>
                <Text
                  testID={`preview-time-${p.key}`}
                  style={[styles.previewTime, p.muted && styles.previewMarkerText]}
                >
                  {p.time}
                </Text>
              </View>
            ))}
          </View>
        </DisclosureGroup>

        <SettingSection
          title="Notiser"
          // Quiet privacy reassurance — 2026 expectation, especially for a faith
          // app. Only shown when notifications are on (where the user has just
          // granted OS permission and is most likely to wonder where the data goes).
          footnote={notificationFootnote}
        >
          <Toggle
            label="Påminn om bönetider"
            value={settings.notifications.enabled}
            onValueChange={onNotificationsToggle}
          />
          {settings.notifications.enabled ? (
            <View style={[styles.row, styles.rowDivider]}>
              <Text style={styles.rowLabel}>Status</Text>
              <Text
                style={[styles.rowValue, notificationsBlocked && styles.rowValueWarning]}
              >
                {notificationStatus}
              </Text>
            </View>
          ) : null}
          {notificationsBlocked ? (
            <Pressable
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
              accessibilityLabel={`Öppna ${settingsName} för notiser`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowAction}>Öppna {settingsName}</Text>
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

        {/* Utseende och format — appearance first (Tema), then the format knobs
            (Avrundning, Hijri). The order mirrors the group title ("utseende" then
            "format") and the collapsed summary, and surfaces the one control a
            user actually reaches for here — the light/dark theme — at the very top. */}
        <DisclosureGroup title="Utseende" summary={VISNING_SUMMARY}>
          {/* Tema — Apple Maps-style theme override; defaults to "Följ system" (the OS
              Display setting decides). The dock, basemap, wash and prayer-line colours
              all swap together the instant the user picks a row, via useActiveScheme().
              Titled "Tema" (not "Utseende") so it doesn't echo the group name. */}
          <SubGroup styles={styles} title="Tema" footnote="Påverkar kartan och hela appen.">
            <OptionGroup
              options={THEME_OPTIONS}
              value={settings.theme}
              onChange={(theme) => update({ theme })}
            />
          </SubGroup>

          {/* Moskéer — Sweden's mosques as quiet POIs, revealed as you zoom into a
              city. On by default; off leaves a pure solar field. See MosqueLayer. */}
          <Toggle
            label="Visa moskéer"
            description="Moskéer visas på kartan när du zoomar in."
            value={settings.showMosques}
            onValueChange={(showMosques) => update({ showMosques })}
            divider
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

          {/* Nattens tider — nattens mitt och sista tredjedel, räknade från Maghrib till
              nästa Fajr. Av som standard: det är frivilliga hållpunkter, inte bönetider,
              och en läsare som inte bett om dem ska inte få dem i en lista över
              förpliktelser. Visas som en egen grupp under de sex raderna, aldrig blandade
              in bland dem. Se lib/night-times.ts. */}
          <Toggle
            label="Visa nattens tider"
            description="Nattens mitt och sista tredjedel, räknat från Maghrib till Fajr."
            value={settings.showNightTimes}
            onValueChange={(showNightTimes) => update({ showNightTimes })}
            divider
          />

          {/* Avrundning shapes the displayed time string. Per-prayer minute offsets
              used to live here too — they moved to Beräkning, alongside the other
              adhan CalculationParameters, where they conceptually belong. */}
          <SubGroup styles={styles} title="Avrundning" divider>
            <OptionGroup
              options={ROUNDING_OPTIONS}
              value={settings.rounding}
              onChange={(rounding) => update({ rounding })}
            />
          </SubGroup>

          <SubGroup
            styles={styles}
            title="Hijri-justering"
            footnote={`I dag: ${preview.hijri}. Justera för att matcha lokal månsiktning.`}
            divider
          >
            <Stepper
              label="Dagar"
              value={settings.hijriOffset}
              min={HIJRI_OFFSET_MIN}
              max={HIJRI_OFFSET_MAX}
              format={(v) => `${v > 0 ? '+' : ''}${v} d`}
              onChange={(hijriOffset) => update({ hijriOffset })}
            />
          </SubGroup>
        </DisclosureGroup>

        {/* Haptik — a single app-wide on/off for haptic feedback. Its own titled
            section (not folded into Utseende) because it governs *feel*, not
            appearance, and is a set-once preference worth surfacing. The Switch
            itself stays haptic-free: a native control carries its own affordance. */}
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
            colophon). Quiet by default; the native confirm in confirmReset is the
            real guard against an accidental wipe. */}
        <Pressable
          onPress={confirmReset}
          accessibilityRole="button"
          accessibilityLabel="Återställ alla inställningar till appens standard"
          style={({ pressed }) => [styles.resetButton, pressed && styles.rowPressed]}
        >
          <MaterialIcons name="settings-backup-restore" size={18} color={colors.accent} />
          <Text style={styles.resetLabel}>Återställ appens standard</Text>
        </Pressable>

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
      <Text style={styles.subTitle}>{title}</Text>
      {children}
      {footnote ? <Text style={styles.subFootnote}>{footnote}</Text> : null}
    </View>
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

    // --- Förhandsvisning (inside DisclosureGroup; the group provides the outer
    // card chrome, so the head and rows here only carry padding + dividers). ---
    previewHead: {
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    // Headline rhythm: date is the *answer*, Hijri the calendar pair under it.
    previewDate: { ...type.headline, color: colors.text },
    previewHijri: { ...type.caption, color: colors.textMuted, marginTop: 2 },
    previewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      minHeight: 52,
    },
    previewDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    // Solar-cycle glyph on the left of each row — small, ink-muted, sits in
    // the same vertical rhythm as the two-line label block beside it.
    previewIcon: { marginRight: space.md, width: 22 },
    // Two-line label block: transliterated name body weight, Swedish translation
    // caption-muted below.
    previewLabelWrap: { flex: 1 },
    previewLabel: { ...type.body, color: colors.text },
    previewSwedish: { ...type.caption, color: colors.textMuted, marginTop: 1 },
    previewTime: { ...type.body, ...mono, color: colors.text },
    previewMarkerText: { color: colors.textMuted },
    previewMarkerSub: { opacity: 0.8 },

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
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    rowLabel: { ...type.body, color: colors.text, flexShrink: 0 }, // labels: ink (not accent)
    rowAction: { ...type.body, color: colors.accent, flexShrink: 0 }, // verbs: accent
    // The momentary "Uppdaterad ✓" confirmation slot — icon + accent text in the same
    // optical position as the verb, so the swap reads as the verb's success state.
    rowActionConfirm: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    // Trailing values yield before the leading label/action. Together with `row.gap`,
    // this prevents joined text such as "Uppdatera platsDin plats" on compact screens.
    rowValue: { ...type.body, color: colors.textMuted, flexShrink: 1, textAlign: 'right' },
    rowValueWarning: { color: colors.accent, fontWeight: '600' },
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

    // Reset action: centred icon + accent label (the screen's "verbs are accent"
    // rule), self-sizing so the tap target hugs the text rather than spanning the
    // width like a primary CTA — a deliberate, demoted control.
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
    resetLabel: { ...type.body, color: colors.accent, fontWeight: '600' },

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

    // --- Sub-sections within a DisclosureGroup ----------------------------
    sub: { paddingBottom: space.md },
    subDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    subTitle: {
      ...type.label,
      color: colors.textMuted,
      paddingHorizontal: space.lg,
      paddingTop: 14,
      paddingBottom: space.xs,
    },
    subFootnote: {
      ...type.caption,
      color: colors.textMuted,
      paddingHorizontal: space.lg,
      paddingTop: space.sm,
    },
  });
}
