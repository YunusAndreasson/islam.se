// The one place the map asks to use where you are.
//
// Prayer times ARE a function of position — 20 minutes wrong in Malmö if the app falls
// back to Stockholm — so this is the more consequential of the app's two permissions.
// Which is exactly why it must not be asked badly. It used to fire from a mount effect:
// the OS alert landed on top of the daybreak intro, before the user had seen a single
// prayer time, and iOS spends that dialog once. A reflexive "Don't allow" then left the
// app permanently on a fallback city with only an Inställningar footnote to say so.
//
// So the same SOFT ASK as NotificationHint: the card explains first, and ONLY its CTA
// calls into the location context's prompting path. The ✕ closes the card and touches
// nothing — the OS prompt stays unspent. See lib/location-hint.ts for how often it may
// appear, and bonetider.tsx for the queue that guarantees it never stacks with the
// notification card.
//
// It carries a second action the notification card has no equivalent for: "Välj stad i
// stället". Location is the one permission with a real alternative — picking a city by
// hand gives correct times without granting anything — so the card offers that door in
// every state where the primary path has not succeeded, including a refusal.
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, useReducedMotion } from 'react-native-reanimated';

import { hapticSuccess, hapticWarning } from '../../lib/haptics';
import { useLocationStatus } from '../../lib/location/context';
import { noteLocationResolved } from '../../lib/location-hint';
import { motion, type Palette, radius, shadow, space, type } from '../../theme/tokens';
import { useColors } from '../../theme/useColors';
import { GlassRoundButton } from '../nav/GlassRoundButton';
import { GlassSurface } from '../ui/GlassSurface';

/** How long the "Använder din plats" confirmation lingers before the card retires itself. */
const CONFIRM_MS = 1600;

interface Props {
  /** Distance in dp from the screen top — set by the caller to clear the nav discs. */
  top: number;
  /** Retire the card: dismissed, or finished after an answer. */
  onClose: () => void;
}

type CardState = 'ask' | 'granted' | 'denied' | 'error';

