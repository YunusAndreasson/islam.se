// The one place the map tells you prayer reminders exist.
//
// Notifications are what a prayer app must do that a beautiful viewer can't — tell
// you it's time even when the app is closed — yet they ship off, and the only way to
// find them is Inställningar → Notiser. So the map offers them once, after the
// daybreak intro has finished: a glass callout that says what reminders are, and one
// button that turns them on.
//
// It is a SOFT ASK, and that is the whole design. iOS grants exactly one notification
// prompt per install; firing it cold at launch spends that single chance on a moment
// the user never asked for, and a reflexive "Don't allow" is then permanent. So the
// card explains first and ONLY the CTA calls requestNotificationPermission(). The ✕
// closes the card and touches nothing — the OS prompt stays unspent, and the offer is
// still there in Inställningar. See lib/notification-hint.ts for how often it appears.
//
// Visually it is MosqueCard's twin — same glass material, radius, hairline, shadow and
// filled-accent CTA — just anchored to the top instead of the bottom, so it belongs to
// the same family as the dock and the nav discs rather than reading as an ad banner.
import { useCardInsets } from '@/theme/window-layout';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, useReducedMotion } from 'react-native-reanimated';

import { ANALYTICS_EVENTS, analytics } from '@/lib/analytics';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { noteNotificationResolved, recordReminderDenial } from '@/lib/notification-hint';
import { beginNotificationPreferenceIntent } from '@/lib/notifications-permission';
import {
  openNotificationSettings,
  openSystemSettingsA11yLabel,
  openSystemSettingsLabel,
  notificationsBlockedMessage,
} from '@/lib/system-settings';
import {
  type NotificationPermissionState,
  requestNotificationPermission,
} from '@/lib/notifications';
import { motion, type Palette, radius, shadow, space, type } from '@/theme/tokens';
import { useSkyGlass } from '@/theme/skyChrome';
import { useColors } from '@/theme/useColors';
import { GlassRoundButton } from '@/components/nav/GlassRoundButton';
import { GlassSurface } from '@/components/ui/GlassSurface';
import { Icon } from '@/components/ui/Icon';

/** How long the "Påminnelser är på" confirmation lingers before the card retires itself. */
const CONFIRM_MS = 1600;

interface Props {
  /** Distance in dp from the screen top — set by the caller to clear the nav discs. */
  top: number;
  /** Commit the master switch after a full grant. */
  onEnable: () => void;
  /** Retire the card: dismissed, or finished after an answer. */
  onClose: () => void;
}

type CardState = 'ask' | 'granted' | 'denied';

