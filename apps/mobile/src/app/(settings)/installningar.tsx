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
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DisclosureGroup } from '@/components/settings/DisclosureGroup';
import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { Stepper } from '@/components/settings/Stepper';
import { type SettingsColors, useSettingsColors } from '@/components/settings/theme';
import { Toggle } from '@/components/settings/Toggle';
import { ModalBar } from '@/components/ui/ModalBar';
import { APP_VERSION, OTA_LABEL, emailSupport } from '@/lib/about';
import { hapticSuccess } from '@/lib/haptics';
import { formatGregorian, formatHijri } from '@/lib/hijri';
import { useLocation } from '@/lib/location/context';
import { NOTIFY_PRAYERS } from '@/lib/notifications';
import {
  computePrayerTimes,
  formatTime,
  PRAYER_ICONS,
  PRAYER_LABELS,
  PRAYER_ORDER,
  PRAYER_SWEDISH_NAMES,
} from '@/lib/prayer-times';
import { useSettings } from '@/lib/settings/context';
import {
  MAP_STYLE_OPTIONS,
  methodLabel,
  ROUNDING_OPTIONS,
  THEME_OPTIONS,
  visningSummary,
} from '@/lib/settings/options';
import { mono, space, type } from '@/theme/tokens';

export default function Installningar() {
  const { settings, loaded, update } = useSettings();
  const { coords, label, source, permissionStatus, locating, refresh } = useLocation();
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

  // "Uppdatera position" confirmation — a brief "Uppdaterad ✓" flash after a TAP-initiated
  // refresh resolves, so the user knows the action did something. Auto-acquires (mount /
  // permission flip) do NOT trigger this — we'd be lying about user intent and firing a
  // haptic on a fix the user never asked for. The flash window is short so it never
  // lingers after a second tap.
  const [justUpdated, setJustUpdated] = useState(false);
  const justUpdatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (justUpdatedTimer.current) clearTimeout(justUpdatedTimer.current);
  }, []);
  const onRefreshTap = async (): Promise<void> => {
    await refresh();
    hapticSuccess();
    if (justUpdatedTimer.current) clearTimeout(justUpdatedTimer.current);
    setJustUpdated(true);
    justUpdatedTimer.current = setTimeout(() => setJustUpdated(false), 1800);
  };

  // Today's times for the resolved location. Recomputes whenever a setting, the
  // location, or the date rolls over — this is how the user sees a setting "land".
  const preview = useMemo(() => {
    const pt = computePrayerTimes(coords, now, settings);
    return {
      gregorian: `${formatGregorian(now)} · ${label}`,
      hijri: formatHijri(now, settings.hijriOffset),
      times: PRAYER_ORDER.map((key) => ({
        key,
        label: PRAYER_LABELS[key],
        swedishName: PRAYER_SWEDISH_NAMES[key],
        icon: PRAYER_ICONS[key],
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

  const cityValue = settings.manualLocation?.name ?? 'Stockholm';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="close" fallback="/bonetider" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>Inställningar</Text>

        {/* --- Core IA: Plats / Beräkning / Förhandsvisning / Notiser / Visning --- */}

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
              { value: 'gps', label: 'GPS (min plats)', icon: 'crosshairs-gps' },
              { value: 'manual', label: 'Välj stad', icon: 'city' },
            ]}
            value={settings.locationMode}
            onChange={(locationMode) => update({ locationMode })}
          />
          {settings.locationMode === 'gps' ? (
            // "Uppdatera position" is an action — accent reads as a tappable verb
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
                  ? 'Hämtar position'
                  : justUpdated
                    ? 'Position uppdaterad'
                    : 'Uppdatera position'
              }
            >
              {justUpdated && !locating ? (
                <View style={styles.rowActionConfirm}>
                  <MaterialIcons name="check-circle" size={18} color={colors.accent} />
                  <Text style={styles.rowAction}>Uppdaterad</Text>
                </View>
              ) : (
                <Text style={styles.rowAction}>
                  {locating ? 'Hämtar position…' : 'Uppdatera position'}
                </Text>
              )}
              <Text style={styles.rowValue}>{source === 'gps' ? label : '—'}</Text>
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
                <Text style={styles.rowValue}>{cityValue}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
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
          accessibilityLabel={`Beräkning: ${methodLabel(settings)}. Tryck för att ändra.`}
          style={({ pressed }) => [styles.card, styles.cardRow, pressed && styles.rowPressed]}
        >
          <Text style={styles.rowLabel}>Beräkning</Text>
          <View style={styles.rowTrailing}>
            <Text style={styles.rowValue}>{methodLabel(settings)}</Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.textMuted} />
          </View>
        </Pressable>

        {/* Förhandsvisning — collapsed by default. A verifier folded inside the
            settings screen (NOT a separate route) so the user can confirm that
            their picks produce sensible times for today, without the prayer
            list occupying the prime above-the-fold real estate of a screen
            whose job is configuration. Summary line carries today's date +
            place so the collapsed header alone still says "what this would
            show". */}
        <DisclosureGroup title="Förhandsvisa bönetider" summary={preview.gregorian}>
          <View>
            <View style={styles.previewHead}>
              <Text style={styles.previewDate}>{preview.gregorian}</Text>
              <Text style={styles.previewHijri}>{preview.hijri}</Text>
            </View>
            {preview.times.map((p, i) => (
              <View key={p.key} style={[styles.previewRow, i > 0 && styles.previewDivider]}>
                <MaterialCommunityIcons
                  name={p.icon}
                  size={22}
                  color={colors.textMuted}
                  style={styles.previewIcon}
                />
                <View style={styles.previewLabelWrap}>
                  <Text style={styles.previewLabel}>{p.label}</Text>
                  <Text style={styles.previewSwedish}>{p.swedishName}</Text>
                </View>
                <Text testID={`preview-time-${p.key}`} style={styles.previewTime}>
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
          footnote={
            settings.notifications.enabled
              ? 'Planeras lokalt på din enhet – inget skickas online.'
              : undefined
          }
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

        {/* Utseende och format — appearance first (Tema, Karttyp), then the format
            knobs (Avrundning, Hijri). The order mirrors the group title ("utseende"
            then "format") and the collapsed summary, and surfaces the one control a
            user actually reaches for here — the light/dark theme — at the very top. */}
        <DisclosureGroup title="Utseende och format" summary={visningSummary()}>
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

          {/* Karttyp — pick the Bönetider basemap. Nordic is the custom calm
              cartography (the visual identity). Standard / Satellit appear only
              when a MapTiler key is bundled — the picker hides them otherwise so
              a tap doesn't silently fall back. The solar wash + city overlay
              keep working on every style. */}
          {MAP_STYLE_OPTIONS.length > 1 ? (
            <SubGroup
              styles={styles}
              title="Karttyp"
              footnote="Påverkar bara Bönetider-kartan. Solens drag visas på alla."
              divider
            >
              <OptionGroup
                options={MAP_STYLE_OPTIONS}
                value={settings.mapStyle}
                onChange={(mapStyle) => update({ mapStyle })}
              />
            </SubGroup>
          ) : null}

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
            <LinkRow
              styles={styles}
              colors={colors}
              label="Vanliga frågor"
              onPress={() => router.push('/(settings)/vanliga-fragor')}
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
    // Two-line label block: Arabic name body weight, Swedish translation
    // caption-muted below.
    previewLabelWrap: { flex: 1 },
    previewLabel: { ...type.body, color: colors.text },
    previewSwedish: { ...type.caption, color: colors.textMuted, marginTop: 1 },
    previewTime: { ...type.body, ...mono, color: colors.text },

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
    },
    rowPressed: { backgroundColor: colors.accentSoft },
    rowLabel: { ...type.body, color: colors.text }, // labels: ink (not accent)
    rowAction: { ...type.body, color: colors.accent }, // verbs: accent
    // The momentary "Uppdaterad ✓" confirmation slot — icon + accent text in the same
    // optical position as the verb, so the swap reads as the verb's success state.
    rowActionConfirm: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowValue: { ...type.body, color: colors.textMuted },
    rowTrailing: { flexDirection: 'row', alignItems: 'center', gap: 2 },

    // Single-row card variant for the Beräkning push.
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
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

    // Centered, faintest ink, no card chrome — a paper-edge colophon.
    colophon: {
      ...type.micro,
      color: colors.textMuted,
      textAlign: 'center',
      opacity: 0.7,
      marginTop: space.sm,
    },
    // OTA line — quieter still than the colophon (smaller opacity, no bottom air
    // until the screen end), so it reads as a subsidiary debug-y imprint, not as
    // a second sign-off.
    colophonSub: {
      ...type.micro,
      color: colors.textMuted,
      textAlign: 'center',
      opacity: 0.45,
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