export function LocationHint({ top, onClose }: Props) {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();
  const { refresh } = useLocationStatus();
  const [state, setState] = useState<CardState>('ask');
  // Two taps inside one frame both read the same pre-update state, so the in-flight guard
  // has to be a ref (written synchronously) — `busy` state alone would let a double-tap
  // put two OS dialogs in flight. The state exists only to grey the button out.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  const systemSettingsName = Platform.OS === 'ios' ? 'iOS-inställningar' : 'appinställningar';

  const onAllow = (): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    void (async () => {
      // refresh() IS the prompting path (LocationProvider.acquireGps) — the card does not
      // call expo-location itself, so the fix it wins lands in the context that the map,
      // the dock and the notification scheduler all read.
      const outcome = await refresh();
      if (outcome === 'busy') {
        // A fix was already in flight, so nothing was asked and nothing was answered.
        // Re-arm the button rather than spending the card's one resolution on a no-op.
        inFlight.current = false;
        setBusy(false);
        return;
      }
      await noteLocationResolved();
      if (outcome === 'ok') {
        // A discrete outcome the user just triggered — the haptics policy's success case.
        hapticSuccess();
        setState('granted');
        confirmTimer.current = setTimeout(onClose, CONFIRM_MS);
        return;
      }
      hapticWarning();
      // Stay on screen for both failures: a refusal (or location services being off at
      // the OS level) with no visible way back is a dead end, so the card becomes the
      // route onward. The user closes it themselves.
      setState(outcome === 'denied' ? 'denied' : 'error');
      inFlight.current = false;
      setBusy(false);
    })();
  };

  const pickCity = (): void => {
    router.push('/(settings)/byt-plats');
    onClose();
  };

  const title =
    state === 'granted'
      ? 'Använder din plats'
      : state === 'error'
        ? 'Platsen kunde inte hämtas'
        : 'Visa tider för din plats';

  return (
    <Animated.View
      // Mirror of NotificationHint's slide: it lives at the top, so it arrives from above.
      // Skipped entirely under Reduce Motion — the card still appears, just without travel.
      entering={reduceMotion ? undefined : FadeInUp.duration(motion.base)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(motion.fast)}
      style={[styles.wrap, { top }]}
      // box-none so the map stays draggable everywhere except the card itself.
      pointerEvents="box-none"
      // The card arrives unprompted, so TalkBack would otherwise never mention it.
      // (Android-only; the prop is inert on iOS, where it is reachable by swipe as usual.)
      accessibilityLiveRegion="polite"
    >
      <GlassSurface style={styles.card} borderRadius={radius.xl} tint={c.cardGlass}>
        <View style={styles.header}>
          <MaterialIcons
            name={
              state === 'granted' ? 'location-on' : state === 'ask' ? 'my-location' : 'location-off'
            }
            size={20}
            color={state === 'granted' ? c.highlight : c.accent}
            style={styles.icon}
          />
          {/* Two lines, like NotificationHint's title: at 20/700 a 320 dp phone leaves
              only ~186 dp once the icon, gap and close disc are subtracted, and wrapping
              is the graceful failure. */}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <GlassRoundButton
            onPress={onClose}
            accessibilityLabel="Stäng"
            tint={c.cardGlass}
            rim={c.hairline}
            size={34}
          >
            <MaterialIcons name="close" size={18} color={c.inkMuted} />
          </GlassRoundButton>
        </View>

        {state === 'ask' ? (
          <>
            <Text style={styles.body}>
              Bönetiderna räknas ut för din plats. Platsen stannar i din enhet – inget skickas
              online.
            </Text>
            <Pressable
              onPress={onAllow}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Använd min plats för bönetider"
              accessibilityState={{ disabled: busy }}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            >
              <Text style={styles.ctaText}>Använd min plats</Text>
            </Pressable>
          </>
        ) : null}

        {state === 'denied' ? (
          // Same sentence as Inställningar → Plats, so the two surfaces agree word for word.
          <Text style={styles.body}>
            Platsåtkomst nekad – visar standardplats. Tillåt i {systemSettingsName}.
          </Text>
        ) : null}

        {state === 'error' ? (
          <Text style={styles.body}>
            Kontrollera att platstjänster är på, eller välj en stad så räknas tiderna ut för den.
          </Text>
        ) : null}

        {state === 'denied' ? (
          <Pressable
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel={`Öppna ${systemSettingsName} för plats`}
            style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          >
            <Text style={styles.linkText}>Öppna {systemSettingsName}</Text>
            <MaterialIcons name="open-in-new" size={18} color={c.accent} />
          </Pressable>
        ) : null}

        {/* The alternative route, offered in every state where the user does not have a
            working fix. Quiet text, not a second filled button — the CTA above is the
            recommended path, this is the way around it. */}
        {state === 'granted' ? (
          <Text style={styles.body}>Bönetiderna räknas ut där du är.</Text>
        ) : (
          <Pressable
            onPress={pickCity}
            accessibilityRole="button"
            accessibilityLabel="Välj stad i stället"
            style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
          >
            <Text style={styles.linkText}>Välj stad i stället</Text>
            <MaterialIcons name="chevron-right" size={18} color={c.accent} />
          </Pressable>
        )}
      </GlassSurface>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // Inset from both edges like NotificationHint — a callout floating over the map, not
    // a bar welded across it. `top` comes from the caller (it depends on the safe area).
    wrap: {
      position: 'absolute',
      left: space.lg,
      right: space.lg,
    },
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.hairline,
      padding: space.lg,
      gap: space.md,
      ...shadow.card,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    // Nudged down a hair so the glyph sits on the title's optical centre, not its box top.
    icon: { marginTop: 1 },
    title: { ...type.headline, color: c.ink, flex: 1 },
    body: { ...type.caption, color: c.inkMuted },
    // Filled indigo action — the app's interactive accent, same as NotificationHint's.
    cta: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: space.lg,
      borderRadius: radius.round,
      backgroundColor: c.accent,
    },
    ctaPressed: { opacity: 0.85 },
    ctaText: { ...type.bodyStrong, color: c.onAccent },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      minHeight: 44,
    },
    linkPressed: { opacity: 0.6 },
    linkText: { ...type.bodyStrong, color: c.accent },
  });
}
