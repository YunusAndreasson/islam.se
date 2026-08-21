// Step 2 — where are you?
//
// The whole point of putting this in a wizard is that the OS dialog gets a sentence in
// front of it. Nothing here calls expo-location: the button goes through
// useLocationStatus().refresh(), the same prompting path the map's LocationHint uses, so
// the fix lands in the context the map, the dock and the notification scheduler all read.
//
// A refusal is not a dead end — "Välj stad" is a first-class alternative, not a
// consolation prize, and it opens the same PlacePicker the settings route uses. That is
// also why this step never blocks: the user can walk past it and the app falls back to
// Stockholm (see lib/location/resolve), which the dock is honest about.
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PlacePicker } from '@/components/settings/PlacePicker';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { Icon } from '@/components/ui/Icon';
import { useLocationStatus } from '@/lib/location/context';
import { noteLocationResolved } from '@/lib/location-hint';
import type { SwedishPlace } from '@/lib/places/data';
import { useSettings } from '@/lib/settings/context';
import {
  openSystemSettings,
  openSystemSettingsA11yLabel,
  openSystemSettingsLabel,
  systemSettingsName,
} from '@/lib/system-settings';
import { type Palette, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

type Phase = 'ask' | 'granted' | 'denied' | 'error' | 'picking';

export function StepLocation() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { settings, update } = useSettings();
  const { refresh } = useLocationStatus();
  const [phase, setPhase] = useState<Phase>('ask');
  // Two taps inside one frame both read the same pre-update state, so the in-flight guard
  // has to be a ref (written synchronously) — `busy` alone would let a double-tap put two
  // OS dialogs in flight. The state exists only to grey the button out.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const settingsName = systemSettingsName();

  const onUseGps = (): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    void (async () => {
      try {
        const outcome = await refresh();
        if (outcome === 'busy') {
          // A fix was already in flight, so nothing was asked and nothing was answered.
          return;
        }
        // The OS gave a definitive answer, so the map's soft-ask card has nothing left to
        // offer — record it against the same store the card uses. Skipping this step
        // deliberately records NOTHING, which is what leaves the card its later chance.
        await noteLocationResolved();
        if (outcome === 'ok') {
          hapticSuccess();
          // GPS is already the default mode, but say so explicitly: a user replaying the
          // intro after having picked a city expects "Använd min plats" to mean it.
          update({ locationMode: 'gps' });
          setPhase('granted');
          return;
        }
        hapticWarning();
        setPhase(outcome === 'denied' ? 'denied' : 'error');
      } finally {
        // Always released, including on the 'ok' path: `error` keeps the button on screen
        // for a second attempt, so a guard left stuck true would make that button dead.
        inFlight.current = false;
        setBusy(false);
      }
    })();
  };

  const onPickPlace = (p: SwedishPlace): void => {
    update({
      locationMode: 'manual',
      manualLocation: { name: p.name, latitude: p.lat, longitude: p.lon },
    });
    setPhase('granted');
  };

  if (phase === 'picking') {
    return <PlacePicker selected={settings.manualLocation} onPick={onPickPlace} />;
  }

  const chosen =
    settings.locationMode === 'manual' ? settings.manualLocation?.name : 'Din plats';

  return (
    <View style={styles.wrap}>
      {phase === 'granted' ? (
        <View style={styles.done}>
          <Icon name="checkCircle" size={20} color={c.highlight} />
          <Text style={styles.doneText}>Tiderna räknas ut för {chosen ?? 'din plats'}.</Text>
        </View>
      ) : (
        <>
          {phase === 'denied' ? (
            // Word for word what Inställningar and the map's card say, so the three
            // surfaces never disagree about what happened.
            <Text style={styles.problem}>
              Platsåtkomst nekad – visar standardplats. Tillåt i {settingsName}.
            </Text>
          ) : null}
          {phase === 'error' ? (
            <Text style={styles.problem}>
              Kontrollera att platstjänster är på, eller välj en stad så räknas tiderna ut för
              den.
            </Text>
          ) : null}

          {/* `error` means services off or a timed-out fix (see GpsOutcome) — transient,
              unlike `denied`, which the OS will not re-prompt for. So the button stays on
              screen after an error: the message above tells the user what to check, and
              this is what they tap once they have. Offering only "Välj stad i stället"
              there made one indoor timeout the end of the recommended path.

              Its label never changes. The same action keeps the same name across the
              whole flow, matching Inställningar's own "Uppdatera plats" row, which is
              likewise stable across outcomes — the error text carries the news, not the
              button. */}
          {phase === 'ask' || phase === 'error' ? (
            <Pressable
              onPress={onUseGps}
              disabled={busy}
              accessibilityRole="button"
              // A fix can take tens of seconds on a cold start, so the wait is announced
              // as well as drawn — the same wording Inställningar uses while locating.
              accessibilityLabel={busy ? 'Hämtar plats' : 'Använd min plats'}
              accessibilityState={{ disabled: busy, busy }}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={c.onAccent} />
              ) : (
                <Icon name="myLocation" size={18} color={c.onAccent} />
              )}
              <Text style={styles.ctaText}>{busy ? 'Hämtar plats…' : 'Använd min plats'}</Text>
            </Pressable>
          ) : null}

          {phase === 'denied' ? (
            <Pressable
              onPress={openSystemSettings}
              accessibilityRole="button"
              accessibilityLabel={openSystemSettingsA11yLabel('plats')}
              style={({ pressed }) => [styles.link, pressed && styles.pressedQuiet]}
            >
              <Text style={styles.linkText}>{openSystemSettingsLabel()}</Text>
              <Icon name="externalLink" size={18} color={c.accent} />
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => setPhase('picking')}
            accessibilityRole="button"
            accessibilityLabel="Välj stad i stället"
            style={({ pressed }) => [styles.link, pressed && styles.pressedQuiet]}
          >
            <Text style={styles.linkText}>Välj stad i stället</Text>
          </Pressable>
        </>
      )}
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
    // The alternatives are quiet text actions, not a second filled button: there is one
    // recommended path per step, and two equal-weight buttons would make the user choose
    // before they have any reason to prefer either.
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