export function NotificationHint({ top, onEnable, onClose }: Props) {
  const cardInsets = useCardInsets(space.lg);
  const c = useColors();
  const sky = useSkyGlass();
  const styles = useMemo(() => makeStyles(c), [c]);
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState<CardState>('ask');
  // Two taps inside one frame both read the same pre-update state, so the in-flight guard
  // has to be a ref (written synchronously) — `busy` state alone would let a double-tap
  // put two OS dialogs in flight. The state exists only to grey the button out.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  useEffect(
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
      };
    },
    [],
  );

  const onAllow = (): void => {
    if (inFlight.current) return;
    inFlight.current = true;
    const isLatestIntent = beginNotificationPreferenceIntent();
    setBusy(true);
    void (async () => {
      const result: NotificationPermissionState = await requestNotificationPermission('map_card');
      await noteNotificationResolved();
      if (!isLatestIntent()) {
        inFlight.current = false;
        if (mounted.current) setBusy(false);
        return;
      }
      if (result === 'granted') onEnable();
      if (result === 'denied') await recordReminderDenial();
      // The permission answer still updates preferences after dismissal; the
      // card's haptics and delayed close belong only to its visible lifetime.
      if (!mounted.current) return;
      if (result === 'granted') {
        // A discrete outcome the user just triggered — the haptics policy's success case.
        hapticSuccess();
        setState('granted');
        confirmTimer.current = setTimeout(onClose, CONFIRM_MS);
      } else {
        hapticWarning();
        // Stay on screen: a refusal with no visible way back is a dead end, so the card
        // becomes the route into system settings. The user closes it themselves.
        setState('denied');
        inFlight.current = false;
        setBusy(false);
      }
    })();
  };

  // The ✕, as distinct from the card retiring itself after a grant: Permission Card Closed
  // says the reader sent it away, and in which state.
  const close = (): void => {
    void analytics.track(ANALYTICS_EVENTS.PERMISSION_CARD_CLOSED, { permission: 'notifications', state });
    onClose();
  };

  return (
    <Animated.View
      // Mirror of MosqueCard's slide: it lives at the top, so it arrives from above.
      // Skipped entirely under Reduce Motion — the card still appears, just without travel.
      entering={reduceMotion ? undefined : FadeInUp.duration(motion.base)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(motion.fast)}
      style={[styles.wrap, cardInsets, { top }]}
      // box-none so the map stays draggable everywhere except the card itself.
      pointerEvents="box-none"
      // Unlike MosqueCard — which opens because the user tapped a mosque — this card
      // arrives unprompted, so TalkBack would otherwise never mention it. (Android-only;
      // the prop is inert on iOS, where the card is reachable by swipe as usual.)
      accessibilityLiveRegion="polite"
    >
      <GlassSurface style={styles.card} borderRadius={radius.xl} tint={sky.cardGlass}>
        <View style={styles.header}>
          <Icon
            name={state === 'granted' ? 'notificationsOn' : 'notificationsOff'}
            size={20}
            color={state === 'granted' ? c.highlight : c.accent}
            style={styles.icon}
          />
          {/* Two lines, like MosqueCard's name: at 20/700 the title needs ~209 dp, and a
              320 dp-wide phone leaves only ~186 dp once the icon, gap and close disc are
              subtracted. Wrapping is the graceful failure; "Påminn om böneti…" is not. */}
          <Text style={styles.title} numberOfLines={2}>
            {state === 'granted' ? 'Påminnelser är på' : 'Påminn om bönetider'}
          </Text>
          <GlassRoundButton
            onPress={close}
            accessibilityLabel="Stäng"
            tint={sky.cardGlass}
            rim={c.hairline}
            size={34}
          >
            <Icon name="close" size={18} color={c.inkMuted} />
          </GlassRoundButton>
        </View>

        {state === 'ask' ? (
          <>
            <Text style={styles.body}>
              Få en notis när det är dags för bön.
            </Text>
            <Pressable
              onPress={onAllow}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Slå på påminnelser om bönetider"
              accessibilityState={{ disabled: busy }}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            >
              <Text style={styles.ctaText}>Slå på påminnelser</Text>
            </Pressable>
          </>
        ) : null}

        {state === 'denied' ? (
          <>
            {/* Same sentence as Inställningar → Notiser, so the two surfaces agree word for word. */}
            <Text style={styles.body}>
              {notificationsBlockedMessage()}
            </Text>
            <Pressable
              onPress={openNotificationSettings}
              accessibilityRole="button"
              accessibilityLabel={openSystemSettingsA11yLabel('notiser')}
              style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
            >
              <Text style={styles.linkText}>{openSystemSettingsLabel()}</Text>
              <Icon name="externalLink" size={18} color={c.accent} />
            </Pressable>
          </>
        ) : null}

        {state === 'granted' ? (
          <Text style={styles.body}>Du får en notis när det är dags för bön.</Text>
        ) : null}
      </GlassSurface>
    </Animated.View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    // Inset from both edges like MosqueCard — a callout floating over the map, not a
    // bar welded across it. `top` comes from the caller (it depends on the safe area).
    wrap: {
      position: 'absolute',
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
    // Filled indigo action — the app's interactive accent, same as MosqueCard's
    // "Vägbeskrivning". onAccent text so the label reads on the fill in both themes.
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
    // The denied route is a quiet text action, not a second filled button — the user
    // already declined once; this is a door, not another ask.
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
