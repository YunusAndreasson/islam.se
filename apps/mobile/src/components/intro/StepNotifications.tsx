// Step 3 — reminders.
//
// This is the app's one shot: iOS grants exactly one notification prompt per install, and
// firing it cold spends it on a moment the user never asked for. So the step explains
// first, and only the button asks — through useNotificationPermission, the same hook the
// settings screen's master toggle uses.
//
// The per-prayer list appears only AFTER an answer, and only when reminders ended up on.
// Asking "which prayers?" before "do you want reminders at all?" is a question about a
// thing that does not exist yet, and showing five dead toggles under a blocked permission
// would be worse.
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingSection } from '@/components/settings/SettingSection';
import { Toggle } from '@/components/settings/Toggle';
import { hapticSuccess } from '@/lib/haptics';
import { noteNotificationResolved } from '@/lib/notification-hint';
import { NOTIFY_PRAYERS } from '@/lib/notifications';
import { useNotificationPermission } from '@/lib/notifications-permission';
import { PRAYER_LABELS, PRAYER_SWEDISH_NAMES } from '@/lib/prayer-times';
import { useSettings } from '@/lib/settings/context';
import {
  openSystemSettings,
  openSystemSettingsA11yLabel,
  openSystemSettingsLabel,
  systemSettingsName,
} from '@/lib/system-settings';
import { type Palette, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

export function StepNotifications() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { settings, update } = useSettings();
  const notifications = useNotificationPermission();
  // Replaying the introduction is a review of existing choices, not a fresh permission
  // funnel. If reminders are already enabled, show their current prayer choices instead
  // of asking the reader to "turn on" something that is visibly on in Settings.
  const [answered, setAnswered] = useState(() => settings.notifications.enabled);
  // Synchronous double-tap guard, same reasoning as NotificationHint's.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const settingsName = systemSettingsName();

  const onEnable = (): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    void (async () => {
      const state = await notifications.setEnabled(true);
      // The OS answered — granted or refused — so the map's soft-ask card has nothing
      // left to offer. Skipping this step records NOTHING on purpose, which is what
      // leaves the card its later, calmer chance.
      await noteNotificationResolved();
      if (state === 'granted') hapticSuccess();
      // The warning haptic for a refusal already fired inside setEnabled.
      setAnswered(true);
      inFlight.current = false;
      setBusy(false);
    })();
  };

  const setPrayer = (key: (typeof NOTIFY_PRAYERS)[number], value: boolean): void => {
    update({
      notifications: {
        ...settings.notifications,
        prayers: { ...settings.notifications.prayers, [key]: value },
      },
    });
  };

  if (!answered) {
    return (
      <View style={styles.wrap}>
        <Pressable
          onPress={onEnable}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Slå på påminnelser om bönetider"
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        >
          <MaterialIcons name="notifications-none" size={18} color={c.onAccent} />
          <Text style={styles.ctaText}>Slå på påminnelser</Text>
        </Pressable>
      </View>
    );
  }

  if (notifications.blocked) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.problem}>
          Notiser är blockerade. Öppna {settingsName} för att tillåta dem.
        </Text>
        <Pressable
          onPress={openSystemSettings}
          accessibilityRole="button"
          accessibilityLabel={openSystemSettingsA11yLabel('notiser')}
          style={({ pressed }) => [styles.link, pressed && styles.pressedQuiet]}
        >
          <Text style={styles.linkText}>{openSystemSettingsLabel()}</Text>
          <MaterialIcons name="open-in-new" size={18} color={c.accent} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.done}>
        <MaterialIcons name="check-circle" size={20} color={c.highlight} />
        <Text style={styles.doneText}>Du får en notis när det är dags för bön.</Text>
      </View>
      {/* Sunrise is deliberately absent: Shurūq is a MARKER that closes Fajr's window,
          not a prayer, and its opt-in warning lives in Notiser where it can be explained.
          NOTIFY_PRAYERS is the five — see lib/notifications. */}
      <SettingSection title="Vilka böner?">
        {NOTIFY_PRAYERS.map((key, i) => (
          <Toggle
            key={key}
            label={PRAYER_LABELS[key]}
            description={PRAYER_SWEDISH_NAMES[key]}
            value={settings.notifications.prayers[key]}
            onValueChange={(v) => setPrayer(key, v)}
            divider={i > 0}
          />
        ))}
      </SettingSection>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { gap: space.md },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      minHeight: 48,
      paddingHorizontal: space.lg,
      borderRadius: radius.round,
      backgroundColor: c.accent,
    },
    ctaText: { ...type.bodyStrong, color: c.onAccent },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      minHeight: 44,
    },
    linkText: { ...type.bodyStrong, color: c.accent },
    problem: { ...type.body, color: c.inkMuted },
    done: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
    doneText: { ...type.body, color: c.ink, flex: 1 },
    pressed: { opacity: 0.85 },
    pressedQuiet: { opacity: 0.6 },
  });
}
